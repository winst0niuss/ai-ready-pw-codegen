import { chromium } from 'playwright';
import path from 'path';
import { Recorder } from './recorder';
import { generateOutputDir } from './utils/fs-helpers';
import { createArchive } from './utils/archiver';
import { RecorderOptions } from './types';

async function main() {
  const args = process.argv.slice(2);

  // Парсим аргументы
  const url = args.find((a) => !a.startsWith('--'));
  const noScreenshots = args.includes('--no-screenshots');
  const outputBase = getArgValue(args, '--output-dir') || './recordings';
  const viewportWidth = parseInt(getArgValue(args, '--width') || '1280', 10);
  const viewportHeight = parseInt(getArgValue(args, '--height') || '720', 10);

  if (!url) {
    console.log('Использование: npx ts-node src/main.ts <URL> [опции]');
    console.log('');
    console.log('Опции:');
    console.log('  --no-screenshots     Не делать скриншоты');
    console.log('  --output-dir <path>  Папка для записей (по умолчанию: ./recordings)');
    console.log('  --width <number>     Ширина viewport (по умолчанию: 1280)');
    console.log('  --height <number>    Высота viewport (по умолчанию: 720)');
    console.log('');
    console.log('Пример: npx ts-node src/main.ts https://example.com');
    process.exit(1);
  }

  const outputDir = generateOutputDir(path.resolve(outputBase));
  const options: RecorderOptions = {
    outputDir,
    screenshots: !noScreenshots,
    viewport: { width: viewportWidth, height: viewportHeight },
  };

  console.log(`Запуск записи: ${url}`);
  console.log(`Папка: ${outputDir}`);
  console.log(`Скриншоты: ${options.screenshots ? 'да' : 'нет'}`);
  console.log('');
  console.log('Взаимодействуйте со страницей. Закройте браузер для завершения записи.');
  console.log('---');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: options.viewport,
  });
  const page = await context.newPage();

  const recorder = new Recorder(page, url, options);

  // Обработка завершения
  let finalized = false;
  async function finalize() {
    if (finalized) return;
    finalized = true;

    try {
      await recorder.finalize();
      const archivePath = createArchive(outputDir);
      console.log(`\nАрхив: ${archivePath}`);
      console.log('Готово! Отправьте архив в Claude Code для анализа.');
    } catch (err) {
      console.error('Ошибка при финализации:', err);
    }

    try { await browser.close(); } catch {}
    process.exit(0);
  }

  // Закрытие браузера
  browser.on('disconnected', finalize);
  process.on('SIGINT', finalize);
  process.on('SIGTERM', finalize);

  await recorder.start();
}

function getArgValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

main().catch((err) => {
  console.error('Ошибка:', err);
  process.exit(1);
});
