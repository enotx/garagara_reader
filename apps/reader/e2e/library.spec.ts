import { expect, test } from '@playwright/test';

test('opens the library book sheet and keeps the reading canvas stable', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('书库为空，先导入一本 EPUB 或 TXT。')).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles('../../fixtures/txt/alice.txt');
  await expect(page.getByText(/已导入《alice》/)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.book-grid')).toBeVisible();

  await page.getByRole('button', { name: '书籍操作' }).click();
  const sheet = page.getByRole('dialog', { name: '书籍操作' });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('TXT');

  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);

  await page.getByRole('button', { name: /打开《alice》/ }).click();
  const viewport = page.locator('.reader-viewport');
  await expect(viewport).toBeVisible();
  const before = await viewport.boundingBox();
  expect(before).not.toBeNull();

  await page.locator('.reader-header').click();
  await expect(page.locator('[data-menu="top"]')).toBeVisible();
  const after = await viewport.boundingBox();
  expect(after?.height).toBe(before?.height);
  expect(after?.width).toBe(before?.width);
});
