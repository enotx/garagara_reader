import { expect, test, type Page } from '@playwright/test';

async function installSpeechMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    interface Utterance {
      text: string;
      lang: string;
      rate: number;
      voice: unknown;
      onstart: (() => void) | null;
      onend: (() => void) | null;
      onerror: ((error: unknown) => void) | null;
      onboundary: ((event: { charIndex: number; charLength?: number }) => void) | null;
    }
    interface HarnessWindow {
      __spoken: string[];
      __paused: number;
      __resumed: number;
      __current?: Utterance;
      SpeechSynthesisUtterance: new (text: string) => Utterance;
      speechSynthesis: {
        speak(utterance: Utterance): void;
        cancel(): void;
        pause(): void;
        resume(): void;
        getVoices(): unknown[];
      };
    }
    const harness = window as unknown as HarnessWindow;
    harness.__spoken = [];
    harness.__paused = 0;
    harness.__resumed = 0;
    Object.defineProperty(harness, 'SpeechSynthesisUtterance', {
      configurable: true,
      writable: true,
      value: class {
        text: string;
        lang = '';
        rate = 1;
        voice: unknown = null;
        onstart: (() => void) | null = null;
        onend: (() => void) | null = null;
        onerror: ((error: unknown) => void) | null = null;
        onboundary: ((event: { charIndex: number; charLength?: number }) => void) | null = null;

        constructor(text: string) {
          this.text = text;
        }
      },
    });
    Object.defineProperty(harness, 'speechSynthesis', {
      configurable: true,
      value: {
        speak(utterance: Utterance) {
          harness.__spoken.push(utterance.text);
          harness.__current = utterance;
          setTimeout(() => utterance.onstart?.(), 0);
        },
        cancel() {},
        pause() {
          harness.__paused += 1;
        },
        resume() {
          harness.__resumed += 1;
        },
        getVoices() {
          return [];
        },
      },
    });
  });
}

async function openBook(page: Page): Promise<void> {
  const sentences = Array.from({ length: 120 }, (_, index) => `Sentence ${index} is here.`);
  await page.locator('input[type="file"]').setInputFiles({
    name: 'playback.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(sentences.join(' ')),
  });
  await expect(page.getByText(/已导入《playback》/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /打开《playback》/ }).click();
  await expect(page.locator('.reader-viewport')).toBeVisible();
  await page.waitForTimeout(300);
}

async function enableFocus(page: Page): Promise<void> {
  await page.locator('.reader-header').click();
  await page.getByRole('button', { name: 'Focus' }).click();
  await expect(page.locator('.reader')).toHaveAttribute('data-focus', 'true');
}

test('plays sentences, pauses for a word card and browses without losing focus', async ({
  page,
}) => {
  await installSpeechMock(page);
  await page.goto('/');
  await openBook(page);
  await enableFocus(page);

  const reader = page.locator('.reader');
  const spoken = () => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);

  await page.getByRole('button', { name: '播放', exact: true }).click();
  await expect(reader).toHaveAttribute('data-playback-status', 'playing');
  await expect.poll(spoken).toEqual(['Sentence 0 is here.']);

  await page.evaluate(() => {
    (window as unknown as { __current?: { onend?: () => void } }).__current?.onend?.();
  });
  await expect.poll(spoken).toEqual(['Sentence 0 is here.', 'Sentence 1 is here.']);
  await expect(reader).toHaveAttribute('data-playback-sentence', /s1$/);

  await page.getByRole('button', { name: '暂停播放' }).click();
  await expect(reader).toHaveAttribute('data-playback-status', 'paused');
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await expect(reader).toHaveAttribute('data-playback-status', 'playing');
  expect(await page.evaluate(() => (window as unknown as { __paused: number }).__paused)).toBe(1);
  expect(await page.evaluate(() => (window as unknown as { __resumed: number }).__resumed)).toBe(1);

  const pageBefore = await reader.getAttribute('data-page');
  await page.keyboard.press('ArrowRight');
  await expect(reader).toHaveAttribute('data-playback-browsing', 'true');
  const browsedPage = await reader.getAttribute('data-page');
  expect(browsedPage).not.toBe(pageBefore);
  await expect(page.locator('[data-playback-return]')).toBeVisible();

  await page.evaluate(() => {
    (
      window as unknown as { __current?: { onboundary?: (event: unknown) => void } }
    ).__current?.onboundary?.({ charIndex: 0, charLength: 5 });
  });
  await expect(reader).toHaveAttribute('data-page', browsedPage ?? '0');

  await page.getByRole('button', { name: '回到当前句' }).click();
  await expect(reader).toHaveAttribute('data-playback-browsing', 'false');
  await expect(reader).toHaveAttribute('data-page', pageBefore ?? '0');
  await page.waitForTimeout(400);

  const currentSentenceId = await reader.getAttribute('data-playback-sentence');
  await expect(reader).toHaveAttribute('data-focus-id', currentSentenceId ?? '');
  const focusBlock = await reader.getAttribute('data-focus-block');
  const focusStart = Number(await reader.getAttribute('data-focus-start'));
  const point = await page.evaluate(
    ({ block, offset }) => {
      const bounds = document.querySelector('.reader-viewport')?.getBoundingClientRect();
      if (!bounds) {
        return null;
      }
      for (const span of document.querySelectorAll<HTMLElement>('[data-block][data-start]')) {
        const spanStart = Number(span.dataset.start ?? -1);
        const spanEnd = Number(span.dataset.end ?? -1);
        const node = span.firstChild;
        if (span.dataset.block !== block || offset < spanStart || offset >= spanEnd) {
          continue;
        }
        if (!(node instanceof Text)) {
          continue;
        }
        const range = document.createRange();
        range.setStart(node, offset - spanStart);
        range.setEnd(node, Math.min(offset - spanStart + 'Sentence'.length, node.data.length));
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
    },
    { block: focusBlock, offset: focusStart },
  );
  expect(point).not.toBeNull();
  if (point) {
    await page.mouse.click(point.x, point.y);
  }
  await expect(page.locator('[data-word-card]')).toBeVisible();
  await expect(reader).toHaveAttribute('data-playback-status', 'paused');

  await page.getByRole('button', { name: '关闭词卡' }).click();
  await expect(reader).toHaveAttribute('data-playback-status', 'playing');
});
