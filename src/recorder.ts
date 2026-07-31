import type { Page, BrowserContext, ConsoleMessage, Frame, Request as PWRequest } from 'playwright';
import path from 'path';
import { CodegenActionData, ConsoleLogEntry, FrameContext, NetworkRequest, RecordedAction, SessionMetadata, RecorderOptions, TargetSnapshot } from './types';
import { getDomCleanerScript } from './snapshot/dom-cleaner';
import { captureAccessibilityTree } from './snapshot/accessibility';
import { captureTargetElement } from './snapshot/target-element';
import { writeScreenshot } from './utils/fs-helpers';
import { JsonlWriter } from './utils/jsonl-writer';
import { withTimeout } from './utils/with-timeout';

function formatActionLine(
  index: number,
  actionData: CodegenActionData,
  target: TargetSnapshot | null,
  failed: boolean,
  maxActions?: number
): string {
  const num = String(index).padStart(3, '0');
  const indexPart = maxActions ? `${num}/${String(maxActions).padStart(3, '0')}` : num;
  const type = actionData.action.name.padEnd(10);

  let description = '';
  switch (actionData.action.name) {
    case 'navigate':
      description = actionData.action.url ?? actionData.action.selector ?? '';
      break;
    case 'fill':
    case 'select': {
      const name = target?.accessibleName || actionData.action.selector || '';
      const role = target?.role ? `${target.role} ` : '';
      const val = actionData.action.text !== undefined ? ` = "${actionData.action.text}"` : '';
      description = `${role}"${name}"${val}`;
      break;
    }
    case 'press':
      description = actionData.action.key ?? '';
      break;
    default: {
      if (target?.accessibleName && target.role) {
        description = `${target.role} "${target.accessibleName}"`;
      } else {
        description = actionData.action.selector ?? '';
      }
    }
  }

  const warn = failed ? '  \x1b[33m⚠ capture failed\x1b[0m' : '';
  const color = failed ? '\x1b[33m' : '\x1b[32m';
  return `${color}[${indexPart}]\x1b[0m ${type} → ${description}${warn}`;
}

const QUEUE_DRAIN_TIMEOUT_MS = 5000;
const NETWORK_MAX_BODY_CHARS = 10 * 1024;
// Бюджет на один захват. Зависшая страница не должна вставлять очередь: лучше
// действие без снимка, чем потерянные из-за истёкшего QUEUE_DRAIN_TIMEOUT_MS действия
const CAPTURE_TIMEOUT_MS = 3000;

export class Recorder {
  private context: BrowserContext;
  private page: Page;
  private outputDir: string;
  private options: RecorderOptions;
  private actionIndex = 0;
  private startedAt: string;
  private startUrl: string;
  private actionQueue: Promise<void> = Promise.resolve();
  // For overwriting on actionUpdated (codegen merges keystrokes into fill)
  private lastActionIndex = 0;
  // JSONL written incrementally; only the last line is buffered for actionUpdated overwrite
  private actionsWriter: JsonlWriter;
  private snapshotsWriter: JsonlWriter;
  // Console logs accumulated between actions
  private pendingConsoleLogs: ConsoleLogEntry[] = [];
  // Network requests accumulated between actions
  private pendingNetworkPromises: Array<Promise<NetworkRequest | null>> = [];
  // Tracks request start time + post body by request object identity
  private requestDataMap = new Map<PWRequest, { startTime: number; timestamp: string; postData?: string }>();
  // Callback to stop on max-actions
  private onMaxActionsReached?: () => void;
  private needsProtocolFallback: boolean;
  // Whether the current progress line has not been terminated with \n yet
  private progressLineActive = false;

  constructor(context: BrowserContext, page: Page, startUrl: string, options: RecorderOptions, needsProtocolFallback = false) {
    this.context = context;
    this.page = page;
    this.outputDir = options.outputDir;
    this.options = options;
    this.startedAt = new Date().toISOString();
    this.startUrl = startUrl;
    this.needsProtocolFallback = needsProtocolFallback;
    this.actionsWriter = new JsonlWriter(path.join(this.outputDir, 'actions.jsonl'));
    this.snapshotsWriter = new JsonlWriter(path.join(this.outputDir, 'snapshots.jsonl'));
  }

  /** Terminates the pending progress line so other output starts on a fresh line. */
  private endProgressLine(): void {
    if (!this.progressLineActive) return;
    process.stdout.write('\n');
    this.progressLineActive = false;
  }

  async start(): Promise<void> {
    // Subscribe to console logs
    if (this.options.captureConsole !== false) {
      this.page.on('console', (msg: ConsoleMessage) => {
        this.pendingConsoleLogs.push({
          level: msg.type() as ConsoleLogEntry['level'],
          text: msg.text(),
          timestamp: new Date().toISOString(),
        });
      });
      this.page.on('pageerror', (error: Error) => {
        this.pendingConsoleLogs.push({
          level: 'pageerror',
          text: error.message,
          timestamp: new Date().toISOString(),
        });
      });
    }

    // Subscribe to XHR/fetch network requests
    if (this.options.captureNetwork !== false) {
      this.page.on('request', (request: PWRequest) => {
        const type = request.resourceType();
        if (type !== 'xhr' && type !== 'fetch') return;
        this.requestDataMap.set(request, {
          startTime: Date.now(),
          timestamp: new Date().toISOString(),
          postData: request.postData() ?? undefined,
        });
      });

      this.page.on('requestfailed', (request: PWRequest) => {
        this.requestDataMap.delete(request);
      });

      this.page.on('response', (response) => {
        const request = response.request();
        const type = request.resourceType();
        if (type !== 'xhr' && type !== 'fetch') return;

        const reqData = this.requestDataMap.get(request);
        this.requestDataMap.delete(request);

        const startTime = reqData?.startTime ?? Date.now();
        const timestamp = reqData?.timestamp ?? new Date().toISOString();

        let requestBody: unknown;
        if (reqData?.postData) {
          try { requestBody = JSON.parse(reqData.postData); }
          catch { requestBody = reqData.postData.slice(0, NETWORK_MAX_BODY_CHARS); }
        }

        const promise = (async (): Promise<NetworkRequest | null> => {
          let responseBody: unknown;
          try {
            const contentType = response.headers()['content-type'] ?? '';
            if (contentType.includes('json') || contentType.includes('text/')) {
              const text = await response.text();
              if (text.length <= NETWORK_MAX_BODY_CHARS) {
                try { responseBody = JSON.parse(text); } catch { responseBody = text; }
              } else {
                responseBody = `[truncated: ${text.length} chars]`;
              }
            }
          } catch { /* non-text or already consumed */ }

          return {
            url: request.url(),
            method: request.method(),
            status: response.status(),
            duration: Date.now() - startTime,
            timestamp,
            ...(requestBody !== undefined && { requestBody }),
            ...(responseBody !== undefined && { responseBody }),
          };
        })();

        this.pendingNetworkPromises.push(promise);
      });
    }

    // Launch codegen GUI inspector
    await (this.context as any)._enableRecorder({
      mode: 'recording',
      language: 'playwright-test',
    });

    // Attach eventSink for action capture
    await (this.context as any)._enableRecorder(
      { mode: 'recording', language: 'playwright-test', recorderMode: 'api' },
      {
        actionAdded: (page: Page, data: CodegenActionData, code: string) => {
          this.enqueueAction(page, data, code, false);
        },
        actionUpdated: (page: Page, data: CodegenActionData, code: string) => {
          this.enqueueAction(page, data, code, true);
        },
      }
    );

    // Auto-detect protocol: try http first, fall back to https
    if (this.needsProtocolFallback) {
      try {
        await this.page.goto(`http://${this.startUrl}`, { waitUntil: 'domcontentloaded' });
        this.startUrl = `http://${this.startUrl}`;
      } catch {
        await this.page.goto(`https://${this.startUrl}`, { waitUntil: 'domcontentloaded' });
        this.startUrl = `https://${this.startUrl}`;
      }
    } else {
      await this.page.goto(this.startUrl, { waitUntil: 'domcontentloaded' });
    }
  }

  /** Register callback to stop on max-actions */
  onStop(callback: () => void): void {
    this.onMaxActionsReached = callback;
  }

  /**
   * Walks framePath (an array of iframe selectors) and returns the target Frame.
   * Returns page for main-frame actions. On failure — graceful fallback to page.
   */
  private async resolveFrame(
    page: Page,
    data: CodegenActionData,
  ): Promise<{ frameContext?: FrameContext; executionContext: Page | Frame }> {
    const framePath = data.frame?.framePath;
    if (!framePath || framePath.length === 0) {
      return { executionContext: page };
    }

    // Honest walk: locator(sel).elementHandle() -> handle.contentFrame() for each level
    let current: Page | Frame = page;
    for (const sel of framePath) {
      try {
        const handle = await current.locator(sel).first().elementHandle({ timeout: 1000 });
        if (!handle) {
          return { executionContext: page };
        }
        const child = await handle.contentFrame();
        await handle.dispose().catch(() => {});
        if (!child) {
          return { executionContext: page };
        }
        current = child;
      } catch {
        return { executionContext: page };
      }
    }

    const frame = current as Frame;
    let frameUrl = '';
    try {
      frameUrl = frame.url();
    } catch {
      frameUrl = '';
    }
    let frameName: string | undefined;
    try {
      frameName = frame.name() || undefined;
    } catch {
      frameName = undefined;
    }

    return {
      frameContext: {
        path: framePath,
        url: frameUrl,
        ...(frameName ? { name: frameName } : {}),
      },
      executionContext: frame,
    };
  }

  private async drainNetworkRequests(): Promise<NetworkRequest[]> {
    if (this.pendingNetworkPromises.length === 0) return [];
    const promises = [...this.pendingNetworkPromises];
    this.pendingNetworkPromises = [];
    const withTimeout = promises.map((p) =>
      Promise.race([
        p.catch(() => null),
        new Promise<null>((r) => setTimeout(() => r(null), 500)),
      ])
    );
    const results = await Promise.all(withTimeout);
    return results.filter((r): r is NetworkRequest => r !== null);
  }

  private enqueueAction(page: Page, data: CodegenActionData, code: string, isUpdate: boolean): void {
    // .catch обязателен: без него первая же ошибка превращает actionQueue в
    // отклонённый промис, и все последующие действия молча не обрабатываются
    this.actionQueue = this.actionQueue.then(() =>
      this.processAction(page, data, code, isUpdate).catch((err) => {
        this.endProgressLine();
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`\x1b[33m⚠ Action #${this.actionIndex} not recorded: ${message}\x1b[0m`);
      })
    );
  }

  private async processAction(
    page: Page,
    data: CodegenActionData,
    code: string,
    isUpdate: boolean,
  ): Promise<void> {
    const actionName = data.action.name;

    // On update (actionUpdated) — overwrite the last action
    let index: number;
    if (isUpdate && this.lastActionIndex > 0) {
      index = this.lastActionIndex;
    } else {
      this.actionIndex++;
      index = this.actionIndex;
    }
    this.lastActionIndex = index;

    const paddedIndex = String(index).padStart(3, '0');
    const timestamp = new Date().toISOString();

    let url: string;
    try {
      url = page.url();
    } catch {
      url = this.startUrl;
    }

    const selector = data.action.selector || '';

    // Wait for DOM stabilization
    try {
      await page.waitForTimeout(100);
    } catch {
      // Page may have been closed
    }

    // Resolve frame (if the action happened inside an iframe)
    const { frameContext, executionContext } = await withTimeout(
      this.resolveFrame(page, data),
      CAPTURE_TIMEOUT_MS,
      'frame resolution',
    ).catch(() => ({ frameContext: undefined, executionContext: page as Page | Frame }));

    // Capture target + selectors (skipped for actions without a selector, e.g. navigate)
    let targetResult: Awaited<ReturnType<typeof captureTargetElement>> | null = null;
    if (selector) {
      try {
        targetResult = await withTimeout(
          captureTargetElement(executionContext, selector),
          CAPTURE_TIMEOUT_MS,
          'target element',
        );
      } catch {
        targetResult = null;
      }
    }

    // Capture snapshots
    let accessibilityTree: unknown = null;
    let cleanedDom = '';
    let hasFailed = false;

    try {
      // a11y snapshot is taken from page (Playwright Frame has no accessibility API)
      accessibilityTree = await withTimeout(captureAccessibilityTree(page), CAPTURE_TIMEOUT_MS, 'accessibility snapshot');
    } catch {
      accessibilityTree = { error: 'failed to capture' };
      hasFailed = true;
    }

    try {
      // DOM cleaner runs inside the resolved frame's context
      cleanedDom = await withTimeout(
        executionContext.evaluate(getDomCleanerScript()),
        CAPTURE_TIMEOUT_MS,
        'DOM snapshot',
      );
    } catch {
      cleanedDom = '<error>failed to capture DOM</error>';
      hasFailed = true;
    }

    // Screenshot
    let screenshotFile: string | null = null;
    if (this.options.screenshots) {
      try {
        const screenshotPath = path.join(this.outputDir, 'screenshots', `${paddedIndex}-${actionName}.jpg`);
        // Playwright по умолчанию ждёт 30 с — это дольше, чем весь бюджет финализации
        const buffer = await withTimeout(
          page.screenshot({
            fullPage: false,
            type: 'jpeg',
            quality: this.options.screenshotQuality ?? 80,
            timeout: CAPTURE_TIMEOUT_MS,
          }),
          CAPTURE_TIMEOUT_MS + 500,
          'screenshot',
        );
        await writeScreenshot(screenshotPath, buffer);
        screenshotFile = `screenshots/${paddedIndex}-${actionName}.jpg`;
      } catch {
        hasFailed = true;
      }
    }

    // Flush console logs accumulated since previous action
    const consoleLogs = this.pendingConsoleLogs.length > 0 ? [...this.pendingConsoleLogs] : undefined;
    this.pendingConsoleLogs = [];

    // Drain network requests accumulated since previous action
    const networkRequests = await this.drainNetworkRequests();

    const action: RecordedAction = {
      index,
      timestamp,
      url,
      action: {
        type: actionName,
        ...(selector && { selector }),
        ...(data.action.text !== undefined && { value: data.action.text }),
        ...(data.action.key !== undefined && { key: data.action.key }),
        codegenCode: code,
        ...(data.action.position && { position: data.action.position }),
        ...(data.action.modifiers !== undefined && { modifiers: data.action.modifiers }),
        ...(data.action.button !== undefined && { button: data.action.button }),
        ...(data.action.clickCount !== undefined && { clickCount: data.action.clickCount }),
      },
      ...(targetResult && { target: targetResult.target, selectors: targetResult.selectors }),
      ...(frameContext && { frame: frameContext }),
      accessibilityTree,
      screenshotFile,
      ...(consoleLogs && { consoleLogs }),
      ...(networkRequests.length > 0 && { networkRequests }),
    };

    const snapshot = {
      index,
      cleanedDom,
    };

    // Written straight to disk; the writer keeps only this line buffered so that
    // a following actionUpdated can still overwrite it
    await this.actionsWriter.write(index, JSON.stringify(action));
    await this.snapshotsWriter.write(index, JSON.stringify(snapshot));

    // Human-readable progress line
    // Never write \n immediately — commit the previous line only when a new action starts.
    // This allows overwriting the line on actionUpdated, including the first character of a fill.
    const line = formatActionLine(index, data, targetResult?.target ?? null, hasFailed, this.options.maxActions);
    if (isUpdate) {
      process.stdout.write(`\x1b[2K\r${line}`);
    } else {
      if (this.progressLineActive) {
        process.stdout.write('\n');
      }
      process.stdout.write(line);
    }
    this.progressLineActive = true;

    // Stop on max-actions
    if (this.options.maxActions && this.actionIndex >= this.options.maxActions) {
      this.endProgressLine();
      console.log(`⏹  Limit reached: ${this.options.maxActions} actions recorded. Stopping...`);
      this.onMaxActionsReached?.();
    }
  }

  async finalize(): Promise<SessionMetadata> {
    // Wait for queue to drain, but no longer than timeout
    let queueDrained = false;
    await Promise.race([
      this.actionQueue.then(() => { queueDrained = true; }),
      new Promise((resolve) => setTimeout(resolve, QUEUE_DRAIN_TIMEOUT_MS)),
    ]);
    if (!queueDrained) {
      console.warn(`\n⚠ Action queue did not drain in ${QUEUE_DRAIN_TIMEOUT_MS / 1000}s — last action(s) may be missing from output`);
    }

    // Flush the progress line if it was left without a trailing \n (e.g. last action was a fill)
    this.endProgressLine();

    // Flush the buffered last line of each JSONL file (earlier lines are already on disk)
    try {
      const { staleUpdates } = await this.actionsWriter.close();
      await this.snapshotsWriter.close();
      if (staleUpdates > 0) {
        console.warn(`⚠ ${staleUpdates} late action update(s) arrived after the line was written — ignored`);
      }
    } catch (err) {
      console.warn(`⚠ Failed to flush output files: ${err instanceof Error ? err.message : err}`);
    }

    const metadata: SessionMetadata = {
      startUrl: this.startUrl,
      startedAt: this.startedAt,
      endedAt: new Date().toISOString(),
      totalActions: this.actionIndex,
      browserType: 'chromium',
      viewportSize: this.options.viewport,
    };

    console.log('');
    console.log(`🎬 Recorded ${this.actionIndex} actions`);
    return metadata;
  }
}
