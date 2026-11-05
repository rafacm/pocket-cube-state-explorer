import { expect, test } from '@playwright/test';
import { chromiumEnv } from '../scripts/chromium';

// A browser without WebGL: the explorer explains itself instead of leaving a blank box.
test.use({ launchOptions: { args: ['--disable-webgl', '--disable-webgl2', '--disable-3d-apis'], env: chromiumEnv() } });

test('explains what is missing when there is no WebGL', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'This explorer needs 3D graphics' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open the Pocket Cube State Explorer' })).toBeVisible();
  expect(errors).toEqual([]);
});
