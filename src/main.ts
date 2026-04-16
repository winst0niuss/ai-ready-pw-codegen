#!/usr/bin/env node
import { chromium } from 'playwright';
import path from 'path';
import { Recorder } from './recorder';
import { generateOutputDir, copyDocsToOutput } from './utils/fs-helpers';
import { createArchive } from './utils/archiver';
import { writeAnalysisPrompt } from './utils/analysis-prompt';
import { RecorderOptions } from './types';

const DEFAULT_VIEWPORT_WIDTH = 1280;
const DEFAULT_VIEWPORT_HEIGHT = 720;
const FINALIZE_TIMEOUT_MS = 10000;

function parseAndValidateUrl(raw: string): { url: string; needsProtocolFallback: boolean } {
  // Protocol is explicit — use as is
  if (/^https?:\/\//i.test(raw)) {
    try {
      new URL(raw);
    } catch {
      console.error(`Invalid URL: ${raw}`);
      process.exit(1);
    }
    return { url: raw, needsProtocolFallback: false };
  }

  // No protocol — validate format; protocol will be picked up on connect
  try {
    new URL(`http://${raw}`);
  } catch {
    console.error(`Invalid URL: ${raw}`);
    process.exit(1);
  }
  return { url: raw, needsProtocolFallback: true };
}

function parseViewportSize(raw: string | undefined): { width: number; height: number } {
  if (!raw) return { width: DEFAULT_VIEWPORT_WIDTH, height: DEFAULT_VIEWPORT_HEIGHT };
  const match = raw.match(/^(\d+),(\d+)$/);
  if (!match) {
    console.error(`Invalid --viewport-size: "${raw}" (expected format: 1280,720)`);
    process.exit(1);
  }
  const width = parseInt(match[1], 10);
  const height = parseInt(match[2], 10);
  if (width <= 0 || width > 7680 || height <= 0 || height > 7680) {
    console.error(`Invalid --viewport-size: "${raw}" (values must be 1–7680)`);
    process.exit(1);
  }
  return { width, height };
}

async function main() {
  const args = process.argv.slice(2);

  const url = args.find((a) => !a.startsWith('--'));
  const noScreenshots = args.includes('--no-screenshots');
  const noArchive = args.includes('--no-archive');
  const noConsole = args.includes('--no-console');
  const outputBase = getArgValue(args, '--output-dir') || './recordings';
  const { width: viewportWidth, height: viewportHeight } = parseViewportSize(
    getArgValue(args, '--viewport-size'),
  );
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
    console.log('  --no-archive         Skip .zip creation');
    console.log('  --no-console         Disable console log capture');
    console.log('  --max-actions <N>    Stop after N actions');
    console.log('  --output-dir <path>  Output directory (default: ./recordings)');
    console.log('  --viewport-size=W,H  Viewport size (default: 1280,720)');
    console.log('  --jpeg [quality]     Screenshot quality for JPEG (default: 80); JPEG is the default format');
    console.log('');
    console.log('Example: npx ai-ready-pw-codegen https://example.com');
    process.exit(1);
  }

  // Parse --jpeg [quality]
  let screenshotQuality: number | undefined;
  const jpegIdx = args.indexOf('--jpeg');
  if (jpegIdx !== -1) {
    const maybeQuality = args[jpegIdx + 1];
    const q = parseInt(maybeQuality, 10);
    screenshotQuality = (!isNaN(q) && q >= 1 && q <= 100) ? q : 80;
  }

  const { url: validatedUrl, needsProtocolFallback } = parseAndValidateUrl(url);
  const outputDir = await generateOutputDir(path.resolve(outputBase));
  const options: RecorderOptions = {
    outputDir,
    screenshots: !noScreenshots,
    viewport: { width: viewportWidth, height: viewportHeight },
    noArchive,
    maxActions,
    captureConsole: !noConsole,
    ...(screenshotQuality !== undefined && { screenshotQuality }),
  };

  console.log(`🎭 AI-Ready PW Codegen`);
  console.log(`   URL: ${validatedUrl}`);
  console.log(`   Output: ${outputDir}`);
  console.log('');
  console.log('Recording... Close the browser to stop.');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: options.viewport,
  });
  const page = await context.newPage();

  const recorder = new Recorder(context, page, validatedUrl, options, needsProtocolFallback);

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
      copyDocsToOutput(outputDir);

      if (!noArchive) {
        const archivePath = await createArchive(outputDir);
        console.log(`Archive: ${archivePath}`);
      }
      console.log('✅ Done! Send the archive to AI for analysis.');
    } catch (err) {
      console.error('Finalization error:', err);
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
