import { expect, test } from '@playwright/test';
import { find, growTo } from './helpers';

// embed-demo.html: <pocket-cube-explorer> elements in a page that stands in for a blog post.
// Locators pierce their shadow roots, scoped to one element because they use the same ids inside.
test('embeds as a web component, isolated from the page and from each other', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/embed-demo.html');
  const narrow = page.locator('#narrow'), wide = page.locator('#wide');
  await narrow.scrollIntoViewIfNeeded();
  await expect(narrow.locator('#btnGrow')).toBeEnabled();

  // in the text column it keeps its height, with no title of its own (no-header)
  await expect(narrow.locator('.title')).toBeHidden();
  expect(Math.round((await narrow.locator('.app').boundingBox())!.height)).toBe(720);
  // its own fonts, not the page's serif text
  expect(await narrow.locator('.app').evaluate(e => getComputedStyle(e).fontFamily)).toContain('Instrument Sans');
  expect(await page.locator('main p').first().evaluate(e => getComputedStyle(e).fontFamily)).toContain('Georgia');

  // it works; in a column this narrow the drawer covers the stage and the card steps back
  await growTo(narrow, 2);
  await expect(narrow.locator('#statStates')).toHaveText('34');
  await find(narrow, 'R U');
  await expect(narrow.locator('#cbDepth')).toHaveText('2');
  await expect(narrow.locator('#tools')).toBeVisible();
  await expect(narrow.locator('#card')).toBeHidden();

  // Esc in its search box closes the drawer and keeps the selection (the key's real target is found
  // inside the shadow root)
  await narrow.locator('#stateInput').press('Escape');
  await expect(narrow.locator('#tools')).toBeHidden();
  await expect(narrow.locator('#card')).toBeVisible();
  await expect(narrow.locator('#routesNote')).not.toContainText('No state selected');
  // Esc elsewhere on the page does nothing
  await page.locator('main > h1').click();
  await page.keyboard.press('Escape');
  await expect(narrow.locator('#routesNote')).not.toContainText('No state selected');
  // Esc with the pointer over its stage deselects
  await narrow.locator('#graph').hover({ position: { x: 60, y: 200 } });
  await page.keyboard.press('Escape');
  await expect(narrow.locator('#routesNote')).toContainText('No state selected');

  // the second explorer starts when it scrolls into view, with its own state and its own height
  await wide.scrollIntoViewIfNeeded();
  await expect(wide.locator('#btnGrow')).toHaveText('Add layer 1');
  await expect(wide.locator('#statStates')).toHaveText('1');
  await expect(wide.locator('.title')).toBeVisible();
  expect(Math.round((await wide.locator('.app').boundingBox())!.height)).toBe(640);

  // removing it stops it cleanly
  await page.locator('#remove').click();
  await expect(page.locator('pocket-cube-explorer')).toHaveCount(2);
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});

test('an embed can limit the layers and show fewer controls', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/embed-demo.html');
  const small = page.locator('#small');
  await small.scrollIntoViewIfNeeded();
  await expect(small.locator('#btnGrow')).toBeEnabled();
  await expect(small.locator('#btnTools')).toBeHidden(); // controls="minimal"
  await expect(small.locator('#btnKey')).toBeHidden();
  await growTo(small, 2);                                // max-layers="2"
  await expect(small.locator('#btnGrow')).toHaveText('All 2 layers shown');
  await expect(small.locator('#btnGrow')).toBeDisabled();
  await expect(small.locator('#growNote')).toHaveText('The full explorer shows all 14');
  expect(errors).toEqual([]);
});
