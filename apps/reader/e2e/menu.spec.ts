import { expect, test } from '@playwright/test';

test('toggles the top and bottom menus from header and footer', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles('../../fixtures/txt/alice.txt');
  await expect(page.getByText(/已导入《alice》/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /alice/ }).click();
  await expect(page.locator('.reader-viewport')).toBeVisible();
  await expect(page.locator('[data-menu="top"]')).toHaveCount(0);

  await page.locator('.reader-header').click();
  await expect(page.locator('[data-menu="top"]')).toBeVisible();
  await expect(page.locator('[data-menu="bottom"]')).toBeVisible();
  await expect(page.getByLabel('主题')).toBeVisible();
  await expect(page.getByLabel('选择章节')).toBeVisible();
  await expect(page.getByRole('button', { name: '增大字号' })).toBeVisible();

  await page.locator('.reader-footer').click({ position: { x: 10, y: 10 } });
  await expect(page.locator('[data-menu="top"]')).toHaveCount(0);

  await page.locator('.reader-header').click();
  await expect(page.locator('[data-menu="top"]')).toBeVisible();
});
