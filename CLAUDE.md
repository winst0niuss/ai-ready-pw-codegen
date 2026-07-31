# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

**AI-Ready PW Codegen** — offline Playwright recorder that captures user interactions with DOM snapshots, accessibility trees, and screenshots for later AI analysis (test generation, Page Object creation). Uses Playwright's built-in codegen as the UI/interaction layer. Acts as an "offline MCP Playwright" — record on a machine without AI access, then send the archive to Claude Code.

## Project Structure & Module Organization

Source files live in `src/`. `src/main.ts` is the CLI entry point, `src/recorder.ts` contains recorder orchestration, and `src/types.ts` defines shared interfaces. Browser snapshot logic is under `src/snapshot/`; reusable helpers are under `src/utils/`. Unit tests live in `src/__tests__/`. Public documentation copied into recording archives is in `docs/`, while compiled output goes to `dist/`. Generated recordings belong in `recordings/` and should not be committed.

## Commands

```bash
# Run the recorder (any of these are equivalent)
npx ts-node src/main.ts <URL> [options]
npm start -- <URL> [options]
npm run record -- <URL> [options]

# Options:
#   --no-screenshots     Disable screenshots
#   --no-archive         Skip .zip creation
#   --no-console         Disable console log capture
#   --no-network         Disable XHR/fetch network capture
#   --har                Also write a full network.har (all resources) for manual analysis
#   --max-actions <N>    Stop after N actions
#   --output-dir <path>  Output directory (default: ./recordings)
#   --viewport-size=W,H  Viewport size (default: 1920,1080)
#   --jpeg [quality]     Override JPEG quality (JPEG is the default format, quality 80)
#   --help, -h           Show help
#   --version, -v        Show version

# Type check
npx tsc --noEmit

# Run all unit tests (Vitest)
npm test

# Run a single test file
npx vitest run src/__tests__/cli-parsers.test.ts   # URL/viewport parsing
npx vitest run src/__tests__/analysis-prompt.test.ts  # SESSION.md generation
npx vitest run src/__tests__/dom-cleaner.test.ts      # DOM cleaner (runs in jsdom)
npx vitest run src/__tests__/fs-helpers.test.ts       # ensureDir/writeScreenshot/generateOutputDir

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Build to dist/
npm run build
```

## Coding Style & Naming Conventions

Use strict TypeScript targeting ES2022 and CommonJS. Prefer small modules organized by responsibility: CLI parsing in `utils`, browser evaluation code in `snapshot`, and recorder flow in `recorder.ts`. Use camelCase for functions and variables, PascalCase for exported types/interfaces, and kebab-case test files such as `cli-parsers.test.ts`. Preserve existing async/await patterns and graceful fallbacks for non-critical capture failures. Use `@ts-expect-error` only for documented Playwright internal APIs such as `_enableRecorder`.

## Testing Guidelines

Tests use Vitest, not Jest. Test files are discovered by `src/**/__tests__/**/*.test.ts`. The default test environment is `node`; add `// @vitest-environment jsdom` for DOM/browser API tests such as `dom-cleaner.test.ts`. Focus unit tests on pure utilities and snapshot helpers. Recorder and CLI changes often require manual verification with a live Playwright browser in addition to unit tests.

## Commit & Pull Request Guidelines

Git history follows Conventional Commit-style prefixes: `feat:`, `fix:`, `docs:`, and `chore:`. Keep commit subjects specific, for example `fix: handle write stream error in archiver`. Pull requests should describe the behavior change, list verification commands, link related issues, and include screenshots or sample recording output when user-visible recorder behavior changes.

CI (`.github/workflows/ci.yml`) runs on push/PR to `main` with Node 20: `npm ci` → `npx tsc --noEmit` → `npm test`. Run both locally before pushing.

The package is published to npm as `ai-ready-pw-codegen` with `bin` → `dist/main.js`; `prepublishOnly` runs `npm run build`. User-visible changes need a `version` bump in `package.json` (history shows a separate `chore: bump version to X.Y.Z` commit).

## Architecture

Uses Playwright's built-in codegen (`context._enableRecorder()` internal API) for action capture and UI. AI-Ready PW Codegen hooks into codegen events to capture DOM snapshots, accessibility trees, screenshots, and console logs on each recorded action.

### Communication Protocol

```
Playwright Codegen (built-in recorder)
  → eventSink.actionAdded(page, data, code)
  → eventSink.actionUpdated(page, data, code)
    → recorder.ts enqueueAction → processAction (sequential Promise queue)
      → capture accessibility tree + cleaned DOM + screenshot + console logs
      → store in memory arrays (for actionUpdated overwrite support)
      → on finalize: write actions.jsonl + snapshots.jsonl to disk
```

**Dual `_enableRecorder` call**: First call opens the GUI inspector, second call (with `recorderMode: 'api'`) attaches the eventSink for programmatic access. Both coexist on the same context.

**Protocol auto-detection**: When URL has no protocol, tries `http://` first, falls back to `https://`. Explicit `http://` or `https://` used as-is.

**Important**: Uses Playwright internal API (underscore-prefixed). Playwright version is pinned (currently `1.59.1`) to prevent breakage — bump only after verifying `_enableRecorder` still works.

### Key Files

- **`src/main.ts`** — CLI entry point, URL validation with protocol fallback, launches Chromium, handles shutdown + archiving
- **`src/recorder.ts`** — Core class: enables codegen via `_enableRecorder`, listens for `actionAdded`/`actionUpdated` events, captures snapshots and console logs. Stores actions in memory arrays, writes JSONL on finalize. Supports `max-actions` stop via `onStop()` callback
- **`src/types.ts`** — All shared interfaces (`ConsoleLogEntry`, `RecordedAction`, `DomSnapshot`, `CodegenActionData`, `SessionMetadata`, `RecorderOptions`, `TargetSnapshot`, `SelectorCandidates`, `FrameContext`)
- **`src/snapshot/dom-cleaner.ts`** — Runs in browser via `page.evaluate()`: clones full page DOM from body, strips non-test attributes, max depth 30, max text 200 chars
- **`src/snapshot/accessibility.ts`** — `page.accessibility.snapshot()` with fallback to `ariaSnapshot()`
- **`src/snapshot/target-element.ts`** — Runs in browser via `elementHandle.evaluate()`: captures target element snapshot (tag, ARIA role, accessible name, state, bounding box, ancestors, computed style) + builds selector candidates (testId, role+name, label, placeholder, text, CSS, XPath)
- **`src/utils/cli-parsers.ts`** — `parseAndValidateUrl` (protocol detection logic) + `parseViewportSize` (validates `W,H` format, range 1–7680). Extracted for unit-testability.
- **`src/utils/archiver.ts`** — Creates `.zip` archive via `archiver` npm package (cross-platform, pure JS)
- **`src/utils/analysis-prompt.ts`** — Generates `SESSION.md` with session metadata
- **`src/utils/fs-helpers.ts`** — Async `ensureDir`, `writeScreenshot`, `generateOutputDir`; `copyDocsToOutput` copies `docs/*.md` into the recording dir at finalization

### Key Patterns

- **Sequential Promise queue**: Actions are processed one-at-a-time via `actionQueue` chain in `recorder.ts`. Never parallel — order matters.
- **Frame resolution for iframe actions**: `recorder.ts::resolveFrame` walks `CodegenActionData.frame.framePath` via `locator(sel).elementHandle().contentFrame()` for each level, returning the target `Frame`. `captureTargetElement` and the DOM cleaner then run in that frame's context. On any failure — graceful fallback to `page`. Accessibility tree is always captured from `page` (Playwright `Frame` has no `.accessibility` API).
- **DOM cleaner runs in-browser**: `dom-cleaner.ts` exports a function passed to `page.evaluate()`. Whitelists test/semantic attributes, strips scripts/styles, max depth 30, max text 200 chars.
- **Console log capture**: Subscribes to `page.on('console')` and `page.on('pageerror')`, accumulates logs between actions, attaches them to the next `RecordedAction.consoleLogs`.
- **Network capture**: Subscribes to XHR/fetch responses, stores small text/JSON request and response bodies, and attaches completed requests to the next `RecordedAction.networkRequests`. This per-action capture is the default and is optimized for AI context (only XHR/fetch, bodies capped at 10 KB).
- **`--har` (full HAR)**: Optional, off by default. Enables Playwright's native `recordHar` on the context (`main.ts`), writing a standard `network.har` (all resources, full headers/bodies) into the recording dir for manual analysis — not meant to be loaded into AI context. HAR is flushed only on `context.close()`, so `main.ts::finalize` explicitly closes the context (idempotent) before archiving. Independent of the per-action capture above.
- **Console progress**: Each action prints a human-readable line `[NNN] <type> → <description>` via `formatActionLine()` in `recorder.ts`. Green = success, yellow = capture failed. Description is derived from `target.role`/`target.accessibleName` when available, fallback to selector or URL.
- **Finalization safety**: 5s timeout on action queue drain + 10s absolute timeout in `main.ts` to prevent zombie processes. Shutdown triggers: context close, page close, browser disconnect, SIGINT, SIGTERM.
- **`@ts-expect-error` for internal APIs**: Used to suppress TS errors on `_enableRecorder` and other underscore-prefixed Playwright internals.
- **Non-blocking captures**: Screenshot/snapshot failures don't block action recording.
- **Tests**: Vitest (not Jest). Test files live in `src/__tests__/`. Default environment is `node`. Add `// @vitest-environment jsdom` at the top of files that test browser-API code (e.g. `dom-cleaner.test.ts`). Cover pure utility functions only — recorder/main require a live Playwright context, so they're not unit-tested.

### Output Format

```
recordings/test-YYYY-MM-DDTHH-mm-ss-sssZ-xxxxxx/
├── SESSION.md              # session metadata (entry point)
├── DATA_FORMAT.md          # data format reference (from docs/)
├── TEST_GUIDE.md           # test generation guidelines (from docs/)
├── actions.jsonl           # all actions, one JSON per line (primary file)
├── snapshots.jsonl         # cleaned DOM snapshots, one per line (on demand)
└── screenshots/
    ├── 001-navigate.jpg
    └── 002-click.jpg
```

Action types are determined by Playwright codegen: `navigate`, `click`, `fill`, `press`, `select`, `check`, `uncheck`, `hover`, etc. Screenshots are **JPEG by default** (quality 80); pass `--jpeg [quality]` to override quality.

Each action line in `actions.jsonl` includes `action.codegenCode` (generated Playwright code), `action.position`/`modifiers`/`button`/`clickCount` (full codegen data), `target` (element snapshot with state, ARIA, bounding box), `selectors` (testId/role/css/xpath candidates), `frame` (iframe context — present only for actions inside iframes), `accessibilityTree`, `screenshotFile`, and optional `consoleLogs`/`networkRequests`. DOM snapshots are in separate `snapshots.jsonl` to save context window.
