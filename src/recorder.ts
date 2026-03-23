import type { Page, BrowserContext, ConsoleMessage } from 'playwright';
import fs from 'fs';
import path from 'path';
import { CodegenActionData, ConsoleLogEntry, RecordedAction, SessionMetadata, RecorderOptions } from './types';
import { getDomCleanerScript } from './snapshot/dom-cleaner';
import { captureAccessibilityTree } from './snapshot/accessibility';
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
  // Для перезаписи при actionUpdated (codegen объединяет нажатия в fill)
  private lastActionIndex = 0;
  private lastActionType = '';
  // JSONL: храним строки для возможной перезаписи при actionUpdated
  private actionsLines: string[] = [];
  private snapshotsLines: string[] = [];
  // Console logs между действиями
  private pendingConsoleLogs: ConsoleLogEntry[] = [];
  // Колбэк для остановки по max-actions
  private onMaxActionsReached?: () => void;

  constructor(context: BrowserContext, page: Page, startUrl: string, options: RecorderOptions) {
    this.context = context;
    this.page = page;
    this.outputDir = options.outputDir;
    this.options = options;
    this.startedAt = new Date().toISOString();
    this.startUrl = startUrl;
  }

  async start(): Promise<void> {
    // Подписка на console-логи
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

    // Запуск GUI inspector codegen
    await (this.context as any)._enableRecorder({
      mode: 'recording',
      language: 'playwright-test',
    });

    // Подключение eventSink для захвата действий
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

  /** Регистрирует колбэк для остановки по max-actions */
  onStop(callback: () => void): void {
    this.onMaxActionsReached = callback;
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

    // При update (actionUpdated) — перезаписываем последнее действие
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

    // Ожидание стабилизации DOM
    try {
      await page.waitForTimeout(100);
    } catch {
      // Страница могла закрыться
    }

    // Захват снапшотов
    let accessibilityTree: unknown = null;
    let cleanedDom = '';
    let hasFailed = false;

    try {
      accessibilityTree = await captureAccessibilityTree(page);
    } catch {
      accessibilityTree = { error: 'failed to capture' };
      hasFailed = true;
    }

    try {
      cleanedDom = await page.evaluate(getDomCleanerScript());
    } catch {
      cleanedDom = '<error>failed to capture DOM</error>';
      hasFailed = true;
    }

    // Скриншот
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

    // Собираем console-логи, накопленные с предыдущего действия
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
      accessibilityTree,
      screenshotFile,
      ...(consoleLogs && { consoleLogs }),
    };

    const snapshot = {
      index,
      cleanedDom,
    };

    // При actionUpdated перезаписываем последнюю строку (index - 1, т.к. массив с 0)
    const lineIdx = index - 1;
    this.actionsLines[lineIdx] = JSON.stringify(action);
    this.snapshotsLines[lineIdx] = JSON.stringify(snapshot);

    // Минимальный прогресс: цветная точка
    const dot = hasFailed ? '\x1b[33m●\x1b[0m' : '\x1b[32m●\x1b[0m';
    process.stdout.write(dot);

    // Остановка по max-actions
    if (this.options.maxActions && this.actionIndex >= this.options.maxActions) {
      process.stdout.write('\n');
      this.onMaxActionsReached?.();
    }
  }

  async finalize(): Promise<SessionMetadata> {
    // Ждём очередь, но не дольше таймаута
    await Promise.race([
      this.actionQueue,
      new Promise((resolve) => setTimeout(resolve, QUEUE_DRAIN_TIMEOUT_MS)),
    ]);

    // Запись JSONL файлов
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
