#!/usr/bin/env node
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { Recorder } from './recorder';
import { generateOutputDir, copyDocsToOutput } from './utils/fs-helpers';
import { createArchive } from './utils/archiver';
import { writeAnalysisPrompt } from './utils/analysis-prompt';
import { RecorderOptions } from './types';
import { parseAndValidateUrl, parseCliArgs } from './utils/cli-parsers';

const FINALIZE_TIMEOUT_MS = 10000;

function printUsage() {
  console.log('Usage: ai-ready-pw-codegen <URL> [options]');
  console.log('');
  console.log('Options:');
  console.log('  --no-screenshots     Disable screenshots');
  console.log('  --no-archive         Skip .zip creation');
  console.log('  --no-console         Disable console log capture');
  console.log('  --no-network         Disable XHR/fetch network capture');
  console.log('  --har                Also write a full network.har (all resources, for manual analysis)');
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

  let parsedArgs: ReturnType<typeof parseCliArgs>;
  try {
    parsedArgs = parseCliArgs(args);
  } catch (err: any) {
    console.error(err.message);
    process.exit(1);
  }

  if (parsedArgs.unknownFlags.length > 0) {
    console.warn(`\x1b[33m⚠ Unknown flag(s): ${parsedArgs.unknownFlags.join(', ')}\x1b[0m`);
  }

  if (!parsedArgs.url) {
    printUsage();
    process.exit(1);
  }

  let validatedUrl: string;
  let needsProtocolFallback: boolean;
  try {
    ({ url: validatedUrl, needsProtocolFallback } = parseAndValidateUrl(parsedArgs.url));
  } catch (err: any) {
    console.error(err.message);
    process.exit(1);
  }

  const outputDir = await generateOutputDir(path.resolve(parsedArgs.outputBase));
  const options: RecorderOptions = {
    outputDir,
    screenshots: !parsedArgs.noScreenshots,
    viewport: parsedArgs.viewportSize,
    noArchive: parsedArgs.noArchive,
    maxActions: parsedArgs.maxActions,
    captureConsole: !parsedArgs.noConsole,
    captureNetwork: !parsedArgs.noNetwork,
    har: parsedArgs.har,
    ...(parsedArgs.screenshotQuality !== undefined && { screenshotQuality: parsedArgs.screenshotQuality }),
  };

  // HAR is written by Playwright at context.close(); path lives inside the recording dir
  const harPath = path.join(outputDir, 'network.har');

  console.log(`🎭 AI-Ready PW Codegen`);
  console.log(`🌐 URL: ${validatedUrl}`);
  console.log(`📂 Output: ${outputDir}`);
  console.log('');
  console.log('🔴 Recording... Close the browser to stop.');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: options.viewport,
    ...(options.har && { recordHar: { path: harPath, mode: 'full', content: 'embed' } }),
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
      writeAnalysisPrompt(outputDir, metadata, options.har);
      copyDocsToOutput(outputDir);

      // Closing the context flushes the HAR to disk; must happen before archiving.
      // Idempotent — a no-op if the context already closed (e.g. browser closed by user).
      if (options.har) {
        try { await context.close(); } catch {}
      }

      if (!parsedArgs.noArchive) {
        const { archivePath, bytes, warnings } = await createArchive(outputDir);
        console.log(`📦 Archive: ${archivePath}`);

        // Исходники удаляем, только если архив заведомо целый: пустой zip или
        // пропущенные файлы означают, что удаление уничтожит единственную копию
        if (bytes > 0 && warnings.length === 0) {
          await fs.promises.rm(outputDir, { recursive: true, force: true });
        } else {
          for (const warning of warnings) {
            console.warn(`⚠ Archive warning: ${warning}`);
          }
          console.warn(`⚠ Archive may be incomplete — source directory kept: ${outputDir}`);
        }
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

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
