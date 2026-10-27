import { expect, test } from '@playwright/test';

test('imports a txt book and renders chapter text', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });

  await page.goto('/');
  await expect(page.getByText('书库为空，先导入一本 EPUB 或 TXT。')).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles('../../fixtures/txt/alice.txt');
  await expect(page.getByText(/已导入《alice》/)).toBeVisible({ timeout: 30_000 });

  await expect(page.getByRole('button', { name: /alice/ })).toBeVisible();
  await expect(page.locator('.preview p').first()).toBeVisible();
  expect(errors).toEqual([]);
});
