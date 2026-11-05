// Opens the explorer in headless Chromium (software WebGL, no GPU needed), grows the graph,
// reports page errors and saves a screenshot.
//
//   bun scripts/screenshot.ts [options]
//     --dir <folder>      serve this folder and open its index.html (default: dist)
//     --url <url>         open this URL instead of serving a folder
//     --layers <n>        grow the graph to n layers (default 14: the whole graph)
//     --select <moves>    afterwards, find this state (e.g. "R U R' F2") so its routes light up
//     --out <file.png>    where to save the screenshot (default docs/screenshot.png)
//     --width/--height    viewport size in CSS pixels (default 1600 x 1000)
//     --scale <n>         device pixel ratio (default 1)
//     --timeout <s>       give up after this many seconds (default 900)
//     --stage             capture only the 3D stage, not the whole window
//
// Needs Playwright's Chromium (bunx playwright install chromium) and its system libraries; without
// root, scripts/headless-deps.sh unpacks those into .cache/headless/, which is used when present.
//
// Exit code 1 if the page threw an error or growing did not finish in time.
import { chromium } from '@playwright/test';
import { CHROMIUM_ARGS, chromiumEnv } from './chromium';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve, extname } from 'node:path';

const args = process.argv.slice(2);
const opt = (name: string, def: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : def;
};
const layers = Number(opt('layers', '14'));
const out = resolve(opt('out', 'docs/screenshot.png'));
const width = Number(opt('width', '1600')), height = Number(opt('height', '1000'));
const scale = Number(opt('scale', '1'));
const timeoutMs = Number(opt('timeout', '900')) * 1000;
const select = opt('select', '');

let url = opt('url', '');
let server: ReturnType<typeof Bun.serve> | undefined;
if (!url) {
  const root = resolve(opt('dir', 'dist'));
  if (!existsSync(join(root, 'index.html'))) { console.error(`No index.html in ${root} (run bun run build first?)`); process.exit(1); }
  const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
  server = Bun.serve({
    port: 0,
    fetch(req) {
      let path = decodeURIComponent(new URL(req.url).pathname);
      if (path.endsWith('/')) path += 'index.html';
      const file = join(root, path);
      if (!file.startsWith(root) || !existsSync(file)) return new Response('not found', { status: 404 });
      return new Response(Bun.file(file), { headers: { 'content-type': types[extname(file)] ?? 'application/octet-stream' } });
    },
  });
  url = `http://localhost:${server.port}/`;
}

const browser = await chromium.launch({ env: chromiumEnv(), args: CHROMIUM_ARGS });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
const errors: string[] = [];
page.on('pageerror', (e) => { errors.push(String(e)); console.error('page error:', e); });
page.on('console', (m) => { if (m.type() === 'error') console.error('console error:', m.text()); });

const t0 = Date.now();
const secs = () => ((Date.now() - t0) / 1000).toFixed(0) + ' s';
let ok = true;
try {
  await page.goto(url, { waitUntil: 'load' });
  // The explorer may live in the page itself or inside a <pocket-cube-explorer> shadow root;
  // Playwright's CSS selectors pierce open shadow roots, so the same ids work for both.
  await page.locator('#btnGrow').waitFor({ timeout: 30_000 });
  // Calm, unhurried growth is the default; for a screenshot we want it as fast as possible.
  const pace = page.locator('#optPace');
  if (await pace.isChecked()) await pace.uncheck();

  const drawn = async () => (await page.locator('#census tr').evaluateAll((rows) =>
    rows.filter((r) => { const c = r.querySelectorAll('td'); return c.length > 2 && c[1].textContent?.trim() === c[2].textContent?.trim() && c[1].textContent?.trim() !== '0'; }).length));
  while (Date.now() - t0 < timeoutMs) {
    const n = await drawn();
    if (n >= layers + 1) break; // layer 0 (solved) plus n grown layers
    const grow = page.locator('#btnGrow');
    if (await grow.isEnabled()) {
      console.log(`${secs()}: ${n - 1} layers drawn, growing: ${(await grow.textContent())?.trim()}`);
      await grow.click();
    }
    await page.waitForTimeout(1000);
  }
  if ((await drawn()) < layers + 1) { ok = false; console.error(`Timed out with ${(await drawn()) - 1} layers drawn`); }

  if (select) {
    await page.locator('#stateInput').fill(select);
    await page.locator('#findForm button[type=submit]').click();
  }
  await page.locator('#statBusy').waitFor({ state: 'hidden', timeout: 120_000 }).catch(() => {});
  await page.waitForTimeout(8000); // let the camera settle and the labels appear
  mkdirSync(dirname(out), { recursive: true });
  if (args.includes('--stage')) await page.locator('#stage').screenshot({ path: out, timeout: 300_000 });
  else await page.screenshot({ path: out, timeout: 300_000 });
  console.log(`${secs()}: saved ${out}`);
} catch (e) {
  ok = false;
  console.error(e);
} finally {
  await browser.close();
  server?.stop(true);
}
if (errors.length) console.error(`${errors.length} page error(s)`);
process.exit(ok && !errors.length ? 0 : 1);
