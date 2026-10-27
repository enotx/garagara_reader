import { expect, test } from '@playwright/test';

test('imports a txt book and opens the paginated reader', async ({ page }) => {
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

  await page.getByRole('button', { name: /alice/ }).click();
  await expect(page.locator('.reader-viewport')).toBeVisible();
  await expect(page.locator('[data-block-id]').first()).toBeVisible();
  await expect(page.locator('.reader-progress')).toContainText('章');

  const before = await page.locator('.reader-progress').innerText();
  await page.getByRole('button', { name: '下一页' }).click();
  await expect(page.locator('.reader-progress')).not.toHaveText(before);

  expect(errors).toEqual([]);
});
