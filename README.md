# DOMTrace Playwright

Offline Playwright recorder that captures user interactions with DOM snapshots, accessibility trees, and screenshots — then packages everything into an archive for AI-powered test generation.

> Record on any machine. Generate tests with AI later.

## Why DOMTrace?

- **Offline-first** — no AI connection needed during recording
- **Rich context** — each action captures accessibility tree, cleaned DOM, and screenshot
- **AI-ready output** — JSONL archive with built-in analysis prompt for LLMs
- **Playwright codegen** — uses built-in Playwright recorder UI for reliable action capture
- **Compact archives** — DOM snapshots separated from actions to save AI context window

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

1. Launches headed Chromium with Playwright's built-in codegen recorder UI
2. Hooks into codegen events (`actionAdded`/`actionUpdated`) for programmatic access
3. On each user action: captures accessibility tree + cleaned DOM + screenshot
4. On browser close: writes JSONL files, generates `ANALYSIS_PROMPT.md`, archives into `.tar.gz`

## Output Format

```
recordings/recording-YYYY-MM-DDTHH-mm-ss/
├── ANALYSIS_PROMPT.md      # AI instructions + session metadata (start here)
├── actions.jsonl           # All actions, one JSON per line (primary data)
├── snapshots.jsonl         # Cleaned DOM snapshots, one per line (on demand)
└── screenshots/
    ├── 001-navigate.png
    └── 002-click.png
```

### actions.jsonl

Each line is a JSON object:

```json
{"index":1,"timestamp":"...","url":"...","action":{"type":"click","selector":"...","codegenCode":"..."},"accessibilityTree":{...},"screenshotFile":"screenshots/001-click.png"}
```

Key fields:
- `action.type` — `navigate`, `click`, `fill`, `press`, `select`, `check`, `uncheck`, `hover`, `assertVisible`
- `action.selector` — Playwright selector
- `action.codegenCode` — generated Playwright test code snippet
- `accessibilityTree` — page accessibility snapshot at action time

### snapshots.jsonl

Each line: `{"index":1,"cleanedDom":"<body>...</body>"}` — cleaned HTML with non-test attributes stripped, max depth 15. Read only when accessibility tree lacks needed details.

### ANALYSIS_PROMPT.md

Included in every archive. Contains session metadata and instructions for AI to analyze the recording. When sending an archive to Claude Code, Gemini CLI, or Cursor — the AI reads this file first and knows how to process the rest.

## Using with AI

```bash
# 1. Record
npx ts-node src/main.ts https://your-app.com

# 2. Send archive to AI
# Extract and point Claude Code / Cursor / Gemini CLI to the recording directory
tar -xzf recordings/recording-*.tar.gz
# AI reads ANALYSIS_PROMPT.md → actions.jsonl → screenshots → generates tests
```

## Architecture

Uses Playwright's built-in codegen (`context._enableRecorder()` internal API) for action capture and UI. DOMTrace hooks into codegen events to capture DOM snapshots, accessibility trees, and screenshots on each recorded action.

**Dual `_enableRecorder` call**: First call opens the GUI inspector, second call (with `recorderMode: 'api'`) attaches the eventSink for programmatic access.

**Important**: Uses Playwright internal API (underscore-prefixed). Playwright version is pinned to 1.58.2 to prevent breakage.

### Key Files

| File | Purpose |
|------|---------|
| `src/main.ts` | CLI entry point, launches Chromium, handles shutdown + archiving |
| `src/recorder.ts` | Core: enables codegen, captures snapshots, writes JSONL |
| `src/types.ts` | Shared interfaces (`RecordedAction`, `DomSnapshot`, `SessionMetadata`) |
| `src/snapshot/dom-cleaner.ts` | DOM cleaning via `page.evaluate()` (strips non-test attrs, max depth 15) |
| `src/snapshot/accessibility.ts` | `page.accessibility.snapshot()` with `ariaSnapshot()` fallback |
| `src/utils/analysis-prompt.ts` | Generates `ANALYSIS_PROMPT.md` with session metadata |
| `src/utils/archiver.ts` | Creates `.tar.gz` archive |

## Development

```bash
npm run build          # Build to dist/
npx tsc --noEmit       # Type check
```

## Contributing

```bash
git clone https://github.com/winst0niuss/domtrace-playwright.git
cd domtrace-playwright
npm install
```

## License

MIT
