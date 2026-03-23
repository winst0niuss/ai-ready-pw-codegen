# Instructions for Analyzing AI-Ready PW Codegen Recordings

You are analyzing a recording archive produced by **AI-Ready PW Codegen** — an offline Playwright recorder that uses Playwright's built-in codegen for action capture. Your goal is to generate production-quality Playwright test code from the captured user session.

> **Note:** A copy of the analysis instructions (`ANALYSIS_PROMPT.md`) is included in every archive with session-specific metadata.

## Archive Structure

```
recording-YYYY-MM-DDTHH-mm-ss/
├── ANALYSIS_PROMPT.md      ← start here (metadata + instructions)
├── actions.jsonl           ← all actions, one JSON per line
├── snapshots.jsonl         ← cleaned DOM snapshots (read on demand)
└── screenshots/
    ├── 001-navigate.png
    └── ...
```

## How to Read actions.jsonl

Each line is a JSON object representing one user action with page context:

| Field | Description |
|-------|-------------|
| `index` | Sequential action number |
| `timestamp` | ISO 8601 timestamp |
| `url` | Page URL at the time of action |
| `action.type` | One of: `navigate`, `click`, `fill`, `press`, `select`, `check`, `uncheck`, `hover`, `assertVisible` |
| `action.selector` | Playwright selector (codegen internal format) |
| `action.value` | Entered text (for `fill` and `select`) |
| `action.key` | Key name (for `press`: Enter, Tab, Escape, etc.) |
| `action.codegenCode` | Generated Playwright test code snippet |
| `accessibilityTree` | Full page accessibility tree at the moment of action |
| `screenshotFile` | Relative path to screenshot (or `null`) |

## How to Read snapshots.jsonl

Each line: `{"index": N, "cleanedDom": "<body>...</body>"}`

DOM snapshots are large. Only read when:
- Accessibility tree doesn't have enough info about element structure
- You need to understand DOM hierarchy around an element
- Looking for `data-testid` or other test attributes not in the accessibility tree

## Selector Strategy

Choose selectors in this priority order:

1. **`data-testid` / `data-test` / `data-cy`** — always prefer:
   ```ts
   page.getByTestId('submit-btn')
   ```

2. **Accessible role + name** — from the accessibility tree:
   ```ts
   page.getByRole('button', { name: 'Submit' })
   page.getByRole('textbox', { name: 'Email' })
   ```

3. **Semantic locators**:
   ```ts
   page.getByLabel('Email address')
   page.getByPlaceholder('Enter your email')
   page.getByText('Welcome back')
   ```

4. **CSS selector** — last resort:
   ```ts
   page.locator('[aria-label="Close"]')
   ```

### How to Cross-Reference

- Check `accessibilityTree` for semantic role and accessible name
- Check `snapshots.jsonl` (matching by `index`) for DOM hierarchy and test attributes
- Use screenshots to verify visual context
- Use `action.codegenCode` as a starting point — it has working Playwright code

## Action Mapping

| Recording Action | Playwright Code |
|-----------------|----------------|
| `navigate` | `await page.goto('url')` |
| `click` | `await page.getByRole('button', { name: '...' }).click()` |
| `fill` | `await page.getByRole('textbox', { name: '...' }).fill('value')` |
| `press` | `await page.keyboard.press('Enter')` |
| `select` | `await page.getByRole('combobox', { name: '...' }).selectOption('value')` |
| `check` | `await page.getByRole('checkbox', { name: '...' }).check()` |
| `uncheck` | `await page.getByRole('checkbox', { name: '...' }).uncheck()` |
| `hover` | `await page.getByRole('link', { name: '...' }).hover()` |
| `assertVisible` | `await expect(page.locator('...')).toBeVisible()` |

## Code Structure

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

- Use `@playwright/test` framework with `test.describe` and `test.step`
- Convert codegen selectors to stable ones (data-testid, role-based)
- Add assertions after navigations: `await expect(page).toHaveURL(...)`
- Skip redundant SPA navigations that are side effects of clicks
- Merge consecutive `fill` + `press(Enter)` into logical steps
- Prefer `toBeVisible()` over `toHaveCount(1)` for existence checks

## Viewport

Check `ANALYSIS_PROMPT.md` for viewport size. If it differs from default, add:

```ts
test.use({ viewport: { width: 1280, height: 720 } });
```
