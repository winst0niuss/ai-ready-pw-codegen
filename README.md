# SnapScribe

Offline Playwright recorder that captures user interactions with DOM snapshots, accessibility trees, and screenshots — then packages everything into an archive for AI-powered test generation.

> Record on any machine. Generate tests with AI later.

## Why SnapScribe?

- **Offline-first** — no AI connection needed during recording
- **Rich context** — each action captures cleaned DOM, accessibility tree, and screenshot
- **AI-ready output** — structured JSON archive designed for LLM analysis
- **SPA-aware** — intercepts `pushState`/`replaceState` for single-page apps
- **WaitFor mode** — manually mark elements to assert visibility/presence

## Quick Start

### Prerequisites

- Node.js >= 18
- npm

### Install & Run

```bash
npm install
npx ts-node src/main.ts https://example.com
```

### CLI Options

```
npx ts-node src/main.ts <URL> [options]

Options:
  --no-screenshots     Disable screenshots
  --output-dir <path>  Output directory (default: ./recordings)
  --width <number>     Viewport width (default: 1280)
  --height <number>    Viewport height (default: 720)
```

### Example

```bash
npx ts-node src/main.ts https://demo.playwright.dev/todomvc --output-dir ./my-recording
```

## How It Works

1. Launches headed Chromium via Playwright
2. Injects event listeners that capture clicks, input, select, keypress, submit, and navigation
3. On each user action: captures accessibility tree + cleaned DOM + screenshot
4. Saves structured JSON per action to disk
5. On browser close: archives everything into a `.tar.gz`

### Recording UI

- **Toolbar** (top of page) — shows recording indicator, switch between **Record** and **WaitFor** modes
- **Action Log** (separate window) — live feed of captured actions with type badges

### WaitFor Mode

Switch to WaitFor mode via the toolbar to mark elements for assertion. Click any element on the page, then choose a condition:

- `visible` — element should be visible
- `hidden` — element should be hidden
- `attached` — element should exist in DOM
- `detached` — element should not exist in DOM

Press `Escape` to exit WaitFor mode.

## Output Format

```
recordings/recording-YYYY-MM-DDTHH-mm-ss/
├── metadata.json           # Session info: startUrl, timestamps, viewport
├── actions/
│   ├── 001-navigate.json   # One file per action
│   ├── 002-click.json
│   └── ...
└── screenshots/
    ├── 001-navigate.png    # Screenshot after each action
    └── ...
```

### Action JSON Structure

```json
{
  "index": 2,
  "timestamp": "2025-01-15T10:30:00.000Z",
  "url": "https://example.com/page",
  "action": {
    "type": "click",
    "elementInfo": {
      "tagName": "button",
      "id": "submit-btn",
      "classes": ["btn", "btn-primary"],
      "text": "Submit",
      "attributes": { "data-testid": "submit", "role": "button" },
      "cssSelector": "[data-testid=\"submit\"]",
      "xpath": "//*[@id=\"submit-btn\"]",
      "boundingBox": { "x": 100, "y": 200, "width": 80, "height": 36 }
    }
  },
  "snapshot": {
    "accessibilityTree": { "role": "WebArea", "children": [...] },
    "cleanedDom": "<body>...</body>"
  },
  "screenshotFile": "screenshots/002-click.png"
}
```

### Action Types

| Type | Description | Extra Fields |
|------|-------------|-------------|
| `navigate` | Page navigation | — |
| `click` | Element click | `elementInfo` |
| `fill` | Text input | `value`, `elementInfo` |
| `select` | Dropdown selection | `value`, `elementInfo` |
| `keypress` | Key press (Enter/Tab/Escape) | `key`, `elementInfo` |
| `submit` | Form submission | `elementInfo` |
| `waitFor` | Manual assertion marker | `condition`, `elementInfo` |

## Generating Tests from Recordings

See **[ANALYZING_RECORDINGS.md](./ANALYZING_RECORDINGS.md)** — an instruction document you can send alongside the archive to Claude or another LLM for automated test generation.

## Architecture

Two-layer system:

- **Node.js layer** (Playwright) — manages the browser, captures accessibility trees and DOM snapshots, saves data to disk
- **Browser layer** (injected scripts) — captures user events, generates selectors, communicates via `console.debug` protocol

### Key Files

| File | Purpose |
|------|---------|
| `src/main.ts` | CLI entry point, launches Chromium, handles shutdown + archiving |
| `src/recorder.ts` | Core class: script injection, console message listener, snapshot capture, action queue |
| `src/types.ts` | Shared TypeScript interfaces |
| `src/injected/listener.ts` | Browser-side event capture (IIFE injected via `addInitScript`) |
| `src/injected/toolbar.ts` | In-page toolbar with Record/WaitFor mode switching |
| `src/overlay-window.ts` | Separate action log window |
| `src/snapshot/dom-cleaner.ts` | DOM cleaning (strips non-test attributes, truncates deep trees) |
| `src/snapshot/accessibility.ts` | Accessibility tree capture with aria snapshot fallback |

## Development

```bash
npm run build          # Build to dist/
npx tsc --noEmit       # Type check
```

## License

MIT
