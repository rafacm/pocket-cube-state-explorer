import { expect, test } from '@playwright/test';
import { SOLVED_FACELETS, fastWalks, growTo, open, statesShown } from './helpers';

test('starts at the solved cube', async ({ page }) => {
  const errors = await open(page);
  await expect(page).toHaveTitle('Pocket Cube State Explorer');
  await expect(page.locator('#statStates')).toHaveText('1');
  await expect(page.locator('#cbDepth')).toHaveText('0');
  await expect(page.locator('#flHeld')).toHaveText(SOLVED_FACELETS);
  await expect(page.locator('#census tr')).toHaveCount(15); // layers 0..14, quarter turns
  expect(errors).toEqual([]);
});

test('grows the cube layers with the right numbers of states and links', async ({ page }) => {
  const errors = await open(page);
  await growTo(page, 3);
  await expect(page.locator('#statStates')).toHaveText('154'); // 1 + 6 + 27 + 120
  await expect(page.locator('#statEdges')).toHaveText('states · 168 links');
  await expect(page.locator('#figLoops')).toHaveText('15');
  await expect(page.locator('#btnGrow')).toHaveText('Grow layer 4');
  expect(errors).toEqual([]);
});

test('grows an outer layer as dots', async ({ page }) => {
  test.slow();
  const errors = await open(page);
  await growTo(page, 8);
  expect(await statesShown(page)).toBe(159120); // layers 0..8
  await expect(page.locator('#census tr').nth(8)).toHaveClass(/done/);
  expect(errors).toEqual([]);
});

test('finds a scramble, then solves it', async ({ page }) => {
  const errors = await open(page);
  await growTo(page, 5);
  await fastWalks(page);
  await page.locator('#stateInput').fill("R U R' F2");
  await page.locator('#findForm button[type=submit]').click();
  await expect(page.locator('#findNote')).toContainText('5 quarter turns from solved');
  await expect(page.locator('#cbDepth')).toHaveText('5');
  await expect(page.locator('#routes .route')).not.toHaveCount(0);
  await page.locator('#btnHome').click();
  await expect(page.locator('#cbDepth')).toHaveText('0', { timeout: 60_000 });
  await expect(page.locator('#flHeld')).toHaveText(SOLVED_FACELETS);
  expect(errors).toEqual([]);
});

test('finds a facelet string beyond the drawn layers', async ({ page }) => {
  const errors = await open(page);
  // nothing beyond the solved cube is drawn yet, so this state is outside the graph
  await page.locator('#stateInput').fill("R U2 R' U' F2 U F R U' R2 F' U");
  await page.locator('#findForm button[type=submit]').click();
  await expect(page.locator('#findNote')).toContainText('quarter turns from solved');
  await expect(page.locator('#findNote')).toContainText('as far as the graph is drawn');
  expect(errors).toEqual([]);
});

test('rejects input that is not a cube', async ({ page }) => {
  await open(page);
  await page.locator('#stateInput').fill('Q');
  await page.locator('#findForm button[type=submit]').click();
  await expect(page.locator('#findNote')).toHaveClass(/err/);
  await expect(page.locator('#findNote')).toContainText('I don\'t know the move "Q"');
  await page.locator('#stateInput').fill('WWWW:RRRR:GGGG:YYYY:OOOO:BBBW');
  await page.locator('#findForm button[type=submit]').click();
  await expect(page.locator('#findNote')).toContainText('Each colour must appear exactly 4 times');
});

test('turns the cube with the move pad and normalizes a rotation', async ({ page }) => {
  const errors = await open(page);
  await growTo(page, 1);
  await page.getByRole('button', { name: 'Turn U', exact: true }).click();
  await expect(page.locator('#cbDepth')).toHaveText('1');
  await expect(page.locator('#flHeld')).not.toHaveText(SOLVED_FACELETS);
  await page.getByRole('button', { name: 'Rotate the whole cube y', exact: true }).click();
  await expect(page.locator('#orientText')).toHaveText('Held in another orientation');
  await expect(page.locator('#btnNorm')).toBeEnabled();
  await page.locator('#btnNorm').click();
  await expect(page.locator('#orientText')).toHaveText('Standard orientation');
  expect(errors).toEqual([]);
});

test('Esc deselects the current state', async ({ page }) => {
  await open(page);
  await growTo(page, 2);
  await page.locator('#stateInput').fill('R U');
  await page.locator('#findForm button[type=submit]').click();
  await expect(page.locator('#cbDepth')).toHaveText('2');
  await page.locator('#graph').hover();
  await page.keyboard.press('Escape');
  await expect(page.locator('#routesNote')).toContainText('No state selected');
});

test('counts half turns as one move', async ({ page }) => {
  const errors = await open(page);
  await page.locator('#optHalf').check();
  await expect(page.locator('#census tr')).toHaveCount(12); // layers 0..11, half turns
  await growTo(page, 1);
  await expect(page.locator('#statStates')).toHaveText('10'); // 1 + 9
  expect(errors).toEqual([]);
});

test('switches the link views and dot colouring', async ({ page }) => {
  const errors = await open(page);
  await growTo(page, 2);
  await page.getByRole('button', { name: 'Tree only' }).click();
  await expect(page.getByRole('button', { name: 'Tree only' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Extra links' }).click();
  await expect(page.getByRole('button', { name: 'All links' })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  await expect(page.locator('#pinLegend')).toBeHidden();
  expect(errors).toEqual([]);
});

test('starts over', async ({ page }) => {
  await open(page);
  await growTo(page, 2);
  await page.locator('#btnReset').click();
  await expect(page.locator('#statStates')).toHaveText('1');
  await expect(page.locator('#btnGrow')).toHaveText('Grow layer 1');
});

test('has a link preview: Open Graph tags and the image they point to', async ({ page, request }) => {
  await page.goto('/');
  const meta = (p: string) => page.locator(`meta[property="${p}"]`).getAttribute('content');
  expect(await meta('og:title')).toBe('Pocket Cube State Explorer');
  expect(await meta('og:image')).toBe('https://pocket-cube-state-explorer.vercel.app/og.png');
  expect(await page.locator('meta[name="twitter:card"]').getAttribute('content')).toBe('summary_large_image');
  const og = await request.get('/og.png');
  expect(og.status()).toBe(200);
  expect(og.headers()['content-type']).toBe('image/png');
  expect((await request.get('/favicon.svg')).status()).toBe(200);
});
