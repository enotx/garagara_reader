import { expect, test } from '@playwright/test';

test('builds a page map and splits sentences across pages', async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 300 });
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles('../../fixtures/txt/alice.txt');
  await expect(page.getByText(/已导入《alice》/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /alice/ }).click();
  const viewport = page.locator('.reader-viewport');
  await expect(viewport).toBeVisible();

  await expect(viewport).toHaveAttribute('data-page-start', /\{/);
  const firstStart = await viewport.getAttribute('data-page-start');
  const firstEnd = await viewport.getAttribute('data-page-end');
  expect(JSON.parse(firstStart ?? '{}')).toMatchObject({ chapterIndex: 0, blockIndex: 0 });
  expect(JSON.parse(firstEnd ?? '{}')).toMatchObject({ chapterIndex: 0 });

  for (let index = 0; index < 4; index += 1) {
    await page.getByRole('button', { name: '增大字号' }).click();
    await page.waitForTimeout(150);
  }
  await expect(viewport).not.toHaveAttribute('data-split-sentences', '');

  const split = await viewport.getAttribute('data-split-sentences');
  expect(split).not.toBe('');
  expect(split?.split(',').length).toBeGreaterThan(0);

  await page.getByRole('button', { name: '下一页' }).click();
  await page.waitForTimeout(250);
  await expect(viewport).not.toHaveAttribute('data-page-start', firstStart ?? '');
});
