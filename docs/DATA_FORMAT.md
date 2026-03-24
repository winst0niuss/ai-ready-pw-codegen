# Analyzing AI-Ready PW Codegen Recordings

You are analyzing a recording from **AI-Ready PW Codegen** — an offline Playwright recorder.

> Session metadata is in `SESSION.md` inside every archive.

## Archive Structure

```
test-YYYY-MM-DDTHH-mm-ss/
├── SESSION.md              ← start here (session metadata)
├── DATA_FORMAT.md          ← data format reference (this file)
├── TEST_GUIDE.md           ← test generation guidelines
├── actions.jsonl           ← all actions, one JSON per line
├── snapshots.jsonl         ← cleaned DOM snapshots (read on demand)
└── screenshots/
    ├── 001-navigate.png
    └── ...
```

## actions.jsonl

Each line is a JSON object — one user action with full page context:

| Field | Description |
|-------|-------------|
| `index` | Sequential action number |
| `timestamp` | ISO 8601 timestamp |
| `url` | Page URL at action time |
| `action.type` | `navigate`, `click`, `fill`, `press`, `select`, `check`, `uncheck`, `hover`, `assertVisible` |
| `action.selector` | Playwright selector (codegen format) |
| `action.value` | Entered text (`fill`, `select`) |
| `action.key` | Key name (`press`: Enter, Tab, Escape, etc.) |
| `action.codegenCode` | Generated Playwright test code snippet |
| `action.position` | Click coordinates `{ x, y }` |
| `action.modifiers` | Keyboard modifiers (Shift, Ctrl, etc.) |
| `action.button` | Mouse button (left/right/middle) |
| `action.clickCount` | Single/double/triple click |
| `accessibilityTree` | Full page accessibility tree at action time |
| `screenshotFile` | Relative path to screenshot (or `null`) |
| `consoleLogs` | Browser console messages since previous action (optional) |

## snapshots.jsonl

Each line: `{"index": N, "cleanedDom": "<body>...</body>"}`

DOM is cleaned: scripts/styles removed, only test-relevant attributes kept (`id`, `class`, `data-testid`, `aria-*`, `role`, `href`, etc.), max depth 30, text truncated at 200 chars.

Read only when:
- Accessibility tree doesn't have enough info about element structure
- You need DOM hierarchy around an element
- Looking for `data-testid` or other test attributes

## Cross-Reference

- `accessibilityTree` → semantic role and accessible name
- `snapshots.jsonl` (by `index`) → DOM hierarchy and test attributes
- `screenshots/` → visual context
- `action.codegenCode` → working Playwright code as starting point
