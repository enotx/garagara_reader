import { expect, test, type Page } from '@playwright/test';

async function firstVisibleText(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const viewport = document.querySelector('.reader-viewport');
    if (!viewport) {
      return null;
    }
    const bounds = viewport.getBoundingClientRect();
    const elements = [...document.querySelectorAll<HTMLElement>('[data-block][data-start]')]
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter(
        ({ element, rect }) =>
          element.textContent?.trim() &&
          rect.right > bounds.left &&
          rect.left < bounds.right &&
          rect.bottom > bounds.top &&
          rect.top < bounds.bottom,
      )
      .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);
    return elements[0]?.element.textContent?.trim() ?? null;
  });
}

async function isTextVisible(page: Page, text: string): Promise<boolean> {
  return page.evaluate((target) => {
    const viewport = document.querySelector('.reader-viewport');
    if (!viewport) {
      return false;
    }
    const bounds = viewport.getBoundingClientRect();
    return [...document.querySelectorAll<HTMLElement>('[data-block][data-start]')].some(
      (element) => {
        const rect = element.getBoundingClientRect();
        return (
          element.textContent?.trim() === target &&
          rect.right > bounds.left &&
          rect.left < bounds.right &&
          rect.bottom > bounds.top &&
          rect.top < bounds.bottom
        );
      },
    );
  }, text);
}

test('changing font size keeps the current page text', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles('../../fixtures/txt/alice.txt');
  await expect(page.getByText(/已导入《alice》/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /alice/ }).click();
  await expect(page.locator('.reader-viewport')).toBeVisible();

  await page.getByRole('button', { name: '下一页' }).click();
  await expect(page.locator('.reader-progress')).toContainText('页');
  await page.waitForTimeout(250);
  const before = await firstVisibleText(page);
  expect(before).not.toBeNull();

  await page.getByRole('button', { name: '增大字号' }).click();
  await page.waitForTimeout(250);
  await page.getByRole('button', { name: '增大字号' }).click();
  await page.waitForTimeout(300);

  expect(await isTextVisible(page, before ?? '')).toBe(true);
});
