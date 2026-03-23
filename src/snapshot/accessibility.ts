import type { Page } from 'playwright';

export async function captureAccessibilityTree(page: Page): Promise<unknown> {
  try {
    // accessibility.snapshot() — compact tree with roles and names
    // @ts-expect-error — accessibility may be deprecated in newer versions
    const snapshot = await page.accessibility.snapshot({ interestingOnly: true });
    return snapshot;
  } catch {
    // Fallback: get aria snapshot as text
    try {
      const ariaSnapshot = await page.locator(':root').ariaSnapshot();
      return { ariaSnapshot };
    } catch {
      return { error: 'accessibility snapshot unavailable' };
    }
  }
}
