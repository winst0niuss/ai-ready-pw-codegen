#!/usr/bin/env node
import { chromium } from 'playwright';
import path from 'path';
import { Recorder } from './recorder';
import { generateOutputDir } from './utils/fs-helpers';
import { createArchive } from './utils/archiver';
import { writeAnalysisPrompt } from './utils/analysis-prompt';
import { RecorderOptions } from './types';

async function main() {
  const args = process.argv.slice(2);

  const url = args.find((a) => !a.startsWith('--'));
  const noScreenshots = args.includes('--no-screenshots');
  const outputBase = getArgValue(args, '--output-dir') || './recordings';
  const viewportWidth = parseInt(getArgValue(args, '--width') || '1280', 10);
  const viewportHeight = parseInt(getArgValue(args, '--height') || '720', 10);

  if (!url) {
    console.log('Usage: domtrace-playwright <URL> [options]');
    console.log('');
    console.log('Options:');
    console.log('  --no-screenshots     Disable screenshots');
    console.log('  --output-dir <path>  Output directory (default: ./recordings)');
    console.log('  --width <number>     Viewport width (default: 1280)');
    console.log('  --height <number>    Viewport height (default: 720)');
    console.log('');
    console.log('Example: npx domtrace-playwright https://example.com');
    process.exit(1);
  }

  const outputDir = generateOutputDir(path.resolve(outputBase));
  const options: RecorderOptions = {
    outputDir,
    screenshots: !noScreenshots,
    viewport: { width: viewportWidth, height: viewportHeight },
  };

  console.log(`Recording: ${url}`);
  console.log(`Output: ${outputDir}`);
  console.log(`Screenshots: ${options.screenshots ? 'on' : 'off'}`);
  console.log('');
  console.log('Interact with the page. Close the browser to stop recording.');
  console.log('---');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: options.viewport,
  });
  const page = await context.newPage();

  const recorder = new Recorder(context, page, url, options);

  // Shutdown handler
  let finalized = false;
  async function finalize() {
    if (finalized) return;
    finalized = true;

    // Гарантия завершения через 10 секунд
    setTimeout(() => {
      console.error('\nForce exit: finalization timed out');
      process.exit(1);
    }, 10000).unref();

    try {
      const metadata = await recorder.finalize();
      writeAnalysisPrompt(outputDir, metadata);
      const archivePath = createArchive(outputDir);
      console.log(`\nArchive: ${archivePath}`);
      console.log('Done! Send the archive to Claude Code for analysis.');
    } catch (err) {
      console.error('Finalization error:', err);
    }

    try { await browser.close(); } catch {}
    process.exit(0);
  }

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
