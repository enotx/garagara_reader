import { expect, test } from '@playwright/test';

test('opens a footnote popup from a note reference', async ({ page }) => {
  await page.goto('/');
  await page
    .locator('input[type="file"]')
    .setInputFiles('../../fixtures/epub/messy-structure.epub');
  await expect(page.getByText(/已导入《Messy Structure》/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /Messy Structure/ }).click();
  await expect(page.locator('.reader-viewport')).toBeVisible();

  const noteRef = page.locator('[data-note-id]').first();
  await expect(noteRef).toBeAttached();
  await noteRef.click({ force: true });

  const popup = page.locator('[data-note-popup]');
  await expect(popup).toBeVisible();
  await expect(popup).toContainText('footnote');
  await expect(page.locator('[data-word-card]')).toHaveCount(0);

  await page.getByRole('button', { name: '关闭脚注' }).click();
  await expect(popup).toHaveCount(0);
});
