import { expect, test, type Page } from '@playwright/test';

async function openLongBook(page: Page): Promise<void> {
  await page.locator('input[type="file"]').setInputFiles({
    name: 'edge.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('word '.repeat(3000)),
  });
  await expect(page.getByText(/已导入《edge》/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /打开《edge》/ }).click();
  await expect(page.locator('.reader-viewport')).toBeVisible();
  await page.waitForTimeout(300);
}

test('turns pages from the edge when the setting is enabled', async ({ page }) => {
  await page.goto('/');
  await openLongBook(page);

  const reader = page.locator('.reader');
  await expect
    .poll(async () => Number(await reader.getAttribute('data-page-count')))
    .toBeGreaterThan(1);

  await page.locator('.reader-header').click();
  const toggle = page.getByLabel('边缘点击翻页');
  await expect(toggle).toBeVisible();
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await expect(toggle).toBeChecked();
  await page.locator('.reader-header').click();
  await expect(page.locator('[data-menu="top"]')).toHaveCount(0);
  await page.waitForTimeout(350);

  const viewport = page.locator('.reader-viewport');
  const box = await viewport.boundingBox();
  expect(box).not.toBeNull();
  const before = Number(await reader.getAttribute('data-page'));
  expect(before).toBeLessThan(Number(await reader.getAttribute('data-page-count')) - 1);

  if (box) {
    await page.mouse.click(box.x + box.width - 5, box.y + box.height / 2);
  }

  await expect(reader).toHaveAttribute('data-page', String(before + 1));
});
