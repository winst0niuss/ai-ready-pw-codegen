# Analyzing AI-Ready PW Codegen Recordings

You are analyzing a recording from **AI-Ready PW Codegen** — an offline Playwright recorder. Your goal is to generate production-quality Playwright test code from the captured session.

> A copy of analysis instructions (`ANALYSIS_PROMPT.md`) with session metadata is included in every archive.

## Archive Structure

```
test-YYYY-MM-DDTHH-mm-ss/
├── ANALYSIS_PROMPT.md      ← start here (metadata + instructions)
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

## Selector Strategy

Priority order:

1. **`data-testid`** — always prefer: `page.getByTestId('submit-btn')`
2. **Role + name** — from accessibility tree: `page.getByRole('button', { name: 'Submit' })`
3. **Semantic locators** — `page.getByLabel('Email')`, `page.getByPlaceholder('...')`, `page.getByText('...')`
4. **CSS selector** — last resort: `page.locator('[aria-label="Close"]')`

### Cross-Reference

- `accessibilityTree` → semantic role and accessible name
- `snapshots.jsonl` (by `index`) → DOM hierarchy and test attributes
- `screenshots/` → visual context
- `action.codegenCode` → working Playwright code as starting point

## Action Mapping

| Recording | Playwright Code |
|-----------|----------------|
| `navigate` | `await page.goto('url')` |
| `click` | `await page.getByRole('button', { name: '...' }).click()` |
| `fill` | `await page.getByRole('textbox', { name: '...' }).fill('value')` |
| `press` | `await page.keyboard.press('Enter')` |
| `select` | `await page.getByRole('combobox', { name: '...' }).selectOption('value')` |
| `check` | `await page.getByRole('checkbox', { name: '...' }).check()` |
| `uncheck` | `await page.getByRole('checkbox', { name: '...' }).uncheck()` |
| `hover` | `await page.getByRole('link', { name: '...' }).hover()` |
| `assertVisible` | `await expect(page.locator('...')).toBeVisible()` |

## Code Template

```ts
import { test, expect } from '@playwright/test';

test.describe('User flow: [describe based on actions]', () => {
  test('should [expected behavior]', async ({ page }) => {
    await page.goto('start-url-from-metadata');

    await test.step('Fill login form', async () => {
      await page.getByLabel('Email').fill('user@example.com');
      await page.getByLabel('Password').fill('password');
      await page.getByRole('button', { name: 'Sign in' }).click();
    });

    await test.step('Verify dashboard loaded', async () => {
      await expect(page).toHaveURL(/dashboard/);
      await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible();
    });
  });
});
```

### Guidelines

- Use `@playwright/test` with `test.describe` and `test.step`
- Convert codegen selectors to stable ones (data-testid, role-based)
- Add assertions after navigations: `await expect(page).toHaveURL(...)`
- Skip redundant SPA navigations that are side effects of clicks
- Merge consecutive `fill` + `press(Enter)` into logical steps
- Check `consoleLogs` for errors that might indicate test-relevant failures
- Check `ANALYSIS_PROMPT.md` for viewport size — add `test.use({ viewport: {...} })` if non-default
