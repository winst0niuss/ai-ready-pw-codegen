# Analyzing AI-Ready PW Codegen Recordings

You are analyzing a recording from **AI-Ready PW Codegen** — an offline Playwright recorder.

> Session metadata is in `SESSION.md` inside every archive.

## Archive Structure

```
test-YYYY-MM-DDTHH-mm-ss-sssZ-xxxxxx/
├── SESSION.md              ← start here (session metadata)
├── DATA_FORMAT.md          ← data format reference (this file)
├── TEST_GUIDE.md           ← test generation guidelines
├── actions.jsonl           ← all actions, one JSON per line
├── snapshots.jsonl         ← cleaned DOM snapshots (read on demand)
├── screenshots/
│   ├── 001-navigate.jpg
│   └── ...
└── network.har             ← only with --har; full network dump, do NOT load into context
```

## actions.jsonl

Each line is a JSON object — one user action with full page context:

| Field | Description |
|-------|-------------|
| `index` | Sequential action number |
| `timestamp` | ISO 8601 timestamp |
| `url` | Page URL at action time |
| `action.type` | Actions: `navigate`, `click`, `fill`, `press`, `select`, `check`, `uncheck`, `hover`, `setInputFiles`, `openPage`, `closePage`. Assertions added via the recorder toolbar: `assertVisible`, `assertText`, `assertValue`, `assertChecked`, `assertSnapshot` |
| `action.selector` | Playwright selector (codegen format) |
| `action.value` | Entered text (`fill`), expected text (`assertText`) or expected value (`assertValue`) |
| `action.options` | Selected option values (`select`) |
| `action.files` | File names (`setInputFiles`) |
| `action.checked` | Expected state (`assertChecked`) |
| `action.substring` | `assertText`: `true` → `toContainText`, `false` → `toHaveText` |
| `action.ariaSnapshot` | Expected ARIA snapshot (`assertSnapshot`) |
| `action.key` | Key name (`press`: Enter, Tab, Escape, etc.) |
| `action.codegenCode` | Generated Playwright test code snippet |
| `action.position` | Click coordinates `{ x, y }` |
| `action.modifiers` | Keyboard modifiers (Shift, Ctrl, etc.) |
| `action.button` | Mouse button (left/right/middle) |
| `action.clickCount` | Single/double/triple click |
| `target` | Snapshot of the clicked element — see below (absent for `navigate`) |
| `selectors` | Ready-made selector candidates — see below (absent for `navigate`) |
| `frame` | iframe context — **present only for actions inside an iframe** |
| `accessibilityTree` | `{ "ariaSnapshot": "<YAML>" }` — full page ARIA snapshot at action time (roles, accessible names, field values), the same format as `toMatchAriaSnapshot`. `{ "error": ... }` if the capture failed |
| `screenshotFile` | Relative path to screenshot (or `null`) |
| `consoleLogs` | Browser console messages since previous action (optional) |
| `networkRequests` | XHR/fetch requests since previous action: `url`, `method`, `status`, `duration`, `requestBody`, `responseBody` (optional) |

### `target` — the element that was acted on

| Field | Description |
|-------|-------------|
| `tagName` | Uppercase tag, e.g. `BUTTON` |
| `role` / `accessibleName` | Computed ARIA role and accessible name |
| `text` | Visible text (truncated) |
| `attributes` | Test-relevant attributes (`id`, `data-testid`, `type`, `aria-*`, …) |
| `boundingBox` / `inViewport` | Position and whether it was visible on screen |
| `state` | `visible`, `enabled`, `focused`, plus `editable`/`checked`/`readOnly` when applicable |
| `computedStyle` | `display`, `visibility`, `opacity`, `pointerEvents` |
| `ancestors` | Parent chain (`tagName`, `id`, `classes`, `role`, `testId`) — useful for scoping locators |
| `missing: true` | The element could not be resolved at capture time; other fields are absent |
| `secret: true` | Password field — the entered value is replaced with `***` everywhere in the recording |

### `selectors` — pre-computed locator candidates

```json
{
  "codegen": "[data-testid=\"submit-btn\"]",
  "testId": "submit-btn",
  "role": { "role": "button", "name": "Submit" },
  "label": "Email",
  "placeholder": "you@example.com",
  "text": "Submit",
  "css": "button#submit-btn",
  "xpath": "/html/body/div[2]/form/button"
}
```

Only the candidates that apply to the element are present. Use them instead of deriving locators from the DOM — see `TEST_GUIDE.md` for the priority order.

### `frame` — iframe context

```json
{ "path": ["iframe#checkout"], "url": "https://pay.example.com/form", "name": "checkout" }
```

`path` is the chain of iframe selectors from the top-level page down to the frame (one entry per nesting level). `target`, `selectors` and the DOM snapshot were captured **inside that frame**; `accessibilityTree` is always captured from the top-level page.

## Masked passwords

Values typed into password fields are replaced with `***` in `action.value`, `action.codegenCode`, `target.attributes.value`, the accessibility tree, the DOM snapshot, console logs and network bodies. Such actions have `target.secret: true`. The real value is not in the recording — do not try to recover it.

## snapshots.jsonl

Each line: `{"index": N, "cleanedDom": "<body>...</body>"}`

DOM is cleaned: scripts/styles removed, only test-relevant attributes kept (`id`, `class`, `data-testid`, `aria-*`, `role`, `href`, etc.), max depth 30, text truncated at 200 chars.

Read only when:
- Accessibility tree doesn't have enough info about element structure
- You need DOM hierarchy around an element
- Looking for `data-testid` or other test attributes

## Cross-Reference

- `selectors` → ready locator candidates, no derivation needed
- `target` → element identity, state, and ancestor chain for scoping
- `accessibilityTree.ariaSnapshot` → semantic role and accessible name of surrounding elements
- `snapshots.jsonl` (by `index`) → DOM hierarchy and test attributes
- `screenshots/` → visual context
- `action.codegenCode` → working Playwright code as starting point
