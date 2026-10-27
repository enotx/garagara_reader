import { expect, test, type Page } from '@playwright/test';

async function wordPoint(page: Page, word: string): Promise<{ x: number; y: number } | null> {
  return page.evaluate((target) => {
    const bounds = document.querySelector('.reader-viewport')?.getBoundingClientRect();
    if (!bounds) {
      return null;
    }
    for (const span of document.querySelectorAll<HTMLElement>('[data-block][data-start]')) {
      const text = span.textContent ?? '';
      const index = text.indexOf(target);
      const node = span.firstChild;
      if (index < 0 || !(node instanceof Text)) {
        continue;
      }
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + target.length);
      const rect = range.getBoundingClientRect();
      if (
        rect.width > 0 &&
        rect.left >= bounds.left &&
        rect.right <= bounds.right &&
        rect.top >= bounds.top &&
        rect.bottom <= bounds.bottom
      ) {
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      }
    }
    return null;
  }, word);
}

async function openCardBook(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'card.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Alice went to Wonderland. She took it into account and smiled.'),
  });
  await expect(page.getByText(/已导入《card》/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /card/ }).click();
  await expect(page.locator('.reader-viewport')).toBeVisible();
  await page.waitForTimeout(250);
}

test('opens a dictionary card, expands and filters it', async ({ page }) => {
  await openCardBook(page);
  const point = await wordPoint(page, 'Wonderland');
  expect(point).not.toBeNull();
  if (point) {
    await page.mouse.click(point.x, point.y);
  }

  const card = page.locator('[data-word-card]');
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute('data-card-title', 'wonderland');
  await expect(card).toContainText('奇境');
  await expect(page.getByRole('button', { name: '只看 wonderland' })).toBeVisible();

  await page.getByRole('button', { name: '只看 wonderland' }).click();
  await expect(page.getByRole('button', { name: '只看 wonderland' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  const box = await card.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y - 80, { steps: 5 });
    await page.mouse.up();
  }
  await expect(card).toHaveAttribute('data-expanded', 'true');
});

test('expands a phrase and shows its dictionary entry', async ({ page }) => {
  await openCardBook(page);
  const point = await wordPoint(page, 'took');
  expect(point).not.toBeNull();
  if (point) {
    await page.mouse.click(point.x, point.y);
  }

  const card = page.locator('[data-word-card]');
  await expect(card).toHaveAttribute('data-card-title', 'take into account');
  await expect(card).toContainText('考虑');
  await expect(card).toContainText('took → take into account · 短语');
});
