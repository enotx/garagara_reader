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

async function openVocabBook(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'vocab.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('She took it into account and smiled.'),
  });
  await expect(page.getByText(/已导入《vocab》/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /打开《vocab》/ }).click();
  await expect(page.locator('.reader-viewport')).toBeVisible();
  await page.waitForTimeout(250);
}

test('collects, marks known, searches and jumps back to the source sentence', async ({ page }) => {
  await openVocabBook(page);

  const point = await wordPoint(page, 'took');
  expect(point).not.toBeNull();
  if (point) {
    await page.mouse.click(point.x, point.y);
  }
  const card = page.locator('[data-word-card]');
  await expect(card).toHaveAttribute('data-card-title', 'take into account');
  await card.getByRole('button', { name: '加入生词本' }).click();
  await expect(card.getByRole('button', { name: '移出生词本' })).toBeVisible();

  await card.getByRole('button', { name: '关闭词卡' }).click();
  await page.getByRole('button', { name: '返回书架' }).click();
  await page.getByRole('button', { name: '生词本', exact: true }).click();

  const entry = page.locator('.vocab-card');
  await expect(entry).toBeVisible();
  await expect(entry).toContainText('take into account');
  await expect(entry).toContainText('She took it into account and smiled.');

  await entry.getByRole('button', { name: '标记已知' }).click();
  await expect(entry.locator('.vocab-status')).toHaveText('已知');

  await page.getByLabel('搜索生词').fill('account');
  await expect(entry).toBeVisible();
  await page.getByLabel('搜索生词').fill('missing');
  await expect(page.getByText('没有匹配的生词。')).toBeVisible();
  await page.getByLabel('搜索生词').fill('');

  await entry.getByRole('button', { name: '跳回原文：take into account' }).click();
  await expect(page.locator('.reader-viewport')).toBeVisible();
  await expect(page.locator('.reader')).toHaveAttribute('data-page', '0');

  await page.getByRole('button', { name: '返回书架' }).click();
  await page.getByRole('button', { name: '生词本', exact: true }).click();
  await page.locator('.vocab-card').getByRole('button', { name: '删除 take into account' }).click();
  await expect(page.getByText('还没有生词')).toBeVisible();
});

test('toggles the collection star from the source word', async ({ page }) => {
  await openVocabBook(page);
  const point = await wordPoint(page, 'took');
  expect(point).not.toBeNull();
  if (point) {
    await page.mouse.click(point.x, point.y);
  }
  const card = page.locator('[data-word-card]');
  await card.getByRole('button', { name: '加入生词本' }).click();
  await expect(card.getByRole('button', { name: '移出生词本' })).toBeVisible();
  await card.getByRole('button', { name: '移出生词本' }).click();
  await expect(card.getByRole('button', { name: '加入生词本' })).toBeVisible();
});
