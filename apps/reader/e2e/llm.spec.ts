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

async function importCardBook(page: Page): Promise<void> {
  await page.locator('input[type="file"]').setInputFiles({
    name: 'llm-card.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('She took it into account and smiled.'),
  });
  await expect(page.getByText(/已导入《llm-card》/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /打开《llm-card》/ }).click();
  await expect(page.locator('.reader-viewport')).toBeVisible();
  await page.waitForTimeout(250);
}

async function configureMockLlm(page: Page): Promise<void> {
  await page.getByRole('button', { name: '设置' }).click();
  await expect(page.getByRole('heading', { name: '阅读与 AI' })).toBeVisible();
  await page.getByLabel('Base URL').fill('http://127.0.0.1:5173/mock/v1');
  await page.getByLabel('模型').fill('mock-model');
  await page.getByLabel('API Key').fill('test-key');

  await page.getByRole('button', { name: '测试连接' }).click();
  await expect(page.getByText('连接成功：OK')).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByText('设置已保存。')).toBeVisible();
}

test('configures the LLM and shows the in-context meaning', async ({ page }) => {
  let calls = 0;
  await page.route(MOCK_ENDPOINT, async (route) => {
    calls += 1;
    const body = route.request().postDataJSON() as { response_format?: unknown };
    if (body.response_format) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          model: 'mock-model',
          choices: [
            {
              message: {
                role: 'assistant',
                content: JSON.stringify({
                  lemma: 'take',
                  pos: 'v.',
                  meaning: '把……考虑在内',
                  phrase: { text: 'took it into account', lemma: 'take into account' },
                }),
              },
            },
          ],
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        model: 'mock-model',
        choices: [{ message: { role: 'assistant', content: 'OK' } }],
      }),
    });
  });

  await page.goto('/');
  await configureMockLlm(page);
  await page.getByRole('button', { name: '书架', exact: true }).click();
  await importCardBook(page);

  const point = await wordPoint(page, 'took');
  expect(point).not.toBeNull();
  if (point) {
    await page.mouse.click(point.x, point.y);
  }

  const card = page.locator('[data-word-card]');
  await expect(card).toHaveAttribute('data-context-status', 'ready', { timeout: 10_000 });
  await expect(card).toContainText('把……考虑在内');
  await expect(card.locator('[data-context-source]')).toHaveText('AI');
  await expect(card).toContainText('took it into account');
  expect(calls).toBeGreaterThanOrEqual(2);
});

test('uses the cache offline and never calls the network', async ({ page }) => {
  let contextCalls = 0;
  await page.route(MOCK_ENDPOINT, async (route) => {
    const body = route.request().postDataJSON() as { response_format?: unknown };
    if (!body.response_format) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          model: 'mock-model',
          choices: [{ message: { role: 'assistant', content: 'OK' } }],
        }),
      });
      return;
    }
    contextCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        model: 'mock-model',
        choices: [
          {
            message: {
              role: 'assistant',
              content: JSON.stringify({ lemma: 'take', pos: 'v.', meaning: '把……考虑在内' }),
            },
          },
        ],
      }),
    });
  });

  await page.goto('/');
  await configureMockLlm(page);
  await page.getByRole('button', { name: '书架', exact: true }).click();
  await importCardBook(page);

  const point = await wordPoint(page, 'took');
  expect(point).not.toBeNull();
  if (point) {
    await page.mouse.click(point.x, point.y);
  }
  const card = page.locator('[data-word-card]');
  await expect(card).toHaveAttribute('data-context-status', 'ready', { timeout: 10_000 });
  const callsAfterOnline = contextCalls;

  await card.getByRole('button', { name: '关闭词卡' }).click();
  await page.context().setOffline(true);

  if (point) {
    await page.mouse.click(point.x, point.y);
  }
  await expect(card).toHaveAttribute('data-context-status', 'ready');
  await expect(card.locator('[data-context-source]')).toHaveText('缓存');
  await expect(card).toContainText('把……考虑在内');
  expect(contextCalls).toBe(callsAfterOnline);

  await card.getByRole('button', { name: '关闭词卡' }).click();
  const other = await wordPoint(page, 'smiled');
  expect(other).not.toBeNull();
  if (other) {
    await page.mouse.click(other.x, other.y);
  }
  await expect(card).toHaveAttribute('data-context-status', 'offline');
  await expect(card).toContainText('离线');
});

test('shows a manual button in dictionary-first mode', async ({ page }) => {
  await page.route(MOCK_ENDPOINT, async (route) => {
    const body = route.request().postDataJSON() as { response_format?: unknown };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        model: 'mock-model',
        choices: [
          {
            message: {
              role: 'assistant',
              content: body.response_format
                ? JSON.stringify({ lemma: 'take', pos: 'v.', meaning: '考虑' })
                : 'OK',
            },
          },
        ],
      }),
    });
  });

  await page.goto('/');
  await configureMockLlm(page);

  await page.locator('input[name="definition-strategy"][value="dictionary-first"]').check();
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByText('设置已保存。')).toBeVisible();

  await page.getByRole('button', { name: '书架', exact: true }).click();
  await importCardBook(page);

  const point = await wordPoint(page, 'took');
  expect(point).not.toBeNull();
  if (point) {
    await page.mouse.click(point.x, point.y);
  }
  const card = page.locator('[data-word-card]');
  await expect(card).toHaveAttribute('data-context-status', 'idle');
  await expect(card.getByRole('button', { name: '查询本句含义' })).toBeVisible();

  await card.getByRole('button', { name: '查询本句含义' }).click();
  await expect(card).toHaveAttribute('data-context-status', 'ready', { timeout: 10_000 });
  await expect(card).toContainText('考虑');
});
