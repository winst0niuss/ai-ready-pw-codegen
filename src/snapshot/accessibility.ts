import type { Page } from 'playwright';

export async function captureAccessibilityTree(page: Page): Promise<unknown> {
  try {
    // accessibility.snapshot() — компактное дерево с ролями и именами
    // @ts-expect-error — accessibility может быть deprecated в новых версиях
    const snapshot = await page.accessibility.snapshot({ interestingOnly: true });
    return snapshot;
  } catch {
    // Fallback: получаем aria snapshot как текст
    try {
      const ariaSnapshot = await page.locator(':root').ariaSnapshot();
      return { ariaSnapshot };
    } catch {
      return { error: 'accessibility snapshot unavailable' };
    }
  }
}
