import { expect, test } from '@playwright/test';

test('switches the interface language and persists both language settings', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await expect(page.getByRole('heading', { name: '阅读与 AI' })).toBeVisible();

  await page.getByLabel('界面语言').selectOption('en');
  await page.getByLabel('解释语言').selectOption('ja');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();

  await expect(page.getByRole('heading', { name: 'Reading & AI' })).toBeVisible();
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My library' })).toBeVisible();
  await page.waitForTimeout(900);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'My library' })).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByLabel('Interface language')).toHaveValue('en');
  await expect(page.getByLabel('Explanation language')).toHaveValue('ja');
});
