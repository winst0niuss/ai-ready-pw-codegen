import type { Page, BrowserContext } from 'playwright';
import path from 'path';
import { CodegenActionData, RecordedAction, SessionMetadata, RecorderOptions } from './types';
import { getDomCleanerScript } from './snapshot/dom-cleaner';
import { captureAccessibilityTree } from './snapshot/accessibility';
import { writeJSON, writeScreenshot } from './utils/fs-helpers';

export class Recorder {
  private context: BrowserContext;
  private page: Page;
  private outputDir: string;
  private options: RecorderOptions;
  private actionIndex = 0;
  private startedAt: string;
  private startUrl: string;
  private actionQueue: Promise<void> = Promise.resolve();
  // Для перезаписи при actionUpdated (codegen мержит keystrokes в fill)
  private lastActionIndex = 0;
  private lastActionType = '';

  constructor(context: BrowserContext, page: Page, startUrl: string, options: RecorderOptions) {
    this.context = context;
    this.page = page;
    this.outputDir = options.outputDir;
    this.options = options;
    this.startedAt = new Date().toISOString();
    this.startUrl = startUrl;
  }

  async start(): Promise<void> {
    // Запускаем GUI инспектор codegen
    await (this.context as any)._enableRecorder({
      mode: 'recording',
      language: 'playwright-test',
    });

    // Подключаем eventSink для захвата действий
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

    // При обновлении (actionUpdated) — перезаписываем последнее действие
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

    // Ждём стабилизации DOM
    try {
      await page.waitForTimeout(100);
    } catch {
      // Страница могла закрыться
    }

    // Снимки
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

    // Скриншот
    let screenshotFile: string | null = null;
    if (this.options.screenshots) {
      try {
        const screenshotPath = path.join(this.outputDir, 'screenshots', `${paddedIndex}-${actionName}.png`);
        const buffer = await page.screenshot({ fullPage: false });
        writeScreenshot(screenshotPath, buffer);
        screenshotFile = `screenshots/${paddedIndex}-${actionName}.png`;
      } catch {
        // Скриншот некритичен
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
      snapshot: {
        accessibilityTree,
        cleanedDom,
      },
      screenshotFile,
    };

    const actionPath = path.join(this.outputDir, 'actions', `${paddedIndex}-${actionName}.json`);
    writeJSON(actionPath, action);
  }

  async finalize(): Promise<void> {
    // Ждём очередь, но не дольше 5 секунд
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
