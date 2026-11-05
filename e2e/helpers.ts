import { expect, type Locator, type Page } from '@playwright/test';

/** Opens the explorer and fails the test on any uncaught page error. */
export async function open(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  await expect(page.locator('#btnGrow')).toBeEnabled();
  return errors;
}

/** Grows the graph until `layers` layers beyond the solved cube are drawn (as fast as possible). */
export async function growTo(page: Page, layers: number): Promise<void> {
  const pace = page.locator('#optPace');
  if (await pace.isChecked()) await pace.uncheck();
  for (let d = 1; d <= layers; d++) {
    const grow = page.locator('#btnGrow');
    await expect(grow).toHaveText(`Grow layer ${d}`, { timeout: 120_000 });
    await expect(grow).toBeEnabled({ timeout: 120_000 });
    await grow.click();
  }
  await expect(page.locator('#btnGrow')).not.toHaveText(`Grow layer ${layers}`, { timeout: 120_000 });
  await expect(page.locator('#statBusy')).toBeHidden({ timeout: 120_000 });
}

/** The state counter in the top right of the stage, as a number. */
export async function statesShown(page: Page): Promise<number> {
  return Number((await page.locator('#statStates').textContent())!.replace(/,/g, ''));
}

/** Turns the walk speed to the fastest setting and stops the camera from following, so walks are quick. */
export async function fastWalks(page: Page): Promise<void> {
  await page.locator('#optSpeed').fill('5');
  const follow = page.locator('#optFollow');
  if (await follow.isChecked()) await follow.uncheck();
}

export const SOLVED_FACELETS = 'WWWW:RRRR:GGGG:YYYY:OOOO:BBBB';

/** The colour the 3D stage is drawn in: a pixel near the bottom-right corner of the WebGL canvas. */
export async function stagePixel(canvas: Locator): Promise<[number, number, number]> {
  const png = (await canvas.screenshot()).toString('base64');
  return canvas.page().evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d')!; g.drawImage(img, 0, 0);
    const d = g.getImageData(img.width - 6, img.height - 6, 1, 1).data;
    return [d[0], d[1], d[2]] as [number, number, number];
  }, png);
}
export const isDark = ([r, g, b]: [number, number, number]) => r + g + b < 150;
export const isLight = ([r, g, b]: [number, number, number]) => r + g + b > 600;
