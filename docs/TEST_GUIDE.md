# Writing Tests from Recordings

Guidelines for generating production-quality Playwright tests from AI-Ready PW Codegen recordings.

> See [DATA_FORMAT.md](DATA_FORMAT.md) for archive structure and data format.

## Language

Use the programming language that dominates the provided context or test system files. If unclear — ask which stack to use.

## Task

1. **Analyze** — study the recorded steps, state screenshots, and DOM structure.
2. **Generate** — write a test that exactly reproduces the scenario.

## Architecture (POM)

If the recording is part of an existing test system, don't write a "test in a vacuum":

- Build a Page Object Model (POM) following the conventions and structure of that system.
- Extract selectors into class properties, prioritizing stable locators (`data-testid`, role-based).

## Code Requirements

- **Style**: Clean, readable, maintainable code.
- **Conciseness**: Avoid redundant checks, over-engineered types, and verbose constructs.
- **Comments**: Add short one-line comments for key actions. Write comments in the same language the user is communicating in.

## Selector Strategy

Every action already carries a `selectors` object with pre-computed candidates — pick from it instead of deriving locators from the DOM. Priority order:

| `selectors` field | Playwright code |
|-------------------|-----------------|
| `testId` | `page.getByTestId('submit-btn')` — always prefer |
| `role` | `page.getByRole('button', { name: 'Submit' })` |
| `label` / `placeholder` / `text` | `page.getByLabel('Email')`, `page.getByPlaceholder('...')`, `page.getByText('...')` |
| `css` | `page.locator('[aria-label="Close"]')` — last resort |
| `xpath` | avoid; use only when nothing else identifies the element |

`selectors.codegen` is what Playwright's recorder produced — a working fallback, but usually less stable than the candidates above.

If a candidate is not unique on the page, scope it via `target.ancestors` (e.g. `page.getByRole('form', { name: 'Checkout' }).getByRole('button', { name: 'Pay' })`) instead of falling back to XPath.

## iframes

If an action has a `frame` field, the element lives inside an iframe — wrap the locator in `frameLocator` for each entry of `frame.path`:

```ts
// frame: { path: ["iframe#checkout"], url: "https://pay.example.com/form" }
await page.frameLocator('iframe#checkout').getByRole('button', { name: 'Pay' }).click();
```

Actions without a `frame` field belong to the top-level page.

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

## Guidelines

- Use `@playwright/test` with `test.describe` and `test.step`
- Convert codegen selectors to stable ones (data-testid, role-based)
- Add assertions after navigations: `await expect(page).toHaveURL(...)`
- Skip redundant SPA navigations that are side effects of clicks
- Merge consecutive `fill` + `press(Enter)` into logical steps
- Check `consoleLogs` for errors that might indicate test-relevant failures
- Use `networkRequests` to make waits explicit instead of arbitrary timeouts: `await page.waitForResponse(r => r.url().includes('/api/data'))`. Response bodies also show what the app expects — useful for `page.route()` mocks
- `target.state` tells you what to assert after an action (`checked`, `enabled`, `focused`); a `target.missing: true` means the element was not resolved at capture time — rely on the accessibility tree or DOM snapshot for that step
- Check `SESSION.md` for viewport size — add `test.use({ viewport: {...} })` if non-default
