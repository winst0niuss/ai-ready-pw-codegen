# Instructions for Analyzing DOMTrace Recordings

You are analyzing a recording archive produced by **DOMTrace** — an offline Playwright recorder. Your goal is to generate production-quality Playwright test code from the captured user session.

## Archive Structure

```
recording-YYYY-MM-DDTHH-mm-ss/
├── metadata.json           — session info (startUrl, timestamps, viewport, browser)
├── actions/
│   ├── 001-navigate.json   — first action (always navigation to start URL)
│   ├── 002-click.json
│   ├── 003-fill.json
│   └── ...
└── screenshots/
    ├── 001-navigate.png
    ├── 002-click.png
    └── ...
```

## How to Read Each Action File

Each JSON file represents one user action with full page context:

| Field | Description |
|-------|-------------|
| `index` | Sequential action number |
| `timestamp` | ISO 8601 timestamp |
| `url` | Page URL at the time of action |
| `action.type` | One of: `navigate`, `click`, `fill`, `select`, `keypress`, `submit`, `waitFor` |
| `action.value` | Entered text (for `fill` and `select`) |
| `action.key` | Pressed key (for `keypress`: Enter, Tab, Escape) |
| `action.condition` | Wait condition (for `waitFor`: visible, hidden, attached, detached) |
| `action.elementInfo.tagName` | HTML tag name |
| `action.elementInfo.id` | Element ID |
| `action.elementInfo.classes` | CSS classes array |
| `action.elementInfo.text` | Visible text content (truncated to 150 chars) |
| `action.elementInfo.attributes` | Test-relevant attributes (data-testid, aria-label, role, placeholder, etc.) |
| `action.elementInfo.cssSelector` | Auto-generated CSS selector (Playwright codegen priority) |
| `action.elementInfo.xpath` | Fallback XPath |
| `action.elementInfo.boundingBox` | Element position and size `{ x, y, width, height }` |
| `snapshot.accessibilityTree` | Full page accessibility tree at the moment of action |
| `snapshot.cleanedDom` | Cleaned HTML with only test-relevant attributes preserved |
| `screenshotFile` | Relative path to screenshot (may be `null`) |

## Selector Strategy

Choose selectors in this priority order. **Never skip a higher-priority option if it's available.**

1. **`data-testid` / `data-test` / `data-cy`** — always prefer these:
   ```ts
   page.getByTestId('submit-btn')
   ```

2. **Accessible role + name** — from the accessibility tree:
   ```ts
   page.getByRole('button', { name: 'Submit' })
   page.getByRole('link', { name: 'Sign in' })
   page.getByRole('textbox', { name: 'Email' })
   ```

3. **Semantic locators** — when semantically appropriate:
   ```ts
   page.getByLabel('Email address')
   page.getByPlaceholder('Enter your email')
   page.getByText('Welcome back')
   page.getByAltText('Company logo')
   ```

4. **CSS selector from `elementInfo.cssSelector`** — only as a last resort:
   ```ts
   page.locator('[aria-label="Close"]')
   page.locator('#unique-id')
   ```

5. **XPath** — avoid unless absolutely nothing else works

### How to Cross-Reference

- Check `elementInfo.attributes` for `data-testid`, `aria-label`, `role`, `placeholder`
- Check `snapshot.accessibilityTree` for the semantic role and accessible name
- Use `snapshot.cleanedDom` to understand the DOM hierarchy around the element
- Use screenshots to verify visual context

## Action Mapping

| Recording Action | Playwright Code |
|-----------------|----------------|
| `navigate` | `await page.goto('url')` |
| `click` | `await page.getByRole('button', { name: '...' }).click()` |
| `fill` | `await page.getByRole('textbox', { name: '...' }).fill('value')` |
| `select` | `await page.getByRole('combobox', { name: '...' }).selectOption('value')` |
| `keypress` (Enter) | `await page.keyboard.press('Enter')` |
| `keypress` (Tab) | `await page.keyboard.press('Tab')` |
| `keypress` (Escape) | `await page.keyboard.press('Escape')` |
| `submit` | Usually redundant if preceded by Enter or button click — skip unless standalone |
| `waitFor` (visible) | `await expect(page.locator('...')).toBeVisible()` |
| `waitFor` (hidden) | `await expect(page.locator('...')).toBeHidden()` |
| `waitFor` (attached) | `await expect(page.locator('...')).toBeAttached()` |
| `waitFor` (detached) | `await expect(page.locator('...')).not.toBeAttached()` |

## Code Structure Rules

### Test File Format

```ts
import { test, expect } from '@playwright/test';

test.describe('User flow: [describe the flow based on actions]', () => {
  test('should [describe expected behavior]', async ({ page }) => {
    await page.goto('start-url-from-metadata');

    // Group related actions into logical steps
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

### Structure Guidelines

- Use `@playwright/test` as the test framework
- Use `test.describe` for logical grouping
- Use `test.step` to group related actions into readable blocks
- Always add `await` before Playwright calls
- Use Page Object Model **only** if the recording covers multiple distinct pages with repeated interactions
- Add navigation assertions (`await expect(page).toHaveURL(...)`) after navigations that change the page
- Convert `waitFor` actions into `expect` assertions

## Using the Data Sources

### Screenshots
- Show the visual state **after** each action
- Use them to understand the user flow and verify your interpretation
- If a screenshot shows a modal/dialog, ensure your test handles it
- If a screenshot shows an error state, the test should verify error handling

### Accessibility Tree
- **Primary source** for choosing selectors
- Reveals semantic roles and accessible names that may not be obvious from DOM
- If an element has `role: "button"` and `name: "Submit"` in the tree → use `getByRole('button', { name: 'Submit' })`

### Cleaned DOM
- Use to understand page structure and hierarchy
- Look for `data-testid` and other test attributes
- Identify form structures, list patterns, table layouts for assertion patterns
- Only test-relevant attributes are preserved (data-testid, aria-*, role, name, type, placeholder, href, etc.)

## Optimization Rules

1. **Merge fill + keypress(Enter)**: If a `fill` action is immediately followed by `keypress` with key `Enter`, keep both but consider if the Enter is a form submission
2. **Skip redundant navigations**: SPA route changes that are side effects of clicks should not generate separate `goto()` calls
3. **Deduplicate clicks**: The recording may capture the same click action twice (mousedown fallback) — only emit one `click()` call
4. **Skip submit after click**: If a `submit` action follows a button click that triggers the form, skip the redundant `submit`
5. **Group assertions**: Combine related `waitFor` actions into a logical assertion block

## Viewport Configuration

Check `metadata.json` for the viewport size used during recording. If it differs from the default Playwright config, add:

```ts
test.use({ viewport: { width: 1280, height: 720 } });
```

## Important Notes

- Use `{ timeout: 10000 }` for elements that may take time to appear (after navigation, after async operations)
- If the recording shows navigation to a different domain, consider `test.use({ baseURL: '...' })`
- The first action is always `navigate` — use its URL as the `page.goto()` target
- Handle dialogs if any `dialog` events appear in the flow
- Prefer `toBeVisible()` over `toHaveCount(1)` for existence checks
