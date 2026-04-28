#!/usr/bin/env node
import { chromium } from 'playwright';
import path from 'path';
import { Recorder } from './recorder';
import { generateOutputDir, copyDocsToOutput } from './utils/fs-helpers';
import { createArchive } from './utils/archiver';
import { writeAnalysisPrompt } from './utils/analysis-prompt';
import { RecorderOptions } from './types';
import { parseAndValidateUrl, parseViewportSize } from './utils/cli-parsers';

const FINALIZE_TIMEOUT_MS = 10000;

const KNOWN_FLAGS = new Set([
  '--no-screenshots', '--no-archive', '--no-console', '--no-network',
  '--max-actions', '--output-dir', '--viewport-size', '--jpeg',
  '--help', '--version', '-h', '-v',
]);

function printUsage() {
  console.log('Usage: ai-ready-pw-codegen <URL> [options]');
  console.log('');
  console.log('Options:');
  console.log('  --no-screenshots     Disable screenshots');
  console.log('  --no-archive         Skip .zip creation');
  console.log('  --no-console         Disable console log capture');
  console.log('  --no-network         Disable XHR/fetch network capture');
  console.log('  --max-actions <N>    Stop after N actions');
  console.log('  --output-dir <path>  Output directory (default: ./recordings)');
  console.log('  --viewport-size=W,H  Viewport size (default: 1920,1080)');
  console.log('  --jpeg [quality]     Screenshot quality for JPEG (default: 80); JPEG is the default format');
  console.log('  --help, -h           Show this help');
  console.log('  --version, -v        Show version');
  console.log('');
  console.log('Example: npx ai-ready-pw-codegen https://example.com');
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  if (args.includes('--version') || args.includes('-v')) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { version } = require(path.join(__dirname, '../package.json')) as { version: string };
    console.log(version);
    process.exit(0);
  }

  const url = args.find((a) => !a.startsWith('-'));
  const noScreenshots = args.includes('--no-screenshots');
  const noArchive = args.includes('--no-archive');
  const noConsole = args.includes('--no-console');
  const noNetwork = args.includes('--no-network');
  const outputBase = getArgValue(args, '--output-dir') || './recordings';
  const maxActionsRaw = getArgValue(args, '--max-actions');
  const maxActions = maxActionsRaw ? parseInt(maxActionsRaw, 10) : undefined;

  if (maxActions !== undefined && (isNaN(maxActions) || maxActions <= 0)) {
    console.error(`Invalid --max-actions: ${maxActionsRaw} (expected positive number)`);
    process.exit(1);
  }

  const unknownFlags = args.filter((a) => {
    if (!a.startsWith('-')) return false;
    const name = a.includes('=') ? a.split('=')[0] : a;
    return !KNOWN_FLAGS.has(name);
  });
  if (unknownFlags.length > 0) {
    console.warn(`\x1b[33m⚠ Unknown flag(s): ${unknownFlags.join(', ')}\x1b[0m`);
  }

  if (!url) {
    printUsage();
    process.exit(1);
  }

  // Parse --jpeg [quality]
  let screenshotQuality: number | undefined;
  const jpegIdx = args.indexOf('--jpeg');
  if (jpegIdx !== -1) {
    const maybeQuality = args[jpegIdx + 1];
    const q = parseInt(maybeQuality, 10);
    if (!isNaN(q) && q >= 1 && q <= 100) {
      screenshotQuality = q;
    } else {
      if (!isNaN(q)) {
        console.warn(`\x1b[33m⚠ --jpeg quality ${q} is out of range (1–100), using default 80\x1b[0m`);
      }
      screenshotQuality = 80;
    }
  }

  let validatedUrl: string;
  let needsProtocolFallback: boolean;
  try {
    ({ url: validatedUrl, needsProtocolFallback } = parseAndValidateUrl(url));
  } catch (err: any) {
    console.error(err.message);
    process.exit(1);
  }

  let viewportSize: { width: number; height: number };
  try {
    viewportSize = parseViewportSize(getArgValue(args, '--viewport-size'));
  } catch (err: any) {
    console.error(err.message);
    process.exit(1);
  }

  const outputDir = await generateOutputDir(path.resolve(outputBase));
  const options: RecorderOptions = {
    outputDir,
    screenshots: !noScreenshots,
    viewport: viewportSize!,
    noArchive,
    maxActions,
    captureConsole: !noConsole,
    captureNetwork: !noNetwork,
    ...(screenshotQuality !== undefined && { screenshotQuality }),
  };

  console.log(`🎭 AI-Ready PW Codegen`);
  console.log(`🌐 URL: ${validatedUrl}`);
  console.log(`📂 Output: ${outputDir}`);
  console.log('');
  console.log('🔴 Recording... Close the browser to stop.');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: options.viewport,
  });
  const page = await context.newPage();

  if (typeof (context as any)._enableRecorder !== 'function') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pwVersion = (require('playwright/package.json') as { version: string }).version;
    console.error(`❌ Playwright internal API _enableRecorder is not available (detected version: ${pwVersion}).`);
    console.error('   This tool requires Playwright >=1.50.0 with the internal recorder API.');
    await browser.close();
    process.exit(1);
  }

  const recorder = new Recorder(context, page, validatedUrl, options, needsProtocolFallback);

  // Shutdown handler
  let finalized = false;
  async function finalize() {
    if (finalized) return;
    finalized = true;

    setTimeout(() => {
      console.error(`\n⚠ Force exit: finalization timed out after ${FINALIZE_TIMEOUT_MS / 1000}s (output may be incomplete)`);
      process.exit(1);
    }, FINALIZE_TIMEOUT_MS).unref();

    console.log('\n⏳ Finalizing...');

    try {
      const metadata = await recorder.finalize();
      writeAnalysisPrompt(outputDir, metadata);
      copyDocsToOutput(outputDir);

      if (!noArchive) {
        const archivePath = await createArchive(outputDir);
        console.log(`📦 Archive: ${archivePath}`);
      }
      console.log('✨ Done! Send the archive to AI for analysis. 🤖');
    } catch (err) {
      console.error(`⚠ Finalization error: ${err instanceof Error ? err.message : err}`);
    }

    try { await browser.close(); } catch {}
    process.exit(0);
  }

  // Stop on max-actions
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
