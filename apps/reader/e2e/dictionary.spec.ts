import { expect, test } from '@playwright/test';

test('opens the dictionary management shell', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '词典', exact: true }).click();

  await expect(page.getByRole('heading', { name: '词典管理' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '已安装' })).toBeVisible();
  await expect(page.getByText('内置测试词典')).toBeVisible();
  await expect(page.getByText('EN → ZH')).toBeVisible();
  await expect(page.getByRole('button', { name: '添加词典' })).toBeDisabled();
  await expect(page.getByText('下载与设备端构建即将支持。')).toBeVisible();
});
