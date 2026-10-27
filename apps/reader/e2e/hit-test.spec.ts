import { expect, test } from '@playwright/test';

test('maps a click coordinate to the word token', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles('../../fixtures/txt/alice.txt');
  await expect(page.getByText(/已导入《alice》/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /alice/ }).click();
  const viewport = page.locator('.reader-viewport');
  await expect(viewport).toBeVisible();
  await page.waitForTimeout(250);

  const point = await page.evaluate(() => {
    const bounds = document.querySelector('.reader-viewport')?.getBoundingClientRect();
    if (!bounds) {
      return null;
    }
    for (const span of document.querySelectorAll<HTMLElement>('[data-block][data-start]')) {
      const text = span.textContent ?? '';
      const index = text.indexOf('Wonderland');
      const node = span.firstChild;
      if (index < 0 || !(node instanceof Text)) {
        continue;
      }
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + 'Wonderland'.length);
      const rect = range.getBoundingClientRect();
      if (
        rect.width > 0 &&
        rect.left >= bounds.left &&
        rect.right <= bounds.right &&
        rect.top >= bounds.top &&
        rect.bottom <= bounds.bottom
      ) {
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };
      }
    }
    return null;
  });

  expect(point).not.toBeNull();
  if (point) {
    await page.mouse.click(point.x, point.y);
  }
  await expect(viewport).toHaveAttribute('data-hit-token', 'Wonderland');
  await expect(viewport).toHaveAttribute('data-hit-start', /\d+/);
});
