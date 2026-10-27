import { expect, test } from '@playwright/test';

test('reader shell loads', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  await page.goto('/');

  await expect(page).toHaveTitle('Garagara Reader');
  await expect(page.getByRole('heading', { name: 'Garagara Reader' })).toBeVisible();
  await expect(page.getByText('本地优先的外语阅读器')).toBeVisible();
  expect(consoleErrors).toEqual([]);
});
