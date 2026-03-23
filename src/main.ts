#!/usr/bin/env node
import { chromium } from 'playwright';
import path from 'path';
import { Recorder } from './recorder';
import { generateOutputDir } from './utils/fs-helpers';
import { createArchive } from './utils/archiver';
import { writeAnalysisPrompt } from './utils/analysis-prompt';
import { RecorderOptions } from './types';

const DEFAULT_VIEWPORT_WIDTH = 1280;
const DEFAULT_VIEWPORT_HEIGHT = 720;
const FINALIZE_TIMEOUT_MS = 10000;

function parseAndValidateUrl(raw: string): string {
  let urlStr = raw;
  // Добавляем протокол если отсутствует
  if (!/^https?:\/\//i.test(urlStr)) {
    urlStr = `https://${urlStr}`;
  }
  try {
    new URL(urlStr);
  } catch {
    console.error(`Invalid URL: ${raw}`);
    process.exit(1);
  }
  return urlStr;
}

function parseViewport(raw: string | undefined, defaultVal: number, name: string): number {
  if (!raw) return defaultVal;
  const val = parseInt(raw, 10);
  if (isNaN(val) || val <= 0 || val > 7680) {
    console.error(`Invalid ${name}: ${raw} (expected 1–7680)`);
    process.exit(1);
  }
  return val;
}

async function main() {
  const args = process.argv.slice(2);

  const url = args.find((a) => !a.startsWith('--'));
  const noScreenshots = args.includes('--no-screenshots');
  const noArchive = args.includes('--no-archive');
  const noConsole = args.includes('--no-console');
  const headless = args.includes('--headless');
  const outputBase = getArgValue(args, '--output-dir') || './recordings';
  const viewportWidth = parseViewport(getArgValue(args, '--width'), DEFAULT_VIEWPORT_WIDTH, 'width');
  const viewportHeight = parseViewport(getArgValue(args, '--height'), DEFAULT_VIEWPORT_HEIGHT, 'height');
  const maxActionsRaw = getArgValue(args, '--max-actions');
  const maxActions = maxActionsRaw ? parseInt(maxActionsRaw, 10) : undefined;

  if (maxActions !== undefined && (isNaN(maxActions) || maxActions <= 0)) {
    console.error(`Invalid --max-actions: ${maxActionsRaw} (expected positive number)`);
    process.exit(1);
  }

  if (!url) {
    console.log('Usage: ai-ready-pw-codegen <URL> [options]');
    console.log('');
    console.log('Options:');
    console.log('  --no-screenshots     Disable screenshots');
    console.log('  --no-archive         Skip .tar.gz creation');
    console.log('  --no-console         Disable console log capture');
    console.log('  --headless           Run in headless mode');
    console.log('  --max-actions <N>    Stop after N actions');
    console.log('  --output-dir <path>  Output directory (default: ./recordings)');
    console.log('  --width <number>     Viewport width (default: 1280)');
    console.log('  --height <number>    Viewport height (default: 720)');
    console.log('');
    console.log('Example: npx ai-ready-pw-codegen https://example.com');
    process.exit(1);
  }

  const validatedUrl = parseAndValidateUrl(url);
  const outputDir = await generateOutputDir(path.resolve(outputBase));
  const options: RecorderOptions = {
    outputDir,
    screenshots: !noScreenshots,
    viewport: { width: viewportWidth, height: viewportHeight },
    noArchive,
    maxActions,
    headless,
    captureConsole: !noConsole,
  };

  console.log(`🎭 AI-Ready PW Codegen`);
  console.log(`   URL: ${validatedUrl}`);
  console.log(`   Output: ${outputDir}`);
  console.log('');
  console.log('Recording... Close the browser to stop.');

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    viewport: options.viewport,
  });
  const page = await context.newPage();

  const recorder = new Recorder(context, page, validatedUrl, options);

  // Shutdown handler
  let finalized = false;
  async function finalize() {
    if (finalized) return;
    finalized = true;

    setTimeout(() => {
      console.error('\nForce exit: finalization timed out');
      process.exit(1);
    }, FINALIZE_TIMEOUT_MS).unref();

    try {
      const metadata = await recorder.finalize();
      writeAnalysisPrompt(outputDir, metadata);

      if (!noArchive) {
        const archivePath = createArchive(outputDir);
        console.log(`Archive: ${archivePath}`);
      }
      console.log('✅ Done! Send the archive to AI for analysis.');
    } catch (err) {
      console.error('Finalization error:', err);
    }

    try { await browser.close(); } catch {}
    process.exit(0);
  }

  // Остановка по max-actions
  recorder.onStop(() => finalize());

  context.on('close', finalize);
  page.on('close', () => {
    if (context.pages().length === 0) finalize();
  });
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
  console.error('Error:', err);
  process.exit(1);
});
