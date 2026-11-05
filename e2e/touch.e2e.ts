import { expect, test, type Page } from '@playwright/test';
import { growTo, open } from './helpers';

// A touch screen: real two-finger touches through the DevTools protocol (synthetic pointer events
// cannot be captured, which OrbitControls needs). Reduced motion stops the automatic spin, so only
// the pinch can move the camera.
test.use({ hasTouch: true, reducedMotion: 'reduce' });

/** How much of the stage the graph covers: the share of pixels that are not the stage colour. */
async function inkShare(page: Page): Promise<number> {
  const png = (await page.locator('#graph').screenshot()).toString('base64');
  return page.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d')!; g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let ink = 0;
    for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 246) + Math.abs(d[i + 1] - 244) + Math.abs(d[i + 2] - 239) > 60) ink++;
    return ink / (d.length / 4);
  }, png);
}

test('pinching zooms the graph on a touch screen', async ({ page }) => {
  const errors = await open(page);
  await growTo(page, 2);
  await page.addStyleTag({ content: '.labels, .overlay { visibility: hidden !important; }' });
  // wait for the camera to come to rest after growing
  let last = -1;
  await expect.poll(async () => { const now = await inkShare(page); const same = Math.abs(now - last) < 1e-4; last = now; return same; },
    { timeout: 120_000, intervals: [1000] }).toBe(true);

  const box = (await page.locator('#graph').boundingBox())!, cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', d: number) => cdp.send('Input.dispatchTouchEvent', {
    type, touchPoints: type === 'touchEnd' ? [] : [{ x: cx - d, y: cy, id: 0 }, { x: cx + d, y: cy, id: 1 }],
  });
  await touch('touchStart', 30);
  for (let d = 40; d <= 240; d += 10) { await touch('touchMove', d); await page.waitForTimeout(16); }
  await touch('touchEnd', 0);
  await page.waitForTimeout(2000);
  expect(await inkShare(page)).toBeGreaterThan(last * 1.3); // spreading two fingers apart zooms in
  expect(errors).toEqual([]);
});
