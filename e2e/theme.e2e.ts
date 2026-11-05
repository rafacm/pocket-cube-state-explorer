import { expect, test } from '@playwright/test';
import { growTo, isDark, isLight, open, stagePixel } from './helpers';

test.describe('in a dark system theme', () => {
  test.use({ colorScheme: 'dark' });

  test('the whole explorer goes dark, the 3D stage too, and the choice is remembered', async ({ page }) => {
    const errors = await open(page);
    await growTo(page, 1);
    const graph = page.locator('#graph');
    await expect.poll(async () => isDark(await stagePixel(graph))).toBe(true);
    await expect(page.getByRole('button', { name: 'System', exact: true })).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: 'Light', exact: true }).click();
    await expect.poll(async () => isLight(await stagePixel(graph))).toBe(true);
    expect(await page.locator('.panel').evaluate(e => getComputedStyle(e).backgroundColor)).toBe('rgb(255, 255, 255)');
    await expect(page.locator('#statStates')).toHaveText('7'); // recoloured, not rebuilt

    await page.reload();
    await expect(page.locator('#btnGrow')).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Light', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => isLight(await stagePixel(graph))).toBe(true);

    await page.getByRole('button', { name: 'System', exact: true }).click();
    await expect.poll(async () => isDark(await stagePixel(graph))).toBe(true);
    expect(errors).toEqual([]);
  });
});

test('an embedded explorer follows its data-theme attribute', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/embed-demo.html');
  const narrow = page.locator('#narrow');
  await narrow.scrollIntoViewIfNeeded();
  await expect(narrow.locator('#btnGrow')).toBeEnabled();
  await expect.poll(async () => isLight(await stagePixel(narrow.locator('#graph')))).toBe(true);
  await narrow.evaluate(e => e.setAttribute('data-theme', 'dark'));
  await expect.poll(async () => isDark(await stagePixel(narrow.locator('#graph')))).toBe(true);
  await expect(narrow.getByRole('button', { name: 'Dark', exact: true })).toHaveAttribute('aria-pressed', 'true');
  // the page around it is not touched
  expect(await page.locator('body').evaluate(e => getComputedStyle(e).backgroundColor)).toBe('rgb(255, 255, 255)');
  expect(errors).toEqual([]);
});
