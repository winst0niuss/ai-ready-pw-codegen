# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

**DOMTrace** — offline Playwright recorder that captures user interactions with DOM snapshots, accessibility trees, and screenshots for later AI analysis (test generation, Page Object creation). Uses Playwright's built-in codegen as the UI/interaction layer. Acts as an "offline MCP Playwright" — record on a machine without AI access, then send the archive to Claude Code.

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

Uses Playwright's built-in codegen (`context._enableRecorder()` internal API) for action capture and UI. DOMTrace hooks into codegen events to capture DOM snapshots, accessibility trees, and screenshots on each recorded action.

### Communication Protocol

```
Playwright Codegen (built-in recorder)
  → eventSink.actionAdded(page, data, code)
  → eventSink.actionUpdated(page, data, code)
    → recorder.ts enqueueAction → processAction (sequential Promise queue)
      → capture accessibility tree + cleaned DOM + screenshot
      → write JSON to disk
```

**Dual `_enableRecorder` call**: First call opens the GUI inspector, second call (with `recorderMode: 'api'`) attaches the eventSink for programmatic access. Both coexist on the same context.

**Important**: Uses Playwright internal API (underscore-prefixed). Playwright version is pinned to 1.58.2 to prevent breakage.

### Key Files

- **`src/main.ts`** — CLI entry point, launches Chromium (headed), handles shutdown + archiving
- **`src/recorder.ts`** — Core class: enables codegen via `_enableRecorder`, listens for `actionAdded`/`actionUpdated` events, captures snapshots, writes action JSONs. Uses Promise queue for sequential processing. Handles `actionUpdated` by overwriting the last action (codegen merges keystrokes into fill)
- **`src/types.ts`** — All shared interfaces (`RecordedAction`, `CodegenActionData`, `SessionMetadata`)
- **`src/snapshot/dom-cleaner.ts`** — Runs in browser via `page.evaluate()`: clones full page DOM from body, strips non-test attributes, max depth 15
- **`src/snapshot/accessibility.ts`** — `page.accessibility.snapshot()` with fallback to `ariaSnapshot()`

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
