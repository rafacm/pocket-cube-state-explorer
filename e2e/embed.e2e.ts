import { expect, test } from '@playwright/test';

// embed-demo.html: two <pocket-cube-explorer> elements in a page that stands in for a blog post.
// Locators pierce their shadow roots, scoped to one element because both use the same ids inside.
test('embeds as a web component, isolated from the page and from each other', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/embed-demo.html');
  const narrow = page.locator('#narrow'), wide = page.locator('#wide');
  await narrow.scrollIntoViewIfNeeded();
  await expect(narrow.locator('#btnGrow')).toBeEnabled();

  // in the text column it stacks: no title bar (no-header), the panel below the stage
  await expect(narrow.locator('.bar')).toBeHidden();
  const stage = (await narrow.locator('#stage').boundingBox())!, panel = (await narrow.locator('.panel').boundingBox())!;
  expect(panel.y).toBeGreaterThanOrEqual(stage.y + stage.height - 1);
  // its own fonts and colours, not the page's serif text
  expect(await narrow.locator('.app').evaluate(e => getComputedStyle(e).fontFamily)).toContain('Instrument Sans');
  expect(await page.locator('main p').first().evaluate(e => getComputedStyle(e).fontFamily)).toContain('Georgia');

  // it works
  await narrow.locator('#optPace').uncheck();
  await narrow.locator('#btnGrow').click();
  await expect(narrow.locator('#btnGrow')).toHaveText('Grow layer 2');
  await narrow.locator('#btnGrow').click();
  await expect(narrow.locator('#statStates')).toHaveText('34');
  await narrow.locator('#stateInput').fill('R U');
  await narrow.locator('#findForm button[type=submit]').click();
  await expect(narrow.locator('#cbDepth')).toHaveText('2');

  // Esc in its search box is for the box (the key's real target is found inside the shadow root)
  await narrow.locator('#stateInput').press('Escape');
  await expect(narrow.locator('#routesNote')).not.toContainText('No state selected');
  // Esc elsewhere on the page does nothing
  await page.locator('main > h1').click();
  await page.keyboard.press('Escape');
  await expect(narrow.locator('#routesNote')).not.toContainText('No state selected');
  // Esc with the pointer over its stage deselects
  await narrow.locator('#graph').hover();
  await page.keyboard.press('Escape');
  await expect(narrow.locator('#routesNote')).toContainText('No state selected');

  // the second explorer starts when it scrolls into view, with its own state
  await wide.scrollIntoViewIfNeeded();
  await expect(wide.locator('#btnGrow')).toHaveText('Grow layer 1');
  await expect(wide.locator('#statStates')).toHaveText('1');
  await expect(wide.locator('.bar')).toBeVisible();
  expect(Math.round((await wide.locator('.app').boundingBox())!.height)).toBe(640);

  // removing it stops it cleanly
  await page.locator('#remove').click();
  await expect(page.locator('pocket-cube-explorer')).toHaveCount(1);
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});
