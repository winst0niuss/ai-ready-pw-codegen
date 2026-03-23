import type { Page, BrowserContext, Browser } from 'playwright';
import path from 'path';
import { BrowserActionPayload, RecordedAction, SessionMetadata, RecorderOptions } from './types';
import { getListenerScript } from './injected/listener';
import { getToolbarScript } from './injected/toolbar';
import { getDomCleanerScript } from './snapshot/dom-cleaner';
import { captureAccessibilityTree } from './snapshot/accessibility';
import { writeJSON, writeScreenshot } from './utils/fs-helpers';
import { getOverlayWindowHTML } from './overlay-window';

export class Recorder {
  private page: Page;
  private browser: Browser;
  private overlayPage: Page | null = null;
  private outputDir: string;
  private options: RecorderOptions;
  private actionIndex = 0;
  private startedAt: string;
  private startUrl: string;
  // Promise queue for sequential action processing
  private actionQueue: Promise<void> = Promise.resolve();
  private lastNavigateUrl = '';
  private lastActionType = '';
  private onStopRequested: (() => void) | null = null;

  constructor(page: Page, browser: Browser, startUrl: string, options: RecorderOptions) {
    this.page = page;
    this.browser = browser;
    this.outputDir = options.outputDir;
    this.options = options;
    this.startedAt = new Date().toISOString();
    this.startUrl = startUrl;
  }

  async start(): Promise<void> {
    // Open action log window in a separate context (= separate browser window)
    const overlayContext = await this.browser.newContext({
      viewport: { width: 500, height: 700 },
    });
    this.overlayPage = await overlayContext.newPage();
    await this.overlayPage.setContent(getOverlayWindowHTML());
    // Prevent overlay window close from breaking the recording
    this.overlayPage.on('close', () => { this.overlayPage = null; });

    // Inject scripts at context level — works across all tabs
    const context = this.page.context();
    await context.addInitScript(getListenerScript());
    await context.addInitScript(getToolbarScript());

    // Attach listeners to the page
    this.attachPageListeners(this.page);

    // Switch focus when a new tab opens
    context.on('page', (newPage) => {
      console.log('[recorder] New tab detected, switching focus');
      this.switchToPage(newPage);
    });

    // Initial navigation
    await this.page.goto(this.startUrl, { waitUntil: 'domcontentloaded' });
  }

  private attachPageListeners(page: Page): void {
    page.on('console', (msg) => {
      if (msg.type() !== 'debug') return;
      const text = msg.text();
      if (!text.startsWith('__RECORDER__:')) return;

      try {
        const payload = JSON.parse(text.slice('__RECORDER__:'.length));
        if (payload.type === 'stopRecording') {
          if (this.onStopRequested) this.onStopRequested();
          return;
        }
        if (payload.type === 'spa-navigate') {
          if (payload.url !== this.lastNavigateUrl && this.lastActionType !== 'click') {
            this.lastNavigateUrl = payload.url;
            this.enqueueAction('navigate', undefined, payload.url);
          } else {
            this.lastNavigateUrl = payload.url;
          }
          return;
        }
        this.enqueueAction(payload.type, payload);
      } catch {
        // Ignore invalid messages
      }
    });

    page.on('framenavigated', (frame) => {
      if (frame !== page.mainFrame()) return;
      const url = page.url();
      if (url === this.lastNavigateUrl) return;
      if (this.lastActionType === 'click') {
        this.lastNavigateUrl = url;
        return;
      }
      this.lastNavigateUrl = url;
      this.enqueueAction('navigate');
    });

    page.on('dialog', async (dialog) => {
      await dialog.dismiss();
    });
  }

  private switchToPage(newPage: Page): void {
    this.page = newPage;
    this.attachPageListeners(newPage);
    // Record navigate action for new tab
    newPage.once('load', () => {
      const url = newPage.url();
      if (url !== this.lastNavigateUrl) {
        this.lastNavigateUrl = url;
        this.enqueueAction('navigate', undefined, url);
      }
    });
  }

  private enqueueAction(
    type: RecordedAction['action']['type'],
    payload?: BrowserActionPayload,
    urlOverride?: string
  ): void {
    this.lastActionType = type;
    this.actionQueue = this.actionQueue.then(() =>
      this.processAction(type, payload, urlOverride)
    );
  }

  private async processAction(
    type: RecordedAction['action']['type'],
    payload?: BrowserActionPayload,
    urlOverride?: string
  ): Promise<void> {
    this.actionIndex++;
    const index = this.actionIndex;
    const paddedIndex = String(index).padStart(3, '0');
    const timestamp = new Date().toISOString();
    const url = urlOverride || this.page.url();

    console.log(`[${paddedIndex}] ${type}${payload?.cssSelector ? ' → ' + payload.cssSelector : ''} (${url})`);

    // Brief wait for DOM to settle after the action
    await this.page.waitForTimeout(100);

    // Capture snapshots
    let accessibilityTree: unknown = null;
    let cleanedDom = '';

    try {
      accessibilityTree = await captureAccessibilityTree(this.page);
    } catch {
      accessibilityTree = { error: 'failed to capture' };
    }

    try {
      cleanedDom = await this.page.evaluate(getDomCleanerScript());
    } catch {
      cleanedDom = '<error>failed to capture DOM</error>';
    }

    // Screenshot
    let screenshotFile: string | null = null;
    if (this.options.screenshots) {
      try {
        const screenshotPath = path.join(this.outputDir, 'screenshots', `${paddedIndex}-${type}.png`);
        const buffer = await this.page.screenshot({ fullPage: false });
        writeScreenshot(screenshotPath, buffer);
        screenshotFile = `screenshots/${paddedIndex}-${type}.png`;
      } catch {
        // Screenshot is non-critical
      }
    }

    // Build action record
    const action: RecordedAction = {
      index,
      timestamp,
      url,
      action: {
        type,
        ...(payload?.value !== undefined && { value: payload.value }),
        ...(payload?.key !== undefined && { key: payload.key }),
        ...(payload?.condition !== undefined && { condition: payload.condition }),
        ...(payload && {
          elementInfo: {
            tagName: payload.tagName,
            id: payload.id,
            classes: payload.classes,
            text: payload.text,
            attributes: payload.attributes,
            boundingBox: payload.boundingBox,
            cssSelector: payload.cssSelector,
            xpath: payload.xpath,
          },
        }),
      },
      snapshot: {
        accessibilityTree,
        cleanedDom,
      },
      screenshotFile,
    };

    // Save to disk
    const actionPath = path.join(this.outputDir, 'actions', `${paddedIndex}-${type}.json`);
    writeJSON(actionPath, action);

    // Push to overlay log window
    this.pushToOverlay(action);
  }

  private pushToOverlay(action: RecordedAction): void {
    if (!this.overlayPage) return;
    const data = {
      index: action.index,
      type: action.action.type,
      url: action.url,
      selector: action.action.elementInfo?.cssSelector || '',
      value: action.action.value || '',
      key: action.action.key || '',
      condition: action.action.condition || '',
    };
    this.overlayPage.evaluate((d: typeof data) => {
      (window as any).__addAction(d);
    }, data).catch(() => {
      // Log window may have been closed
    });
  }

  onStop(callback: () => void): void {
    this.onStopRequested = callback;
  }

  async finalize(): Promise<void> {
    // Ждём очередь, но не дольше 5 секунд (может зависнуть если браузер уже закрыт)
    await Promise.race([
      this.actionQueue,
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);

    const metadata: SessionMetadata = {
      startUrl: this.startUrl,
      startedAt: this.startedAt,
      endedAt: new Date().toISOString(),
      totalActions: this.actionIndex,
      browserType: 'chromium',
      viewportSize: this.options.viewport,
    };

    writeJSON(path.join(this.outputDir, 'metadata.json'), metadata);
    console.log(`\nRecorded ${this.actionIndex} actions`);
  }
}
