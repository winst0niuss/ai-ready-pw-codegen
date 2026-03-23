import type { Page, BrowserContext } from 'playwright';
import fs from 'fs';
import path from 'path';
import { CodegenActionData, RecordedAction, SessionMetadata, RecorderOptions } from './types';
import { getDomCleanerScript } from './snapshot/dom-cleaner';
import { captureAccessibilityTree } from './snapshot/accessibility';
import { writeScreenshot } from './utils/fs-helpers';

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
  private lastActionType = '';
  // JSONL: store lines for possible overwrite on actionUpdated
  private actionsLines: string[] = [];
  private snapshotsLines: string[] = [];

  constructor(context: BrowserContext, page: Page, startUrl: string, options: RecorderOptions) {
    this.context = context;
    this.page = page;
    this.outputDir = options.outputDir;
    this.options = options;
    this.startedAt = new Date().toISOString();
    this.startUrl = startUrl;
  }

  async start(): Promise<void> {
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

    await this.page.goto(this.startUrl, { waitUntil: 'domcontentloaded' });
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
    this.lastActionType = actionName;

    const paddedIndex = String(index).padStart(3, '0');
    const timestamp = new Date().toISOString();

    let url: string;
    try {
      url = page.url();
    } catch {
      url = this.startUrl;
    }

    const selector = data.action.selector || '';
    console.log(`[${paddedIndex}] ${actionName}${selector ? ' → ' + selector : ''} (${url})`);

    // Wait for DOM stabilization
    try {
      await page.waitForTimeout(100);
    } catch {
      // Page may have been closed
    }

    // Snapshots
    let accessibilityTree: unknown = null;
    let cleanedDom = '';

    try {
      accessibilityTree = await captureAccessibilityTree(page);
    } catch {
      accessibilityTree = { error: 'failed to capture' };
    }

    try {
      cleanedDom = await page.evaluate(getDomCleanerScript());
    } catch {
      cleanedDom = '<error>failed to capture DOM</error>';
    }

    // Screenshot
    let screenshotFile: string | null = null;
    if (this.options.screenshots) {
      try {
        const screenshotPath = path.join(this.outputDir, 'screenshots', `${paddedIndex}-${actionName}.png`);
        const buffer = await page.screenshot({ fullPage: false });
        writeScreenshot(screenshotPath, buffer);
        screenshotFile = `screenshots/${paddedIndex}-${actionName}.png`;
      } catch {
        // Screenshot is non-critical
      }
    }

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
      },
      accessibilityTree,
      screenshotFile,
    };

    const snapshot = {
      index,
      cleanedDom,
    };

    // On actionUpdated overwrite the last line (index - 1 since array is 0-based)
    const lineIdx = index - 1;
    this.actionsLines[lineIdx] = JSON.stringify(action);
    this.snapshotsLines[lineIdx] = JSON.stringify(snapshot);
  }

  async finalize(): Promise<SessionMetadata> {
    // Wait for queue to drain, but no longer than 5 seconds
    await Promise.race([
      this.actionQueue,
      new Promise((resolve) => setTimeout(resolve, 5000)),
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

    console.log(`\nRecorded ${this.actionIndex} actions`);
    return metadata;
  }
}
