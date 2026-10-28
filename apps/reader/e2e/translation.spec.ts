import { expect, test, type Page } from '@playwright/test';

const MOCK_ENDPOINT = '**/mock/v1/chat/completions';

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

async function configureMockLlm(page: Page): Promise<void> {
  await page.getByRole('button', { name: '设置' }).click();
  await page.getByLabel('Base URL').fill('http://127.0.0.1:5173/mock/v1');
  await page.getByLabel('模型').fill('mock-model');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByText('设置已保存。')).toBeVisible();
}

async function importBook(page: Page): Promise<void> {
  await page.getByRole('button', { name: '书架', exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'translate.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('She took it into account and smiled.'),
  });
  await expect(page.getByText(/已导入《translate》/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /打开《translate》/ }).click();
  await expect(page.locator('.reader-viewport')).toBeVisible();
  await page.waitForTimeout(250);
}

async function mockLlm(page: Page): Promise<{ translationCalls: () => number }> {
  let translationCalls = 0;
  await page.route(MOCK_ENDPOINT, async (route) => {
    const body = route.request().postDataJSON() as {
      response_format?: unknown;
      messages?: Array<{ content?: string }>;
    };
    let content = 'OK';
    if (body.response_format) {
      const user = body.messages?.map((message) => message.content ?? '').join('\n') ?? '';
      if (user.includes('"translation"')) {
        translationCalls += 1;
        content = JSON.stringify({ translation: '她把这件事考虑在内。' });
      } else {
        content = JSON.stringify({ lemma: 'take', pos: 'v.', meaning: '把……考虑在内' });
      }
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        model: 'mock-model',
        choices: [{ message: { role: 'assistant', content } }],
      }),
    });
  });
  return { translationCalls: () => translationCalls };
}

test('long-presses a sentence to show the translation overlay', async ({ page }) => {
  const mock = await mockLlm(page);
  await page.goto('/');
  await configureMockLlm(page);
  await importBook(page);

  const point = await wordPoint(page, 'took');
  expect(point).not.toBeNull();
  if (point) {
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.waitForTimeout(650);
    await page.mouse.up();
  }

  const popover = page.locator('[data-translation-popover]');
  await expect(popover).toBeVisible();
  await expect(popover).toHaveAttribute('data-translation-status', 'ready', { timeout: 10_000 });
  await expect(popover.locator('[data-translation-text]')).toHaveText('她把这件事考虑在内。');
  await expect(popover.locator('[data-translation-source]')).toHaveText('AI');
  await expect(page.locator('[data-word-card]')).toHaveCount(0);
  expect(mock.translationCalls()).toBe(1);

  await popover.getByRole('button', { name: '关闭翻译' }).click();
  await expect(popover).toHaveCount(0);
});

test('translates from the word card and reuses the cache', async ({ page }) => {
  const mock = await mockLlm(page);
  await page.goto('/');
  await configureMockLlm(page);
  await importBook(page);

  const point = await wordPoint(page, 'took');
  expect(point).not.toBeNull();
  if (point) {
    await page.mouse.click(point.x, point.y);
  }
  const card = page.locator('[data-word-card]');
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: '整句翻译' }).click();

  const popover = page.locator('[data-translation-popover]');
  await expect(popover).toHaveAttribute('data-translation-status', 'ready', { timeout: 10_000 });
  await expect(popover.locator('[data-translation-source]')).toHaveText('AI');
  await expect(page.locator('[data-word-card]')).toHaveCount(0);

  await popover.getByRole('button', { name: '关闭翻译' }).click();
  await expect(popover).toHaveCount(0);

  if (point) {
    await page.mouse.click(point.x, point.y);
  }
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: '整句翻译' }).click();
  await expect(popover).toHaveAttribute('data-translation-status', 'ready');
  await expect(popover.locator('[data-translation-source]')).toHaveText('缓存');
  expect(mock.translationCalls()).toBe(1);
});

test('shows offline when translating without a cache', async ({ page }) => {
  await mockLlm(page);
  await page.goto('/');
  await configureMockLlm(page);
  await importBook(page);
  await page.context().setOffline(true);

  const point = await wordPoint(page, 'smiled');
  expect(point).not.toBeNull();
  if (point) {
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.waitForTimeout(650);
    await page.mouse.up();
  }

  const popover = page.locator('[data-translation-popover]');
  await expect(popover).toHaveAttribute('data-translation-status', 'offline');
  await expect(popover).toContainText('离线');
});
