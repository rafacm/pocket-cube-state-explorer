import { expect, type Locator, type Page } from '@playwright/test';

/** Opens the explorer and fails the test on any uncaught page error. */
export async function open(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  await expect(page.locator('#btnGrow')).toBeEnabled();
  return errors;
}

type Root = Page | Locator;

/** Grows the graph until `layers` layers beyond the solved cube are drawn (as fast as possible). */
export async function growTo(root: Root, layers: number): Promise<void> {
  await noPacing(root);
  const grow = root.locator('#btnGrow');
  for (let d = 1; d <= layers; d++) {
    await expect(grow).toHaveText(`Add layer ${d}`, { timeout: 120_000 });
    await expect(grow).toBeEnabled({ timeout: 120_000 });
    await grow.click();
    // headless Chromium draws without a GPU, so the explorer gives a heads-up before heavy layers
    const yes = root.locator('#btnHeadsYes');
    if (await yes.isVisible()) await yes.click();
  }
  await expect(grow).not.toHaveText(`Add layer ${layers}`, { timeout: 120_000 });
  await expect(root.locator('#statBusy')).toBeHidden({ timeout: 300_000 }); // a big layout settles slowly without a GPU
}

/** Outer layers appear as soon as they are arranged (the setting sits in Tools > View). */
export async function noPacing(root: Root): Promise<void> {
  await root.locator('#optPace').evaluate((e: HTMLInputElement) => { e.checked = false; });
}

/** Opens the Tools drawer on a tab. */
export async function openTool(root: Root, tab: 'Find' | 'Turn' | 'View' | 'Data' | 'About'): Promise<void> {
  const btn = root.locator('#btnTools');
  if ((await btn.getAttribute('aria-expanded')) !== 'true') await btn.click();
  await root.getByRole('tab', { name: tab, exact: true }).click();
}

/** Finds a state with Tools > Find. */
export async function find(root: Root, text: string): Promise<void> {
  await openTool(root, 'Find');
  await root.locator('#stateInput').fill(text);
  await root.locator('#findForm button[type=submit]').click();
}

/** The state counter in the top right of the stage, as a number. */
export async function statesShown(page: Page): Promise<number> {
  return Number((await page.locator('#statStates').textContent())!.replace(/,/g, ''));
}

/** Turns the walk speed to the fastest setting and stops the camera from following, so walks are quick. */
export async function fastWalks(root: Root): Promise<void> {
  await root.locator('#optSpeed').evaluate((e: HTMLInputElement) => { e.value = '5'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await root.locator('#optFollow').evaluate((e: HTMLInputElement) => { e.checked = false; });
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
