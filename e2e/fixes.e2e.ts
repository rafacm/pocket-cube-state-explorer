import { expect, test } from '@playwright/test';
import { find, growTo, open, openTool } from './helpers';

test('switching to half turns asks before it clears the graph', async ({ page }) => {
  const errors = await open(page);
  await growTo(page, 1);
  await openTool(page, 'View');
  await page.locator('#optHalf').click(); // not check(): the box stays unchecked until confirmed
  await expect(page.locator('#halfConfirm')).toBeVisible();
  await expect(page.locator('#halfConfirmText')).toContainText('clears the layer drawn now');
  await expect(page.locator('#optHalf')).not.toBeChecked();
  await expect(page.locator('#statStates')).toHaveText('7'); // nothing cleared yet
  await page.locator('#btnHalfNo').click();
  await expect(page.locator('#halfConfirm')).toBeHidden();
  await expect(page.locator('#census tr')).toHaveCount(15);

  await page.locator('#optHalf').click();
  await page.locator('#btnHalfYes').click();
  await expect(page.locator('#optHalf')).toBeChecked();
  await expect(page.locator('#census tr')).toHaveCount(12);
  await expect(page.locator('#statStates')).toHaveText('1');
  expect(errors).toEqual([]);
});

test('the legend lists only what is on screen', async ({ page }) => {
  await open(page);
  await page.locator('#btnKey').click();
  await expect(page.locator('#legend')).toBeVisible();
  await expect(page.locator('#legRoute')).toBeHidden();
  await expect(page.locator('#legBundles')).toBeHidden();
  await growTo(page, 2);
  await find(page, 'R U');
  await page.locator('#btnToolsClose').click();
  await page.locator('#btnKey').click();
  await expect(page.locator('#legRoute')).toBeVisible();
  await page.locator('#btnDeselect').click();
  await expect(page.locator('#legRoute')).toBeHidden();
  await expect(page.locator('#legBundles')).toBeHidden(); // no dot layers yet
});

test('recovers when the browser takes the 3D graphics away', async ({ page }) => {
  const errors = await open(page);
  await growTo(page, 2);
  const lose = (what: 'loseContext' | 'restoreContext') => page.evaluate((w) => {
    const c = document.querySelector<HTMLCanvasElement>('#graph')!;
    const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext;
    (window as unknown as { __ext?: WEBGL_lose_context }).__ext ??= gl.getExtension('WEBGL_lose_context')!;
    (window as unknown as { __ext: WEBGL_lose_context }).__ext[w]();
  }, what);
  await lose('loseContext');
  await expect(page.locator('#lost')).toBeVisible();
  await expect(page.locator('#lostText')).toContainText('Restoring');
  await lose('restoreContext');
  await expect(page.locator('#lost')).toBeHidden();
  // still works afterwards
  await page.locator('#btnGrow').click();
  await expect(page.locator('#statStates')).toHaveText('154');

  // if the graphics do not come back, it offers to start again
  await lose('loseContext');
  await expect(page.locator('#btnRestart')).toBeVisible({ timeout: 10_000 });
  await page.locator('#btnRestart').click(); // a fresh explorer, on a fresh canvas
  await expect(page.locator('#statStates')).toHaveText('1');
  await expect(page.locator('#btnGrow')).toHaveText('Add layer 1');
  expect(errors).toEqual([]);
});
