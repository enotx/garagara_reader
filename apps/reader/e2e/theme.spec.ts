import { expect, test } from '@playwright/test';

test('applies themes and removes transitions in e-ink mode', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles('../../fixtures/txt/alice.txt');
  await expect(page.getByText(/已导入《alice》/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /alice/ }).click();

  await page.getByLabel('主题').selectOption('eink');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'eink');

  const styles = await page.locator('.paged-content').evaluate((element) => {
    const computed = getComputedStyle(element);
    const button = document.querySelector('.reader-button');
    return {
      transitionDuration: computed.transitionDuration,
      transitionProperty: computed.transitionProperty,
      buttonShadow: button ? getComputedStyle(button).boxShadow : 'none',
      buttonRadius: button ? getComputedStyle(button).borderRadius : '0px',
    };
  });
  expect(styles.transitionDuration).toBe('0s');
  expect(styles.transitionProperty).toBe('none');
  expect(styles.buttonShadow).toBe('none');
  expect(styles.buttonRadius).toBe('0px');

  await page.getByLabel('主题').selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const background = await page.locator('.reader').evaluate((element) => {
    return getComputedStyle(element).backgroundColor;
  });
  expect(background).toBe('rgb(28, 25, 22)');
});
