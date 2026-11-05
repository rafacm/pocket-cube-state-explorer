// Renders the README screenshots and the link-preview image from the built site, in headless Chromium
// with software WebGL (no GPU needed; slow on small machines, a minute or two per scene).
//
//   bun run build && bun scripts/screenshots.ts [scene ...]
//
// Scenes (default: all) write to docs/screenshots/<scene>.png; "preview" writes public/og.jpg, the
// image shown when someone shares a link to the explorer. Needs Playwright's Chromium
// (bunx playwright install chromium); without root, scripts/headless-deps.sh provides its libraries.
import { chromium, type Page } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { CHROMIUM_ARGS, chromiumEnv } from './chromium';
import { computeDistances } from '../src/graph/distances';
import { decodeCode, faceletString, NSTATE } from '../src/model';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist');

// ---------- driving the explorer ----------
async function open(page: Page, url: string) {
  await page.goto(url);
  await page.locator('#btnGrow').waitFor();
  const pace = page.locator('#optPace');
  if (await pace.isChecked()) await pace.uncheck();
}
async function growTo(page: Page, layers: number) {
  for (let d = 1; d <= layers; d++) {
    const grow = page.locator('#btnGrow');
    await page.waitForFunction((t) => { const b = document.querySelector<HTMLButtonElement>('#btnGrow'); return !!b && b.textContent === t && !b.disabled; }, `Grow layer ${d}`, { timeout: 600_000 });
    await grow.click();
    console.log(`  layer ${d}`);
  }
  await page.waitForFunction((t) => document.querySelector('#btnGrow')?.textContent !== t, `Grow layer ${layers}`, { timeout: 600_000 });
  await page.locator('#statBusy').waitFor({ state: 'hidden', timeout: 600_000 });
}
async function find(page: Page, text: string) {
  await page.locator('#stateInput').fill(text);
  await page.locator('#findForm button[type=submit]').click();
}
/** Waits for the camera to come to rest, then tidies up: no focus ring, no hover, panel at the top. */
async function settle(page: Page, ms = 6000) {
  await page.mouse.move(1, 1);
  await page.waitForTimeout(ms);
  await page.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur(); document.querySelector('.panel')!.scrollTop = 0; });
  await page.waitForTimeout(800);
}
/** Zooms with the wheel over the middle of the stage (negative: in). */
async function zoom(page: Page, steps: number) {
  const box = (await page.locator('#graph').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < Math.abs(steps); i++) { await page.mouse.wheel(0, Math.sign(steps) * 100); await page.waitForTimeout(60); }
}
async function clickStageCentre(page: Page) {
  const box = (await page.locator('#graph').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}
/** The facelet string of some state exactly `d` quarter turns from solved. */
function stateAt(d: number): string {
  const dist = computeDistances(false);
  for (let c = 12345; c < NSTATE; c++) if (dist[c] === d) return faceletString(decodeCode(c));
  throw new Error(`no state at distance ${d}`);
}

// ---------- scenes ----------
interface Scene {
  name: string;
  /** what it shows, for the log */
  what: string;
  width: number; height: number;
  out: string;
  run(page: Page): Promise<void>;
  /** device pixel ratio: below 1 renders a large layout into a smaller picture */
  scale?: number;
  /** the system colour scheme the page sees */
  colorScheme?: 'light' | 'dark';
}
const shot = (name: string) => join(ROOT, 'docs/screenshots', name + '.png');
/** The first screenshot, also used as the link preview: the solved cube and two layers around it. */
async function firstLayers(page: Page) { await growTo(page, 2); await settle(page, 9000); }
const scenes: Scene[] = [
  {
    name: 'overview', what: 'the first 2 layers: 34 stickered cubes, their links and turn labels',
    width: 1600, height: 1000, out: shot('overview'),
    run: firstLayers,
  },
  {
    name: 'routes', what: 'a scramble found in the graph: its shortest routes, links and turn labels up close',
    width: 1600, height: 1000, out: shot('routes'),
    async run(page) {
      await growTo(page, 5);
      await settle(page, 8000); // let the layout come to rest first
      await find(page, "R U R' F2");
      await settle(page, 5000);
      await clickStageCentre(page); // the selected cube is in the middle: show its clickable turns
      await settle(page, 2500);
    },
  },
  {
    name: 'tree', what: '"Tree only": the first route found to each state, 5 layers',
    width: 1600, height: 1000, out: shot('tree'),
    async run(page) {
      await growTo(page, 5);
      await page.getByRole('button', { name: 'Tree only' }).click();
      await settle(page, 8000);
    },
  },
  {
    name: 'dots-up-close', what: 'zoomed into an outer layer: dots become stickered cubes with their links',
    width: 1600, height: 1000, out: shot('dots-up-close'),
    async run(page) {
      await growTo(page, 8);
      await find(page, stateAt(8));
      await settle(page, 6000);
      await zoom(page, -3);
      await settle(page, 4000);
    },
  },
  {
    name: 'dark', what: 'dark mode: three layers and a selected state, its routes and turn labels',
    width: 1600, height: 1000, out: shot('dark'), colorScheme: 'dark',
    async run(page) {
      await growTo(page, 3);
      await settle(page, 6000);
      await find(page, 'R U');
      await settle(page, 5000);
      await clickStageCentre(page); // the selected cube is in the middle: show its clickable turns
      await settle(page, 2500);
    },
  },
  {
    // The overview, laid out at 1600 x 840 and drawn at 0.75 scale: 1200 x 630, the shape link previews
    // use. JPEG, because WhatsApp skips preview images much over 300 kB.
    name: 'preview', what: 'the link-preview image (Open Graph): the overview at 1200 x 630',
    width: 1600, height: 840, scale: 0.75, out: join(ROOT, 'public/og.jpg'),
    run: firstLayers,
  },
];

// ---------- serving dist/ and running ----------
if (!existsSync(join(DIST, 'index.html'))) { console.error('No dist/index.html: run bun run build first'); process.exit(1); }
const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = Bun.serve({
  port: 0,
  fetch(req) {
    let path = decodeURIComponent(new URL(req.url).pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = join(DIST, path);
    if (!file.startsWith(DIST) || !existsSync(file)) return new Response('not found', { status: 404 });
    return new Response(Bun.file(file), { headers: { 'content-type': types[extname(file)] ?? 'application/octet-stream' } });
  },
});
const url = `http://localhost:${server.port}/`;

const wanted = process.argv.slice(2);
const unknown = wanted.filter(w => !scenes.some(s => s.name === w));
if (unknown.length) { console.error(`Unknown scene(s): ${unknown.join(', ')}. Scenes: ${scenes.map(s => s.name).join(', ')}`); process.exit(1); }

const browser = await chromium.launch({ env: chromiumEnv(), args: CHROMIUM_ARGS });
let failed = 0;
for (const scene of scenes.filter(s => !wanted.length || wanted.includes(s.name))) {
  const t0 = Date.now();
  console.log(`${scene.name}: ${scene.what}`);
  const page = await browser.newPage({ viewport: { width: scene.width, height: scene.height }, deviceScaleFactor: scene.scale ?? 1, colorScheme: scene.colorScheme ?? 'light' });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  try {
    await open(page, url);
    await scene.run(page);
    mkdirSync(dirname(scene.out), { recursive: true });
    const jpeg = scene.out.endsWith('.jpg');
    await page.screenshot({ path: scene.out, timeout: 300_000, type: jpeg ? 'jpeg' : 'png', ...(jpeg ? { quality: 82 } : {}) });
    console.log(`  saved ${scene.out} (${Math.round((Date.now() - t0) / 1000)} s)`);
  } catch (e) {
    failed++; console.error(`  failed: ${e}`);
  }
  if (errors.length) { failed++; console.error(`  page errors: ${errors.join('; ')}`); }
  await page.close();
}
await browser.close();
server.stop(true);
process.exit(failed ? 1 : 0);
