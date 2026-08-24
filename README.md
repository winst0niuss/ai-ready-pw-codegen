# AI-Ready PW Codegen

[![npm version](https://img.shields.io/npm/v/ai-ready-pw-codegen)](https://www.npmjs.com/package/ai-ready-pw-codegen)
[![playwright](https://img.shields.io/badge/playwright-1.59.1-45ba4b)](https://playwright.dev/)
[![license](https://img.shields.io/npm/l/ai-ready-pw-codegen)](https://github.com/winst0niuss/ai-ready-pw-codegen/blob/main/LICENSE)

<br>

**AI-Ready PW Codegen** is an offline Playwright recorder. It captures every user action alongside its **accessibility tree**, **cleaned DOM**, **screenshots**, **console logs**, and **XHR/fetch requests**, then packages everything into a structured archive for AI-powered test generation.

<br>

<p align="center">
  <img src="architecture.png" alt="AI-Ready PW Codegen Architecture" width="100%">
</p>

<p align="center">
  <i>Record on any machine. Generate tests with AI later.</i>
</p>

<br>

## Quick Start

```bash
npm install -g ai-ready-pw-codegen
ai-ready-pw-codegen https://your-app.com
```

A Chromium browser opens with Playwright's recorder UI. Interact with the page. Close the browser — the recording is archived automatically.

```
🎭 AI-Ready PW Codegen
🌐 URL: https://your-app.com
📂 Output: ./recordings/test-2026-03-23T15-08-06

🔴 Recording... Close the browser to stop.
[001] navigate   → https://your-app.com
[002] click      → button "Sign in"
[003] fill       → textbox "Email" = "user@example.com"
[004] fill       → textbox "Password" = "••••••••"
[005] click      → button "Submit"

🎬 Recorded 5 actions
📦 Archive: ./recordings/test-2026-03-23T15-08-06.zip
✨ Done! Send the archive to AI for analysis. 🤖
```

## Why?

**Problem:** AI tools (Claude Code, Cursor, Gemini CLI) can generate tests, but they need page context — DOM structure, accessibility tree, selectors. Getting this context manually is tedious.

**Solution:** Record once, capture everything, send to AI. Works offline — no AI connection needed during recording.

What gets captured per action:
- Target element snapshot (tag, ARIA role, accessible name, state, bounding box, computed style, ancestors)
- Selector candidates (testId, role+name, label, text, placeholder, CSS, XPath) for robust test generation
- Frame context for actions inside iframes (framePath, frame URL)
- Accessibility tree (roles, names, states)
- Cleaned DOM (test-relevant attributes only, max depth 30)
- Screenshot
- Console logs (errors, warnings)
- XHR/fetch network requests and small text/JSON bodies
- Full codegen data (selector, position, modifiers, generated code)

## CLI Options

```
ai-ready-pw-codegen <URL> [options]

  --no-screenshots     Disable screenshots
  --no-archive         Skip .zip creation
  --no-console         Disable console log capture
  --no-network         Disable XHR/fetch network capture
  --har                Also write a full network.har (all resources) for manual analysis
  --max-actions <N>    Stop after N actions
  --output-dir <path>  Output directory (default: ./recordings)
  --viewport-size=W,H  Viewport size (default: 1920,1080)
  --jpeg [quality]     JPEG screenshot quality (default: 80). JPEG is the default format; use --no-screenshots to disable
```

URL protocol is auto-detected: tries `http://` first, falls back to `https://`. Explicit protocol (`http://...` or `https://...`) is used as-is.

## Output

```
recordings/test-YYYY-MM-DDTHH-mm-ss-sssZ-xxxxxx/
├── SESSION.md              # AI reads this first — session metadata
├── DATA_FORMAT.md          # Data format reference
├── TEST_GUIDE.md           # Test generation guidelines
├── actions.jsonl           # One action per line — primary data
├── snapshots.jsonl         # Cleaned DOM per action — read on demand
├── screenshots/
│   ├── 001-navigate.jpg    # JPEG by default (use --jpeg [quality] to tune, default quality: 80)
│   └── 002-click.jpg
└── network.har             # Only with --har — full network dump for manual analysis
```

Unless `--no-archive` is passed, this directory is zipped to `recordings/test-….zip` and then removed. If the archive turns out incomplete, the directory is kept instead — you never end up without a copy.

### actions.jsonl

```json
{
  "index": 2,
  "timestamp": "2026-04-11T15:08:07.123Z",
  "url": "https://your-app.com/dashboard",
  "action": {
    "type": "click",
    "selector": "[data-testid=\"submit-btn\"]",
    "codegenCode": "await page.getByTestId('submit-btn').click()",
    "position": { "x": 150, "y": 320 },
    "button": "left"
  },
  "target": {
    "tagName": "BUTTON",
    "role": "button",
    "accessibleName": "Submit",
    "attributes": { "data-testid": "submit-btn", "type": "submit" },
    "boundingBox": { "x": 140, "y": 310, "width": 80, "height": 32 },
    "inViewport": true,
    "state": { "visible": true, "enabled": true, "focused": false }
  },
  "selectors": {
    "codegen": "[data-testid=\"submit-btn\"]",
    "testId": "submit-btn",
    "role": { "role": "button", "name": "Submit" },
    "css": "button#submit-btn"
  },
  "frame": { "path": ["iframe#checkout"], "url": "https://pay.example.com/form" },
  "accessibilityTree": { "role": "WebArea", "children": [] },
  "screenshotFile": "screenshots/002-click.jpg",
  "consoleLogs": [
    { "level": "error", "text": "Failed to fetch /api/data", "timestamp": "..." }
  ],
  "networkRequests": [
    {
      "url": "https://your-app.com/api/data",
      "method": "GET",
      "status": 200,
      "duration": 120,
      "timestamp": "...",
      "responseBody": { "ok": true }
    }
  ]
}
```

`target`/`selectors` are captured for every action with a selector (skipped for `navigate`). `frame` is present only for actions inside iframes.

### snapshots.jsonl

DOM snapshots are large — separated from actions to save AI context window. Each line: `{"index": 2, "cleanedDom": "<body>...</body>"}`. Read only when accessibility tree lacks details about DOM hierarchy or test attributes.

## Using with AI

```bash
# 1. Record
ai-ready-pw-codegen https://your-app.com

# 2. Extract
unzip recordings/test-*.zip

# 3. Point AI to the directory
# Claude Code / Cursor / Gemini CLI reads SESSION.md first,
# then actions.jsonl → screenshots → generates tests
```

See [docs/DATA_FORMAT.md](docs/DATA_FORMAT.md) and [docs/TEST_GUIDE.md](docs/TEST_GUIDE.md) for detailed instructions on how AI should process recordings and generate tests. Both files are automatically included in every archive.

## How It Works

1. Launches headed Chromium with Playwright's built-in codegen recorder UI
2. Hooks into codegen events (`actionAdded`/`actionUpdated`) via internal `_enableRecorder` API
3. On each action: captures accessibility tree + cleaned DOM + screenshot + console logs + XHR/fetch requests + target element snapshot with selector candidates
4. Walks `framePath` for actions inside iframes — target element, DOM snapshot and selectors are captured from the correct frame
5. Writes each action to `actions.jsonl`/`snapshots.jsonl` immediately — a crash costs at most the last action, not the session
6. On browser close: generates `SESSION.md`, copies the docs and archives everything into `.zip`

Uses Playwright internal API (underscore-prefixed). Playwright version pinned to 1.59.1.

## Development

```bash
git clone https://github.com/winst0niuss/ai-ready-pw-codegen.git
cd ai-ready-pw-codegen
npm install
npm run build          # Build to dist/
npx tsc --noEmit       # Type check
npm test               # Unit tests (Vitest)
npx ts-node src/main.ts https://example.com  # Run from source
```

## License

MIT
