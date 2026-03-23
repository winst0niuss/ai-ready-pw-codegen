# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

**DOMTrace** — offline Playwright recorder that captures user interactions with DOM snapshots, accessibility trees, and screenshots for later AI analysis (test generation, Page Object creation). Acts as an "offline MCP Playwright" — record on a machine without AI access, then send the archive to Claude Code.

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

Two-layer system: **Node.js** (Playwright) manages the browser and saves data; **Browser** (injected scripts) captures user actions.

### Communication Protocol

```
Browser (listener.ts)
  → console.debug('__RECORDER__:' + JSON.stringify(payload))
    → Node.js page.on('console') in recorder.ts
      → enqueueAction → processAction (sequential Promise queue)
        → capture accessibility tree + cleaned DOM + screenshot
        → write JSON to disk

Node.js (recorder.ts)
  → overlayPage.evaluate() pushes action data
    → overlay-window.ts renders action in separate log window
```

### Key Files

- **`src/main.ts`** — CLI entry point, launches Chromium (headed), handles shutdown + archiving
- **`src/recorder.ts`** — Core class: injects scripts via `addInitScript`, listens for `__RECORDER__:` console messages, captures snapshots, writes action JSONs. Uses Promise queue for sequential processing
- **`src/types.ts`** — All shared interfaces (`RecordedAction`, `ElementInfo`, `BrowserActionPayload`, `WaitForCondition`)
- **`src/injected/listener.ts`** — Browser IIFE: captures click/input(debounced 300ms)/change/keydown/submit events in capture phase, generates CSS selectors and XPath, intercepts pushState for SPA navigation
- **`src/injected/toolbar.ts`** — In-page toolbar (closed Shadow DOM, Catppuccin dark theme): Record/WaitFor mode switching, element picker with condition selector (visible/hidden/attached/detached). Re-injects via MutationObserver if SPA framework removes it
- **`src/overlay-window.ts`** — HTML for separate action log window (opened in a separate browser context), displays live action feed with type badges
- **`src/snapshot/dom-cleaner.ts`** — Runs in browser via `page.evaluate()`: clones full page DOM from body, strips non-test attributes, max depth 15
- **`src/snapshot/accessibility.ts`** — `page.accessibility.snapshot()` with fallback to `ariaSnapshot()`

### Injected Script Patterns

- Guard: `window.__RECORDER_INJECTED__` / `window.__RECORDER_TOOLBAR_INJECTED__` prevents double-injection
- Target element stored in `window.__RECORDER_LAST_TARGET__` for `page.evaluate()` access
- Toolbar uses **closed Shadow DOM** for CSS isolation; `isOverlayElement()` guard in listener prevents recording toolbar interactions
- All event listeners use **capture phase** (`addEventListener(..., true)`)

### Output Format

```
recordings/recording-YYYY-MM-DDTHH-mm-ss/
├── metadata.json           # startUrl, timestamps, totalActions, viewport
├── actions/
│   ├── 001-navigate.json   # { index, timestamp, url, action, snapshot, screenshotFile }
│   └── 002-click.json
└── screenshots/
    ├── 001-navigate.png
    └── 002-click.png
```

Action types: `navigate`, `click`, `fill`, `select`, `keypress`, `submit`, `waitFor`

## Adding New Action Types

1. Add to union types in `src/types.ts` (`RecordedAction.action.type` + `BrowserActionPayload.type`)
2. Add event listener in `src/injected/listener.ts` (capture phase, with `isOverlayElement` guard)
3. Add badge style in `src/injected/toolbar-styles.ts` (`.badge-{type}`) and `src/overlay-window.ts`
4. Handle in `src/recorder.ts` `processAction` if special fields needed
