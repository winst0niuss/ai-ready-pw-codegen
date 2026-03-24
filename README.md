# AI-Ready PW Codegen

[![npm version](https://img.shields.io/npm/v/ai-ready-pw-codegen)](https://www.npmjs.com/package/ai-ready-pw-codegen)
[![playwright](https://img.shields.io/badge/playwright-1.58.2-45ba4b)](https://playwright.dev/)
[![license](https://img.shields.io/npm/l/ai-ready-pw-codegen)](https://github.com/winst0niuss/ai-ready-pw-codegen/blob/main/LICENSE)

Offline Playwright recorder. Captures each user action with accessibility tree, cleaned DOM, screenshot, and console logs — packages everything into an archive for AI-powered test generation.

> Record on any machine. Generate tests with AI later.

## Quick Start

```bash
npm install -g ai-ready-pw-codegen
ai-ready-pw-codegen https://your-app.com
```

A Chromium browser opens with Playwright's recorder UI. Interact with the page. Close the browser — the recording is archived automatically.

```
🎭 AI-Ready PW Codegen
   URL: https://your-app.com
   Output: ./recordings/test-2026-03-23T15-08-06

Recording... Close the browser to stop.
●●●●●●●●●●
Recorded 10 actions
Archive: ./recordings/test-2026-03-23T15-08-06.tar.gz
✅ Done! Send the archive to AI for analysis.
```

## Why?

**Problem:** AI tools (Claude Code, Cursor, Gemini CLI) can generate tests, but they need page context — DOM structure, accessibility tree, selectors. Getting this context manually is tedious.

**Solution:** Record once, capture everything, send to AI. Works offline — no AI connection needed during recording.

What gets captured per action:
- Accessibility tree (roles, names, states)
- Cleaned DOM (test-relevant attributes only, max depth 30)
- Screenshot
- Console logs (errors, warnings)
- Full codegen data (selector, position, modifiers, generated code)

## CLI Options

```
ai-ready-pw-codegen <URL> [options]

  --no-screenshots     Disable screenshots
  --no-archive         Skip .tar.gz creation
  --no-console         Disable console log capture
  --headless           Run in headless mode
  --max-actions <N>    Stop after N actions
  --output-dir <path>  Output directory (default: ./recordings)
  --width <number>     Viewport width (default: 1280)
  --height <number>    Viewport height (default: 720)
```

URL protocol is auto-detected: tries `http://` first, falls back to `https://`. Explicit protocol (`http://...` or `https://...`) is used as-is.

## Output

```
recordings/test-YYYY-MM-DDTHH-mm-ss/
├── SESSION.md              # AI reads this first — session metadata
├── DATA_FORMAT.md          # Data format reference
├── TEST_GUIDE.md           # Test generation guidelines
├── actions.jsonl           # One action per line — primary data
├── snapshots.jsonl         # Cleaned DOM per action — read on demand
└── screenshots/
    ├── 001-navigate.png
    └── 002-click.png
```

### actions.jsonl

```json
{
  "index": 2,
  "timestamp": "2026-03-23T15:08:07.123Z",
  "url": "https://your-app.com/dashboard",
  "action": {
    "type": "click",
    "selector": "[data-testid=\"submit-btn\"]",
    "codegenCode": "await page.getByTestId('submit-btn').click()",
    "position": { "x": 150, "y": 320 },
    "button": "left"
  },
  "accessibilityTree": { "role": "WebArea", "children": [...] },
  "screenshotFile": "screenshots/002-click.png",
  "consoleLogs": [
    { "level": "error", "text": "Failed to fetch /api/data", "timestamp": "..." }
  ]
}
```

### snapshots.jsonl

DOM snapshots are large — separated from actions to save AI context window. Each line: `{"index": 2, "cleanedDom": "<body>...</body>"}`. Read only when accessibility tree lacks details about DOM hierarchy or test attributes.

## Using with AI

```bash
# 1. Record
ai-ready-pw-codegen https://your-app.com

# 2. Extract
tar -xzf recordings/test-*.tar.gz

# 3. Point AI to the directory
# Claude Code / Cursor / Gemini CLI reads SESSION.md first,
# then actions.jsonl → screenshots → generates tests
```

See [docs/DATA_FORMAT.md](docs/DATA_FORMAT.md) and [docs/TEST_GUIDE.md](docs/TEST_GUIDE.md) for detailed instructions on how AI should process recordings and generate tests. Both files are automatically included in every archive.

## How It Works

1. Launches headed Chromium with Playwright's built-in codegen recorder UI
2. Hooks into codegen events (`actionAdded`/`actionUpdated`) via internal `_enableRecorder` API
3. On each action: captures accessibility tree + cleaned DOM + screenshot + console logs
4. On browser close: writes JSONL files, generates `SESSION.md`, archives into `.tar.gz`

Uses Playwright internal API (underscore-prefixed). Playwright version pinned to 1.58.2.

## Development

```bash
git clone https://github.com/winst0niuss/ai-ready-pw-codegen.git
cd ai-ready-pw-codegen
npm install
npm run build          # Build to dist/
npx tsc --noEmit       # Type check
npx ts-node src/main.ts https://example.com  # Run from source
```

## License

MIT
