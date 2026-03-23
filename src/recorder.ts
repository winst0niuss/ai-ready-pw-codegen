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
  // Promise-очередь для последовательной обработки действий
  private actionQueue: Promise<void> = Promise.resolve();
  private lastNavigateUrl = '';
  private lastActionType = '';

  constructor(page: Page, browser: Browser, startUrl: string, options: RecorderOptions) {
    this.page = page;
    this.browser = browser;
    this.outputDir = options.outputDir;
    this.options = options;
    this.startedAt = new Date().toISOString();
    this.startUrl = startUrl;
  }

  async start(): Promise<void> {
    // Открываем окно лога действий в отдельном контексте (= отдельное окно браузера)
    const overlayContext = await this.browser.newContext({
      viewport: { width: 500, height: 700 },
    });
    this.overlayPage = await overlayContext.newPage();
    await this.overlayPage.setContent(getOverlayWindowHTML());
    // Не даём закрытию overlay-окна ломать запись
    this.overlayPage.on('close', () => { this.overlayPage = null; });

    // Инжектируем скрипты на уровне контекста — работает для всех вкладок
    const context = this.page.context();
    await context.addInitScript(getListenerScript());
    await context.addInitScript(getToolbarScript());

    // Подключаем слушатели к странице
    this.attachPageListeners(this.page);

    // Переключаем фокус при открытии новой вкладки
    context.on('page', (newPage) => {
      // Игнорируем overlay-окно (оно в другом контексте)
      console.log('[recorder] Новая вкладка, переключаем фокус');
      this.switchToPage(newPage);
    });

    // Первая навигация
    await this.page.goto(this.startUrl, { waitUntil: 'domcontentloaded' });
  }

  private attachPageListeners(page: Page): void {
    page.on('console', (msg) => {
      if (msg.type() !== 'debug') return;
      const text = msg.text();
      if (!text.startsWith('__RECORDER__:')) return;

      try {
        const payload = JSON.parse(text.slice('__RECORDER__:'.length));
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
        // Игнорируем невалидные сообщения
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
    // Записываем navigate на новую вкладку
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

    // Сохраняем на диск
    const actionPath = path.join(this.outputDir, 'actions', `${paddedIndex}-${type}.json`);
    writeJSON(actionPath, action);

    // Отправляем в окно лога
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
      // Окно лога могло быть закрыто
    });
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
