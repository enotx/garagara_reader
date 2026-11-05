import { expect, test, type Page } from '@playwright/test';

async function importTextBook(page: Page, name: string, text: string): Promise<void> {
  await page.locator('input[type="file"]').setInputFiles({
    name: `${name}.txt`,
    mimeType: 'text/plain',
    buffer: Buffer.from(text),
  });
  await expect(page.getByText(new RegExp(`已导入《${name}》`))).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: new RegExp(`打开《${name}》`) }).click();
  await expect(page.locator('.reader-viewport')).toBeVisible();
  await page.waitForTimeout(300);
}

async function closeMenuIfOpen(page: Page): Promise<void> {
  if ((await page.locator('[data-menu="top"]').count()) > 0) {
    await page.locator('.reader-header').click();
  }
  await expect(page.locator('[data-menu="top"]')).toHaveCount(0);
}

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

test('restores the library and reading progress after a reload', async ({ page }) => {
  const filler = 'word '.repeat(1200);
  const text = `Chapter 1\n\n${filler}\n\nChapter 2\n\n${filler}`;

  await page.goto('/');
  await importTextBook(page, 'progress', text);

  await expect
    .poll(async () => Number(await page.locator('.reader').getAttribute('data-page-count')))
    .toBeGreaterThan(1);

  await page.locator('.reader-header').click();
  await page.getByLabel('选择章节').selectOption({ label: 'Chapter 2' });
  await expect(page.locator('.reader-heading')).toContainText('Chapter 2');
  await closeMenuIfOpen(page);

  await expect
    .poll(async () => Number(await page.locator('.reader').getAttribute('data-page-count')))
    .toBeGreaterThan(1);
  await page.getByRole('button', { name: '下一页' }).click();
  await page.waitForTimeout(900);

  const viewport = page.locator('.reader-viewport');
  const savedStart = await viewport.getAttribute('data-page-start');
  const savedPage = await page.locator('.reader').getAttribute('data-page');
  expect(savedPage).not.toBe('0');
  if (!savedStart) {
    throw new Error('missing page start locator');
  }

  await page.reload();
  await expect(page.getByRole('button', { name: /打开《progress》/ })).toBeVisible();
  await page.getByRole('button', { name: /打开《progress》/ }).click();
  await expect(page.locator('.reader-viewport')).toBeVisible();
  await expect(page.locator('.reader-heading')).toContainText('Chapter 2');
  await expect(page.locator('.reader-viewport')).toHaveAttribute('data-page-start', savedStart);
});

test('jumps to a vocabulary entry in another chapter', async ({ page }) => {
  await page.goto('/');
  await importTextBook(
    page,
    'cross-chapter',
    'Chapter 1\n\nThe first chapter has nothing special.\n\nChapter 2\n\nShe took it into account.',
  );

  await page.locator('.reader-header').click();
  await page.getByLabel('选择章节').selectOption({ label: 'Chapter 2' });
  await expect(page.locator('.reader-heading')).toContainText('Chapter 2');
  await closeMenuIfOpen(page);
  await page.waitForTimeout(250);

  const point = await wordPoint(page, 'took');
  expect(point).not.toBeNull();
  if (point) {
    await page.mouse.click(point.x, point.y);
  }
  const card = page.locator('[data-word-card]');
  await expect(card).toHaveAttribute('data-card-title', 'take into account');
  await card.getByRole('button', { name: '加入生词本' }).click();
  await card.getByRole('button', { name: '关闭词卡' }).click();

  await page.getByRole('button', { name: '返回书架' }).click();
  await page.getByRole('button', { name: '生词本', exact: true }).click();
  const entry = page.locator('.vocab-card');
  await expect(entry).toContainText('take into account');
  await entry.getByRole('button', { name: '跳回原文：take into account' }).click();

  await expect(page.locator('.reader-viewport')).toBeVisible();
  await expect(page.locator('.reader-heading')).toContainText('Chapter 2');
});
