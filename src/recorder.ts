import type { Page } from 'playwright';
import path from 'path';
import { BrowserActionPayload, RecordedAction, SessionMetadata, RecorderOptions } from './types';
import { getListenerScript } from './injected/listener';
import { getOverlayScript } from './injected/overlay';
import { getDomCleanerScript } from './snapshot/dom-cleaner';
import { captureAccessibilityTree } from './snapshot/accessibility';
import { writeJSON, writeScreenshot } from './utils/fs-helpers';

export class Recorder {
  private page: Page;
  private outputDir: string;
  private options: RecorderOptions;
  private actionIndex = 0;
  private startedAt: string;
  private startUrl: string;
  // Promise-очередь для последовательной обработки действий
  private actionQueue: Promise<void> = Promise.resolve();

  constructor(page: Page, startUrl: string, options: RecorderOptions) {
    this.page = page;
    this.outputDir = options.outputDir;
    this.options = options;
    this.startedAt = new Date().toISOString();
    this.startUrl = startUrl;
  }

  async start(): Promise<void> {
    // Инжектируем скрипт-слушатель и UI overlay
    await this.page.addInitScript(getListenerScript());
    await this.page.addInitScript(getOverlayScript());

    // Слушаем события от инжектированного скрипта
    this.page.on('console', (msg) => {
      if (msg.type() !== 'debug') return;
      const text = msg.text();
      if (!text.startsWith('__RECORDER__:')) return;

      try {
        const payload = JSON.parse(text.slice('__RECORDER__:'.length));
        // SPA-навигация — записываем как navigate
        if (payload.type === 'spa-navigate') {
          this.enqueueAction('navigate', undefined, payload.url);
          return;
        }
        this.enqueueAction(payload.type, payload);
      } catch {
        // Игнорируем невалидные сообщения
      }
    });

    // Навигации
    this.page.on('framenavigated', (frame) => {
      if (frame !== this.page.mainFrame()) return;
      this.enqueueAction('navigate');
    });

    // Автоматическое закрытие диалогов
    this.page.on('dialog', async (dialog) => {
      await dialog.dismiss();
    });

    // Первая навигация
    await this.page.goto(this.startUrl, { waitUntil: 'domcontentloaded' });
  }

  private enqueueAction(
    type: RecordedAction['action']['type'],
    payload?: BrowserActionPayload,
    urlOverride?: string
  ): void {
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

    // Ждём немного чтобы DOM обновился после действия
    await this.page.waitForTimeout(100);

    // Захватываем снэпшоты
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

    // Скриншот
    let screenshotFile: string | null = null;
    if (this.options.screenshots) {
      try {
        const screenshotPath = path.join(this.outputDir, 'screenshots', `${paddedIndex}-${type}.png`);
        const buffer = await this.page.screenshot({ fullPage: false });
        writeScreenshot(screenshotPath, buffer);
        screenshotFile = `screenshots/${paddedIndex}-${type}.png`;
      } catch {
        // Скриншот не критичен
      }
    }

    // Формируем action
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

    // Сохраняем
    const actionPath = path.join(this.outputDir, 'actions', `${paddedIndex}-${type}.json`);
    writeJSON(actionPath, action);
  }

  async finalize(): Promise<void> {
    // Ждём завершения всех действий в очереди
    await this.actionQueue;

    const metadata: SessionMetadata = {
      startUrl: this.startUrl,
      startedAt: this.startedAt,
      endedAt: new Date().toISOString(),
      totalActions: this.actionIndex,
      browserType: 'chromium',
      viewportSize: this.options.viewport,
    };

    writeJSON(path.join(this.outputDir, 'metadata.json'), metadata);
    console.log(`\nЗаписано ${this.actionIndex} действий`);
  }
}
