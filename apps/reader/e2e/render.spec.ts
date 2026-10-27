import { expect, test } from '@playwright/test';

test('renders fragments without changing block text', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles('../../fixtures/epub/messy-structure.epub');
  await expect(page.getByText(/已导入《Messy Structure》/)).toBeVisible({ timeout: 30_000 });

  const blocks = page.locator('[data-block-id]');
  const count = await blocks.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    const block = blocks.nth(index);
    const text = await block.getAttribute('data-text');
    const rendered = await block.evaluate((element) => element.textContent);
    expect(rendered).toBe(text);
  }

  await expect(page.locator('.mark-italic').first()).toBeVisible();
  await expect(page.locator('[data-note-id]')).toHaveCount(2);
  await expect(page.locator('[data-block-id] [data-start]').first()).toBeVisible();
});
