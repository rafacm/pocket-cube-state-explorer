import { expect, test } from '@playwright/test';
import { SOLVED_FACELETS, fastWalks, find, growTo, open, openTool, statesShown } from './helpers';

test('starts at the solved cube, pointing at the first step', async ({ page }) => {
  const errors = await open(page);
  await expect(page).toHaveTitle('Pocket Cube State Explorer');
  await expect(page.locator('#statStates')).toHaveText('1');
  await expect(page.locator('#btnGrow')).toHaveText('Add layer 1');
  await expect(page.locator('#growNote')).toHaveText('+6 states, 1 turn from solved');
  await expect(page.locator('#coach')).toBeVisible();
  await expect(page.locator('#card')).toBeHidden();
  await expect(page.locator('#tools')).toBeHidden();
  await expect(page.locator('#flHeld')).toHaveText(SOLVED_FACELETS);
  await expect(page.locator('#census tr')).toHaveCount(15); // layers 0..14, quarter turns
  await expect(page.locator('#meter i')).toHaveCount(15);
  expect(errors).toEqual([]);
});

test('grows the cube layers with the right numbers of states and links', async ({ page }) => {
  const errors = await open(page);
  await growTo(page, 3);
  await expect(page.locator('#statStates')).toHaveText('154'); // 1 + 6 + 27 + 120
  await expect(page.locator('#statEdges')).toHaveText('states · 168 links');
  await expect(page.locator('#figLoops')).toHaveText('15');
  await expect(page.locator('#btnGrow')).toHaveText('Add layer 4');
  await expect(page.locator('#growNote')).toHaveText('+534 states, 4 turns from solved');
  await expect(page.locator('#meter i.on')).toHaveCount(4);
  await expect(page.locator('#coach')).toBeHidden();
  expect(errors).toEqual([]);
});

test('grows an outer layer as dots, after a heads-up on a device without a GPU', async ({ page }) => {
  test.slow();
  const errors = await open(page);
  await growTo(page, 7);
  await expect(page.locator('#growNote')).toHaveText('+114,149 states, 8 turns from solved, as dots');
  await page.locator('#btnGrow').click();
  // headless Chromium renders in software: the explorer says what the outer layers cost before adding them
  await expect(page.locator('#heads')).toBeVisible();
  await expect(page.locator('#headsText')).toContainText('120 MB');
  await page.locator('#btnHeadsNo').click();
  await expect(page.locator('#heads')).toBeHidden();
  await expect(page.locator('#statStates')).toHaveText('44,971'); // nothing added
  await page.locator('#btnGrow').click();
  await page.locator('#btnHeadsYes').click();
  await expect(page.locator('#btnGrow')).toHaveText('Add layer 9', { timeout: 300_000 });
  expect(await statesShown(page)).toBe(159120); // layers 0..8
  await expect(page.locator('#census tr').nth(8)).toHaveClass(/done/);
  expect(errors).toEqual([]);
});

test('finds a scramble, shows it in the card, then solves it', async ({ page }) => {
  const errors = await open(page);
  await growTo(page, 5);
  await fastWalks(page);
  await find(page, "R U R' F2");
  await expect(page.locator('#findNote')).toContainText('5 quarter turns from solved');
  await expect(page.locator('#card')).toBeVisible();
  await expect(page.locator('#cbDepth')).toHaveText('5');
  await expect(page.locator('#routes .route')).not.toHaveCount(0);
  await page.locator('#btnHome').click();
  await expect(page.locator('#cbDepth')).toHaveText('0', { timeout: 60_000 });
  await expect(page.locator('#flHeld')).toHaveText(SOLVED_FACELETS);
  expect(errors).toEqual([]);
});

test('Solve with the camera following flies to the state before the first turn', async ({ page }) => {
  const errors = await open(page);
  await growTo(page, 2);
  await find(page, 'R U');
  await page.locator('#btnToolsClose').click();
  await expect(page.locator('#cbDepth')).toHaveText('2');
  await page.locator('#btnHome').click();
  // the approach takes 1.8 s at normal speed: the cube waits for it, then walks home
  await expect(page.locator('#btnHome')).toHaveText('Stop');
  await page.waitForTimeout(1000);
  await expect(page.locator('#cbDepth')).toHaveText('2');
  await expect(page.locator('#cbDepth')).toHaveText('0', { timeout: 60_000 });
  await expect(page.locator('#flHeld')).toHaveText(SOLVED_FACELETS);
  expect(errors).toEqual([]);
});

test('finds a facelet string beyond the drawn layers', async ({ page }) => {
  const errors = await open(page);
  // nothing beyond the solved cube is drawn yet, so this state is outside the graph
  await find(page, "R U2 R' U' F2 U F R U' R2 F' U");
  await expect(page.locator('#findNote')).toContainText('quarter turns from solved');
  await expect(page.locator('#findNote')).toContainText('as far as the graph is drawn');
  expect(errors).toEqual([]);
});

test('rejects input that is not a cube', async ({ page }) => {
  await open(page);
  await find(page, 'Q');
  await expect(page.locator('#findNote')).toHaveClass(/err/);
  await expect(page.locator('#findNote')).toContainText('I don\'t know the move "Q"');
  await page.locator('#stateInput').fill('WWWW:RRRR:GGGG:YYYY:OOOO:BBBW');
  await page.locator('#findForm button[type=submit]').click();
  await expect(page.locator('#findNote')).toContainText('Each colour must appear exactly 4 times');
});

test('turns the cube with the move pad and normalizes a rotation', async ({ page }) => {
  const errors = await open(page);
  await growTo(page, 1);
  await openTool(page, 'Turn');
  await page.getByRole('button', { name: 'Turn U', exact: true }).click();
  await expect(page.locator('#cbDepth')).toHaveText('1');
  await expect(page.locator('#card')).toBeVisible();
  await expect(page.locator('#flHeld')).not.toHaveText(SOLVED_FACELETS);
  await page.getByRole('button', { name: 'Rotate the whole cube y', exact: true }).click();
  await expect(page.locator('#orientText')).toHaveText('Held in another orientation');
  await expect(page.locator('#btnNorm')).toBeEnabled();
  await page.locator('#btnNorm').click();
  await expect(page.locator('#orientText')).toHaveText('Standard orientation');
  expect(errors).toEqual([]);
});

test('Esc closes the drawer first, then deselects', async ({ page }) => {
  await open(page);
  await growTo(page, 2);
  await find(page, 'R U');
  await expect(page.locator('#cbDepth')).toHaveText('2');
  await page.locator('#graph').hover();
  await page.keyboard.press('Escape');
  await expect(page.locator('#tools')).toBeHidden();
  await expect(page.locator('#card')).toBeVisible();
  await page.locator('#graph').hover();
  await page.keyboard.press('Escape');
  await expect(page.locator('#routesNote')).toContainText('No state selected');
  await expect(page.locator('#card')).toBeHidden();
});

test('the card collapses and deselects', async ({ page }) => {
  await open(page);
  await growTo(page, 2);
  await find(page, 'R U');
  await page.locator('#btnToolsClose').click();
  await page.locator('#btnCardToggle').click();
  await expect(page.locator('#btnCardToggle')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#cardBody')).toBeHidden();
  await page.locator('#btnCardToggle').click();
  await expect(page.locator('#cardBody')).toBeVisible();
  await page.locator('#btnDeselect').click();
  await expect(page.locator('#card')).toBeHidden();
});

test('help and the key open and close', async ({ page }) => {
  await open(page);
  await page.locator('#btnHelp').click();
  await expect(page.locator('#help')).toBeVisible();
  await expect(page.locator('#help')).toContainText('zoom toward the pointer');
  await page.locator('#btnKey').click(); // one pop-up at a time
  await expect(page.locator('#help')).toBeHidden();
  await expect(page.locator('#legend')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#legend')).toBeHidden();
});

test('the tools tabs work with the keyboard', async ({ page }) => {
  await open(page);
  await openTool(page, 'Find');
  await page.getByRole('tab', { name: 'Find' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Turn' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#pad')).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('tab', { name: 'About' })).toHaveAttribute('aria-selected', 'true');
});

test('counts half turns as one move', async ({ page }) => {
  const errors = await open(page);
  await openTool(page, 'View');
  await page.locator('#optHalf').check();
  await expect(page.locator('#census tr')).toHaveCount(12); // layers 0..11, half turns
  await expect(page.locator('#meter i')).toHaveCount(12);
  await growTo(page, 1);
  await expect(page.locator('#statStates')).toHaveText('10'); // 1 + 9
  await expect(page.locator('#growNote')).toHaveText('+54 states, 2 moves from solved');
  expect(errors).toEqual([]);
});

test('switches the link views and dot colouring', async ({ page }) => {
  const errors = await open(page);
  await growTo(page, 2);
  await openTool(page, 'View');
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
  await expect(page.locator('#btnGrow')).toHaveText('Add layer 1');
});

test('has a link preview: Open Graph tags and the image they point to', async ({ page, request }) => {
  await page.goto('/');
  const meta = (p: string) => page.locator(`meta[property="${p}"]`).getAttribute('content');
  expect(await meta('og:title')).toBe('Pocket Cube State Explorer');
  expect(await meta('og:image')).toBe('https://pocket-cube-state-explorer.vercel.app/og.jpg');
  expect(await page.locator('meta[name="twitter:card"]').getAttribute('content')).toBe('summary_large_image');
  const og = await request.get('/og.jpg');
  expect(og.status()).toBe(200);
  expect(og.headers()['content-type']).toBe('image/jpeg');
  expect((await og.body()).length).toBeLessThan(300_000); // WhatsApp skips larger preview images
  expect((await request.get('/favicon.svg')).status()).toBe(200);
});
