import { expect, test, type Page } from '@playwright/test';
import { SOLVED_FACELETS, find, growTo, open, openTool } from './helpers';

// Reduced motion stops the automatic spin, so only the keys move the camera.
test.use({ reducedMotion: 'reduce' });

test('U R F D L B turn the cube, Shift turns it back, Backspace undoes', async ({ page }) => {
  const errors = await open(page);
  await growTo(page, 2);
  await page.keyboard.press('r');
  await expect(page.locator('#cbDepth')).toHaveText('1');
  await expect(page.locator('#card')).toBeVisible();
  await page.keyboard.press('Shift+R'); // R'
  await expect(page.locator('#cbDepth')).toHaveText('0');
  await expect(page.locator('#flHeld')).toHaveText(SOLVED_FACELETS);

  await page.keyboard.press('u');
  await expect(page.locator('#cbDepth')).toHaveText('1');
  await page.keyboard.press('f');
  await expect(page.locator('#cbDepth')).toHaveText('2');
  await page.keyboard.press('Backspace');
  await expect(page.locator('#cbDepth')).toHaveText('1');
  await page.keyboard.press('Backspace');
  await expect(page.locator('#flHeld')).toHaveText(SOLVED_FACELETS);
  // the history goes further back: R' and R from the start
  await page.keyboard.press('Backspace'); // undoes R'
  await expect(page.locator('#cbDepth')).toHaveText('1');
  await page.keyboard.press('Backspace'); // undoes R
  await expect(page.locator('#flHeld')).toHaveText(SOLVED_FACELETS);
  await page.keyboard.press('Backspace'); // nothing left to undo
  await page.waitForTimeout(500);
  await expect(page.locator('#flHeld')).toHaveText(SOLVED_FACELETS);

  // D, L, B move the fixed corner: the cube ends up held differently, and Backspace still undoes it
  await page.keyboard.press('d');
  await expect(page.locator('#cbDepth')).toHaveText('1');
  await expect(page.locator('#orientText')).toHaveText('Held in another orientation');
  await page.keyboard.press('Backspace');
  await expect(page.locator('#flHeld')).toHaveText(SOLVED_FACELETS);
  expect(errors).toEqual([]);
});

test('X Y Z turn the whole cube without changing the state', async ({ page }) => {
  await open(page);
  await page.keyboard.press('x');
  await expect(page.locator('#orientText')).toHaveText('Held in another orientation');
  await expect(page.locator('#cbDepth')).toHaveText('0');
  await page.keyboard.press('Shift+X');
  await expect(page.locator('#orientText')).toHaveText('Standard orientation');
});

test('keys do nothing while typing, or with Ctrl held', async ({ page }) => {
  await open(page);
  await find(page, 'R U');
  await expect(page.locator('#cbDepth')).toHaveText('2'); // found (2 turns out), though no layers are drawn yet
  const held = await page.locator('#flHeld').textContent();
  await page.locator('#stateInput').fill('');
  await page.locator('#stateInput').type('uRf'); // typed into the field, not turned
  await expect(page.locator('#stateInput')).toHaveValue('uRf');
  await expect(page.locator('#flHeld')).toHaveText(held!);
  await page.locator('#btnToolsClose').click();
  await page.keyboard.press('Control+u');
  await expect(page.locator('#flHeld')).toHaveText(held!);
});

/** A picture of the 3D stage without the HTML labels on it, once it has stopped moving. */
async function stillStage(page: Page): Promise<Buffer> {
  let last = await page.locator('#graph').screenshot();
  await expect.poll(async () => { const now = await page.locator('#graph').screenshot(); const same = now.equals(last); last = now; return same; },
    { timeout: 120_000, intervals: [1000] }).toBe(true);
  return last;
}

test('arrow keys orbit the camera, + and - zoom, 0 shows the whole graph', async ({ page }) => {
  const errors = await open(page);
  await growTo(page, 2);
  await page.addStyleTag({ content: '.labels, .overlay, .bottom, .top-left { visibility: hidden !important; }' });
  const start = await stillStage(page);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  const turned = await stillStage(page);
  expect(turned.equals(start)).toBe(false);
  await page.keyboard.press('+');
  const zoomed = await stillStage(page);
  expect(zoomed.equals(turned)).toBe(false);
  await page.keyboard.press('0');
  await expect.poll(async () => (await stillStage(page)).equals(zoomed)).toBe(false);
  expect(errors).toEqual([]);
});

test('? opens the help, which lists the keys', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Shift+?');
  await expect(page.locator('#help')).toBeVisible();
  await expect(page.locator('#help')).toContainText('undo the last turn');
  await page.keyboard.press('Escape');
  await expect(page.locator('#help')).toBeHidden();
  await openTool(page, 'Turn');
  await expect(page.getByRole('button', { name: "Turn R'", exact: true })).toHaveAttribute('title', 'Key: Shift+R');
});

test('in an embed, keys act only inside the explorer', async ({ page }) => {
  await page.goto('/embed-demo.html');
  const narrow = page.locator('#narrow');
  await narrow.scrollIntoViewIfNeeded();
  await expect(narrow.locator('#btnGrow')).toBeEnabled();
  await page.locator('main > h1').click();
  await page.keyboard.press('r');
  await expect(narrow.locator('#flHeld')).toHaveText(SOLVED_FACELETS);
  await narrow.locator('#graph').hover({ position: { x: 60, y: 200 } });
  await page.keyboard.press('r');
  await expect(narrow.locator('#flHeld')).not.toHaveText(SOLVED_FACELETS);
});
