import type { Page } from 'playwright';

/**
 * ARIA-снимок страницы в YAML (формат toMatchAriaSnapshot). page.accessibility
 * в Playwright ≥1.59 уже нет. Ошибку не глушим — recorder пометит захват как неудачный.
 */
export async function captureAccessibilityTree(page: Page): Promise<{ ariaSnapshot: string }> {
  return { ariaSnapshot: await page.locator(':root').ariaSnapshot() };
}
