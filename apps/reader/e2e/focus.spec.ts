import { expect, test, type Page } from '@playwright/test';

async function openFocusBook(page: Page, text: string): Promise<void> {
  await page.locator('input[type="file"]').setInputFiles({
    name: 'focus.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(text),
  });
  await expect(page.getByText(/已导入《focus》/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /打开《focus》/ }).click();
  await expect(page.locator('.reader-viewport')).toBeVisible();
  await page.waitForTimeout(300);
}

async function enableFocus(page: Page): Promise<void> {
  await page.locator('.reader-header').click();
  await page.getByRole('button', { name: 'Focus' }).click();
  await expect(page.locator('.reader')).toHaveAttribute('data-focus', 'true');
}

async function configureMockLlm(page: Page): Promise<{ calls: () => number }> {
  let calls = 0;
  await page.route('**/mock/v1/chat/completions', async (route) => {
    const body = route.request().postDataJSON() as { response_format?: unknown };
    if (body.response_format) {
      calls += 1;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        model: 'mock-model',
        choices: [
          {
            message: {
              role: 'assistant',
              content: body.response_format ? JSON.stringify({ translation: '译文' }) : 'OK',
            },
          },
        ],
      }),
    });
  });
  await page.getByRole('button', { name: '设置' }).click();
  await page.getByLabel('Base URL').fill('http://127.0.0.1:5173/mock/v1');
  await page.getByLabel('模型').fill('mock-model');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByText('设置已保存。')).toBeVisible();
  await page.getByRole('button', { name: '书架', exact: true }).click();
  return { calls: () => calls };
}

test('toggles Focus without changing the page canvas and advances across pages', async ({
  page,
}) => {
  const text = `${'word '.repeat(3000)}end.`;
  await page.goto('/');
  await openFocusBook(page, text);
  const reader = page.locator('.reader');
  const viewport = page.locator('.reader-viewport');
  const before = await viewport.boundingBox();
  const pageCount = await reader.getAttribute('data-page-count');
  const textBefore = await page.locator('.chapter-view').textContent();
  expect(Number(pageCount)).toBeGreaterThan(1);

  await enableFocus(page);
  await expect(page.locator('.reader')).toHaveAttribute('data-focus-id', /:s0$/);
  expect(await reader.getAttribute('data-page-count')).toBe(pageCount);
  const after = await viewport.boundingBox();
  expect(after?.width).toBe(before?.width);
  expect(after?.height).toBe(before?.height);
  expect(await page.locator('.chapter-view').textContent()).toBe(textBefore);

  const highlights = await page.evaluate(() => {
    const api = (CSS as unknown as { highlights?: { has(name: string): boolean } }).highlights;
    return {
      dim: api?.has('focus-dim') ?? false,
      sentence: api?.has('focus-sentence') ?? false,
      segment: api?.has('focus-segment') ?? false,
    };
  });
  expect(highlights).toEqual({ dim: true, sentence: true, segment: true });

  const firstFocus = await reader.getAttribute('data-focus-id');
  const firstPage = await reader.getAttribute('data-page');
  if (firstPage === '0') {
    await page.getByRole('button', { name: '下一片段' }).click();
  }
  await expect(reader).not.toHaveAttribute('data-page', firstPage ?? '0');
  await expect(reader).toHaveAttribute('data-focus-id', firstFocus ?? '');
  expect(await reader.getAttribute('data-page-count')).toBe(pageCount);

  await expect(page.locator('[data-focus-subtitle]')).toBeVisible();
  await expect(page.locator('[data-focus-subtitle]')).toContainText('未配置 AI 服务');

  await page.locator('.reader-header').click();
  await page.locator('select[aria-label="Focus 推进单位"]').selectOption('chunk');
  await expect(reader).toHaveAttribute('data-focus-unit', 'chunk');
  await expect(reader).toHaveAttribute('data-focus-id', /:k\d+$/);
});

test('prefetches three upcoming sentence translations in Focus', async ({ page }) => {
  await page.goto('/');
  const mock = await configureMockLlm(page);
  await openFocusBook(
    page,
    'One warm sentence. Two warm sentences. Three warm sentences. Four warm sentences. Five warm sentences.',
  );
  await enableFocus(page);

  await expect(page.locator('[data-focus-subtitle]')).toHaveAttribute(
    'data-subtitle-status',
    'ready',
    { timeout: 10_000 },
  );
  await expect(page.locator('.reader')).toHaveAttribute('data-focus-next-count', '3');
  await expect.poll(() => mock.calls()).toBe(4);
  await page.waitForTimeout(300);

  await page.getByRole('button', { name: '下一片段' }).click();
  await expect.poll(() => mock.calls()).toBe(5);
});
