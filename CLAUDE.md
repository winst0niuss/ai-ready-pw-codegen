# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

**AI-Ready PW Codegen** — offline Playwright recorder that captures user interactions with DOM snapshots, accessibility trees, and screenshots for later AI analysis (test generation, Page Object creation). Uses Playwright's built-in codegen as the UI/interaction layer. Acts as an "offline MCP Playwright" — record on a machine without AI access, then send the archive to Claude Code.

## Commands

```bash
# Run the recorder
npx ts-node src/main.ts <URL> [--no-screenshots] [--output-dir ./recordings] [--width 1280] [--height 720]

# Type check
npx tsc --noEmit

# Build to dist/
npm run build
```

No tests or linter configured.

## Architecture

Uses Playwright's built-in codegen (`context._enableRecorder()` internal API) for action capture and UI. AI-Ready PW Codegen hooks into codegen events to capture DOM snapshots, accessibility trees, and screenshots on each recorded action.

### Communication Protocol

```
Playwright Codegen (built-in recorder)
  → eventSink.actionAdded(page, data, code)
  → eventSink.actionUpdated(page, data, code)
    → recorder.ts enqueueAction → processAction (sequential Promise queue)
      → capture accessibility tree + cleaned DOM + screenshot
      → store in memory arrays (for actionUpdated overwrite support)
      → on finalize: write actions.jsonl + snapshots.jsonl to disk
```

**Dual `_enableRecorder` call**: First call opens the GUI inspector, second call (with `recorderMode: 'api'`) attaches the eventSink for programmatic access. Both coexist on the same context.

**Important**: Uses Playwright internal API (underscore-prefixed). Playwright version is pinned to 1.58.2 to prevent breakage.

### Key Files

- **`src/main.ts`** — CLI entry point, launches Chromium (headed), handles shutdown + archiving
- **`src/recorder.ts`** — Core class: enables codegen via `_enableRecorder`, listens for `actionAdded`/`actionUpdated` events, captures snapshots. Stores actions in memory arrays, writes `actions.jsonl` + `snapshots.jsonl` on finalize. Handles `actionUpdated` by overwriting last array entry (codegen merges keystrokes into fill). Returns metadata for `ANALYSIS_PROMPT.md`
- **`src/types.ts`** — All shared interfaces (`RecordedAction`, `DomSnapshot`, `CodegenActionData`, `SessionMetadata`)
- **`src/snapshot/dom-cleaner.ts`** — Runs in browser via `page.evaluate()`: clones full page DOM from body, strips non-test attributes, max depth 15
- **`src/snapshot/accessibility.ts`** — `page.accessibility.snapshot()` with fallback to `ariaSnapshot()`
- **`src/utils/archiver.ts`** — Creates `.tar.gz` archive via shell `tar -czf`
- **`src/utils/analysis-prompt.ts`** — Generates `ANALYSIS_PROMPT.md` with session metadata + AI instructions
- **`src/utils/fs-helpers.ts`** — `ensureDir`, `writeScreenshot`, `generateOutputDir`

### Key Patterns

- **Sequential Promise queue**: Actions are processed one-at-a-time via `actionQueue` chain in `recorder.ts`. Never parallel — order matters.
- **DOM cleaner runs in-browser**: `dom-cleaner.ts` exports a function passed to `page.evaluate()`. Whitelists test/semantic attributes, strips scripts/styles, max depth 15, max text 200 chars.
- **Finalization safety**: 5s timeout on action queue drain + 10s absolute timeout in `main.ts` to prevent zombie processes. Shutdown triggers: context close, page close, browser disconnect, SIGINT, SIGTERM.
- **`@ts-expect-error` for internal APIs**: Used to suppress TS errors on `_enableRecorder` and other underscore-prefixed Playwright internals.
- **Non-blocking captures**: Screenshot/snapshot failures are logged but don't block action recording.

### Output Format

```
recordings/recording-YYYY-MM-DDTHH-mm-ss/
├── ANALYSIS_PROMPT.md      # AI instructions + session metadata inline
├── actions.jsonl           # all actions, one JSON per line (primary file)
├── snapshots.jsonl         # cleaned DOM snapshots, one per line (on demand)
└── screenshots/
    ├── 001-navigate.png
    └── 002-click.png
```

Action types are determined by Playwright codegen: `navigate`, `click`, `fill`, `press`, `select`, `check`, `uncheck`, `hover`, etc.

Each action line in `actions.jsonl` includes `action.codegenCode` (generated Playwright code), `accessibilityTree`, and `screenshotFile`. DOM snapshots are in separate `snapshots.jsonl` to save context window.
