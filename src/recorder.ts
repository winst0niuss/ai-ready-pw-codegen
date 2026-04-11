import type { Page, BrowserContext, ConsoleMessage, Frame } from 'playwright';
import fs from 'fs';
import path from 'path';
import { CodegenActionData, ConsoleLogEntry, FrameContext, RecordedAction, SessionMetadata, RecorderOptions } from './types';
import { getDomCleanerScript } from './snapshot/dom-cleaner';
import { captureAccessibilityTree } from './snapshot/accessibility';
import { captureTargetElement } from './snapshot/target-element';
import { writeScreenshot } from './utils/fs-helpers';

const QUEUE_DRAIN_TIMEOUT_MS = 5000;

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
  // JSONL lines stored for possible overwrite on actionUpdated
  private actionsLines: string[] = [];
  private snapshotsLines: string[] = [];
  // Console logs accumulated between actions
  private pendingConsoleLogs: ConsoleLogEntry[] = [];
  // Callback to stop on max-actions
  private onMaxActionsReached?: () => void;
  private needsProtocolFallback: boolean;

  constructor(context: BrowserContext, page: Page, startUrl: string, options: RecorderOptions, needsProtocolFallback = false) {
    this.context = context;
    this.page = page;
    this.outputDir = options.outputDir;
    this.options = options;
    this.startedAt = new Date().toISOString();
    this.startUrl = startUrl;
    this.needsProtocolFallback = needsProtocolFallback;
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
   * Resolves a frame by the framePath from codegen. Returns page for main-frame actions.
   * For iframe actions it heuristically picks the matching frame by framePath depth.
   */
  private resolveFrame(
    page: Page,
    data: CodegenActionData,
  ): { frameContext?: FrameContext; executionContext: Page | Frame } {
    const framePath = data.frame?.framePath;
    if (!framePath || framePath.length === 0) {
      return { executionContext: page };
    }

    // Heuristic: look for a non-main frame. If several, pick the last (most nested) one.
    const mainFrame = page.mainFrame();
    const nonMainFrames = page.frames().filter((f) => f !== mainFrame);
    const frame = nonMainFrames[nonMainFrames.length - 1];

    if (!frame) {
      return { executionContext: page };
    }

    let frameUrl = '';
    try {
      frameUrl = frame.url();
    } catch {
      frameUrl = '';
    }
    const frameName = frame.name() || undefined;

    return {
      frameContext: {
        path: framePath,
        url: frameUrl,
        ...(frameName ? { name: frameName } : {}),
      },
      executionContext: frame,
    };
  }

  private enqueueAction(page: Page, data: CodegenActionData, code: string, isUpdate: boolean): void {
    this.actionQueue = this.actionQueue.then(() =>
      this.processAction(page, data, code, isUpdate)
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
    const { frameContext, executionContext } = this.resolveFrame(page, data);

    // Capture target + selectors (skipped for actions without a selector, e.g. navigate)
    let targetResult: Awaited<ReturnType<typeof captureTargetElement>> | null = null;
    if (selector) {
      try {
        targetResult = await captureTargetElement(executionContext, selector);
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
      accessibilityTree = await captureAccessibilityTree(page);
    } catch {
      accessibilityTree = { error: 'failed to capture' };
      hasFailed = true;
    }

    try {
      // DOM cleaner runs inside the resolved frame's context
      cleanedDom = await executionContext.evaluate(getDomCleanerScript());
    } catch {
      cleanedDom = '<error>failed to capture DOM</error>';
      hasFailed = true;
    }

    // Screenshot
    let screenshotFile: string | null = null;
    if (this.options.screenshots) {
      try {
        const screenshotPath = path.join(this.outputDir, 'screenshots', `${paddedIndex}-${actionName}.png`);
        const buffer = await page.screenshot({ fullPage: false });
        await writeScreenshot(screenshotPath, buffer);
        screenshotFile = `screenshots/${paddedIndex}-${actionName}.png`;
      } catch {
        hasFailed = true;
      }
    }

    // Flush console logs accumulated since previous action
    const consoleLogs = this.pendingConsoleLogs.length > 0 ? [...this.pendingConsoleLogs] : undefined;
    this.pendingConsoleLogs = [];

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
    };

    const snapshot = {
      index,
      cleanedDom,
    };

    // On actionUpdated overwrite the last line (index - 1 since array is 0-based)
    const lineIdx = index - 1;
    this.actionsLines[lineIdx] = JSON.stringify(action);
    this.snapshotsLines[lineIdx] = JSON.stringify(snapshot);

    // Minimal progress: colored dot
    const dot = hasFailed ? '\x1b[33m●\x1b[0m' : '\x1b[32m●\x1b[0m';
    process.stdout.write(dot);

    // Stop on max-actions
    if (this.options.maxActions && this.actionIndex >= this.options.maxActions) {
      process.stdout.write('\n');
      this.onMaxActionsReached?.();
    }
  }

  async finalize(): Promise<SessionMetadata> {
    // Wait for queue to drain, but no longer than timeout
    await Promise.race([
      this.actionQueue,
      new Promise((resolve) => setTimeout(resolve, QUEUE_DRAIN_TIMEOUT_MS)),
    ]);

    // Write JSONL files
    const actionsPath = path.join(this.outputDir, 'actions.jsonl');
    fs.writeFileSync(actionsPath, this.actionsLines.join('\n') + '\n', 'utf-8');

    const snapshotsPath = path.join(this.outputDir, 'snapshots.jsonl');
    fs.writeFileSync(snapshotsPath, this.snapshotsLines.join('\n') + '\n', 'utf-8');

    const metadata: SessionMetadata = {
      startUrl: this.startUrl,
      startedAt: this.startedAt,
      endedAt: new Date().toISOString(),
      totalActions: this.actionIndex,
      browserType: 'chromium',
      viewportSize: this.options.viewport,
    };

    process.stdout.write('\n');
    console.log(`Recorded ${this.actionIndex} actions`);
    return metadata;
  }
}
