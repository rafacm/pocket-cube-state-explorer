// Measures Solve's walk with the camera following: how smoothly it draws, and how much it reads as
// travelling down to the solved cube.
//
//   bun run measure [options]          (builds first; or: bun scripts/measure.ts [options] on a fresh dist/)
//
//   --layers N        layers to add before solving (default 6)
//   --scramble TEXT   the state to solve, a scramble or facelet string (default "R U F R' U", distance 5);
//                     it must be in the layers drawn
//   --speed N         walk speed 1 (very slow) .. 5 (very fast), as in Tools > View (default 3, normal)
//   --browser NAME    chromium (default) or webkit (Safari's engine; macOS and some Linux)
//   --headed          show the browser window: headless browsers may draw without the GPU
//   --software        force software WebGL (SwiftShader); the default on Linux, where this was developed
//   --gpu             don't force it, even on Linux
//   --url URL         measure another copy (e.g. the live site) instead of serving dist/
//   --json FILE       also write the results as JSON, to compare runs
//
// It opens the explorer with ?probe (src/explorer.ts), records every frame from pressing Solve until the
// camera rests on the solved cube, and reports:
//
// Smoothness, per phase (the approach flight, the turns, the camera flights between them): frames per
// second, the 95th percentile and slowest frame times, and frames slower than 33 ms (below 30 fps).
//
// Travelling down, from what was on screen in each frame:
//   way ahead down    the screen direction from the current state to the next one on the route, as an
//                     angle from straight down; the share of frames within 45 degrees of it
//   solved below      the same toward the solved cube
//   nearer            of all the camera's movement, the share that brings it nearer the solved cube
//   in view           the share of frames with the solved cube, and with the next state, on screen
//   steadiness        how fast the viewing direction turns (95th percentile and fastest, degrees per
//                     second), and the wander: degrees turned in all over the net turn from start to end
//   descent score     0..100, the mean of: way ahead within 45 degrees of down, nearer, solved cube in
//                     view, and steadiness (1 when the 95th percentile turn is at most 60 degrees per
//                     second, less in proportion above it)
import { chromium, webkit, type Browser, type Page } from '@playwright/test';
import { existsSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { CHROMIUM_ARGS, chromiumEnv } from './chromium';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist');

// ---------- options ----------
const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes('--' + name);
const opt = (name: string, def: string) => { const i = argv.indexOf('--' + name); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : def; };
const LAYERS = +opt('layers', '6');
const SCRAMBLE = opt('scramble', "R U F R' U");
const SPEED = Math.min(5, Math.max(1, +opt('speed', '3')));
const BROWSER = opt('browser', 'chromium');
const HEADED = flag('headed');
const SOFTWARE = flag('software') || (process.platform === 'linux' && !flag('gpu'));
const JSON_OUT = opt('json', '');
const SPEED_NAMES = ['', 'Very slow', 'Slow', 'Normal', 'Fast', 'Very fast'];

// ---------- what the page records ----------
type V3 = [number, number, number];
type Phase = 'approach' | 'turn' | 'flight';
interface Frame {
  t: number; phase: Phase; depth: number; drawn: boolean;
  /** projection × view matrix of what was drawn (column-major) */
  m: number[];
  cam: V3; tgt: V3;
  /** where the current state is drawn */
  p: V3 | null;
}
interface Recording { w: number; h: number; solved: V3; renderer: string; startDepth: number; frames: Frame[] }

/** Runs in the page: hooks into the explorer's frame loop, presses Solve, records until the camera rests. */
function record(): void {
  type Any = any; // the explorer's internals, read-only
  const w = window as Any;
  const x: Any = document.querySelector<HTMLElement & { pcseProbe?: unknown }>('#app')!.pcseProbe;
  const gs = x.gs, cam = gs.cam, S = x.graph.nodes[0], canvas = gs.renderer.domElement as HTMLCanvasElement;
  let renderer = 'unknown';
  try {
    const gl = gs.renderer.getContext(), info = gl.getExtension('WEBGL_debug_renderer_info');
    renderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  } catch { /* not available */ }
  const depthOf = () => x.sel.node ? x.sel.node.depth : x.sel.dot ? x.sel.dot.depth : -1;
  const pointOf = (): V3 | null => {
    if (x.sel.node) return [x.sel.node.x, x.sel.node.y, x.sel.node.z];
    if (x.sel.dot && x.dots) {
      const j = x.dots.map[x.sel.dot.code];
      if (j <= -2) { const n = x.graph.nodes[-2 - j]; return [n.x, n.y, n.z]; }
      if (j >= 0) return [x.dots.pos[j * 3], x.dots.pos[j * 3 + 1], x.dots.pos[j * 3 + 2]];
    }
    return null;
  };
  const rec: Recording = { w: canvas.clientWidth, h: canvas.clientHeight, solved: [S.x, S.y, S.z], renderer, startDepth: depthOf(), frames: [] };
  const pm = cam.projectionMatrix.clone();
  let started = false, lastRender = gs.renderer.info.render.frame;
  x.probe = (now: number) => {
    const c = x.cube, a = c.anim;
    if (a && a.kind === 'turn' && a.item.mv.kind !== 'rot') started = true; // the first face turn (not a rotation to the standard orientation)
    const phase: Phase = !started ? 'approach' : a && a.kind === 'turn' ? 'turn' : 'flight';
    const frame = gs.renderer.info.render.frame, drawn = frame !== lastRender; lastRender = frame;
    pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    const t = gs.controls.target;
    rec.frames.push({ t: now, phase, depth: depthOf(), drawn, m: Array.from(pm.elements as ArrayLike<number>), cam: [cam.position.x, cam.position.y, cam.position.z], tgt: [t.x, t.y, t.z], p: pointOf() });
    if (started && depthOf() === 0 && !c.anim && !c.queue.length && !x.cam.flight) { x.probe = null; w.__measured = rec; }
  };
  x.el.btnHome.click();
}

// ---------- driving the explorer ----------
async function prepare(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.locator('#btnGrow').waitFor();
  await page.locator('#optPace').evaluate((e: HTMLInputElement) => { e.checked = false; }); // outer layers at once
  for (let d = 1; d <= LAYERS; d++) {
    await page.waitForFunction((t) => { const b = document.querySelector<HTMLButtonElement>('#btnGrow'); return !!b && b.textContent === t && !b.disabled; }, `Add layer ${d}`, { timeout: 900_000 });
    await page.locator('#btnGrow').click();
    if (await page.locator('#btnHeadsYes').isVisible()) await page.locator('#btnHeadsYes').click(); // the heads-up before heavy layers
    process.stdout.write(`\r  adding layers: ${d}/${LAYERS}`);
  }
  await page.waitForFunction((t) => document.querySelector('#btnGrow')?.textContent !== t, `Add layer ${LAYERS}`, { timeout: 900_000 });
  await page.locator('#statBusy').waitFor({ state: 'hidden', timeout: 900_000 });
  console.log();
  await page.locator('#btnTools').click();
  await page.getByRole('tab', { name: 'Find', exact: true }).click();
  await page.locator('#stateInput').fill(SCRAMBLE);
  await page.locator('#findForm button[type=submit]').click();
  await page.waitForFunction(() => document.querySelector('#cbDepth')?.textContent !== '0', undefined, { timeout: 60_000 }).catch(() => {});
  const depth = (await page.locator('#cbDepth').textContent()) ?? '';
  if (!/^\d+$/.test(depth) || +depth === 0) throw new Error(`"${SCRAMBLE}" is ${depth.startsWith('>') ? 'beyond the layers drawn' : 'not a state to solve'} (distance ${depth}); add more layers or pick another`);
  await page.locator('#optSpeed').evaluate((e: HTMLInputElement, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, String(SPEED));
  await page.locator('#optFollow').evaluate((e: HTMLInputElement) => { e.checked = true; });
  await page.locator('#btnToolsClose').click();
  await page.mouse.move(1, 1);
  await page.waitForTimeout(2500); // the flight to the selected state ends
}

// ---------- analysis ----------
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const angle = (a: V3, b: V3) => Math.acos(Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (len(a) * len(b) || 1)))) * 180 / Math.PI;
const pct = (n: number, d: number) => d ? Math.round(100 * n / d) : 0;
const quantile = (xs: number[], q: number) => { if (!xs.length) return 0; const s = xs.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const median = (xs: number[]) => quantile(xs, 0.5);

/** Where a point lands on screen, in CSS pixels (y down), or null when it is behind the camera. */
function project(m: number[], v: V3, w: number, h: number): { x: number; y: number; inside: boolean } | null {
  const cw = m[3] * v[0] + m[7] * v[1] + m[11] * v[2] + m[15];
  if (cw <= 1e-6) return null;
  const nx = (m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12]) / cw, ny = (m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13]) / cw;
  return { x: (nx + 1) / 2 * w, y: (1 - ny) / 2 * h, inside: Math.abs(nx) <= 1 && Math.abs(ny) <= 1 };
}
/** Angle in degrees between the screen direction from a to b and straight down, or null if too short to tell. */
function fromDown(m: number[], a: V3, b: V3, w: number, h: number): number | null {
  const pa = project(m, a, w, h), pb = project(m, b, w, h);
  if (!pa || !pb) return null;
  const dx = pb.x - pa.x, dy = pb.y - pa.y, l = Math.hypot(dx, dy);
  return l < 4 ? null : Math.acos(Math.max(-1, Math.min(1, dy / l))) * 180 / Math.PI;
}

function analyse(rec: Recording) {
  const F = rec.frames, { w, h, solved } = rec;
  // the states walked through, in order
  const path: V3[] = []; let lastDepth = NaN;
  const at: number[] = F.map(f => { if (f.depth !== lastDepth && f.p) { path.push(f.p); lastDepth = f.depth; } return path.length - 1; });

  // smoothness
  const phases: (Phase | 'all')[] = ['approach', 'turn', 'flight', 'all'];
  const timing = Object.fromEntries(phases.map(ph => {
    const dts: number[] = [];
    for (let i = 1; i < F.length; i++) if (ph === 'all' || F[i].phase === ph) dts.push(F[i].t - F[i - 1].t);
    const time = dts.reduce((s, d) => s + d, 0);
    return [ph, { frames: dts.length, seconds: +(time / 1000).toFixed(2), fps: time ? +(1000 * dts.length / time).toFixed(1) : 0, p95ms: +quantile(dts, 0.95).toFixed(1), maxMs: +Math.max(0, ...dts).toFixed(1), over33: dts.filter(d => d > 33.4).length }];
  }));
  const firstTurn = F.findIndex(f => f.phase !== 'approach');
  const approachS = firstTurn > 0 ? +((F[firstTurn].t - F[0].t) / 1000).toFixed(2) : 0;

  // travelling down
  const aheadDown: number[] = [], solvedDown: number[] = [];
  let solvedInView = 0, nextInView = 0, nextFrames = 0, nearer = 0, farther = 0;
  const turnRates: number[] = []; let turned = 0;
  for (let i = 0; i < F.length; i++) {
    const f = F[i], cur = path[at[i]], next = path[at[i] + 1];
    if (cur && next) {
      const a = fromDown(f.m, cur, next, w, h); if (a !== null) aheadDown.push(a);
      const pn = project(f.m, next, w, h); nextFrames++; if (pn?.inside) nextInView++;
    }
    if (cur && len(sub(cur, solved)) > 1e-6) { const a = fromDown(f.m, cur, solved, w, h); if (a !== null) solvedDown.push(a); }
    if (project(f.m, solved, w, h)?.inside) solvedInView++;
    if (i > 0) {
      const d0 = len(sub(F[i - 1].cam, solved)), d1 = len(sub(f.cam, solved)), moved = len(sub(f.cam, F[i - 1].cam));
      if (moved > 1e-4) { if (d1 < d0) nearer += moved; else farther += moved; }
      const dt = (f.t - F[i - 1].t) / 1000, turn = angle(sub(F[i - 1].tgt, F[i - 1].cam), sub(f.tgt, f.cam));
      if (dt > 0 && f.drawn) turnRates.push(turn / dt);
      turned += turn;
    }
  }
  const net = F.length > 1 ? angle(sub(F[0].tgt, F[0].cam), sub(F[F.length - 1].tgt, F[F.length - 1].cam)) : 0;
  const within45 = aheadDown.filter(a => a <= 45).length, p95turn = quantile(turnRates, 0.95);
  const parts = {
    aheadDown: aheadDown.length ? within45 / aheadDown.length : 0,
    nearer: nearer + farther ? nearer / (nearer + farther) : 0,
    solvedInView: F.length ? solvedInView / F.length : 0,
    steady: p95turn <= 60 ? 1 : 60 / p95turn,
  };
  return {
    states: path.length, approachS, timing,
    down: {
      aheadMedianDeg: Math.round(median(aheadDown)), aheadWithin45Pct: pct(within45, aheadDown.length),
      solvedMedianDeg: Math.round(median(solvedDown)), solvedWithin45Pct: pct(solvedDown.filter(a => a <= 45).length, solvedDown.length),
      nearerPct: pct(nearer, nearer + farther),
      solvedInViewPct: pct(solvedInView, F.length), nextInViewPct: pct(nextInView, nextFrames),
      turnP95DegS: Math.round(p95turn), turnMaxDegS: Math.round(Math.max(0, ...turnRates)),
      turnedDeg: Math.round(turned), netTurnDeg: Math.round(net), wander: net > 1 ? +(turned / net).toFixed(1) : null,
      score: Math.round(25 * (parts.aheadDown + parts.nearer + parts.solvedInView + parts.steady)),
    },
  };
}

function report(rec: Recording, r: ReturnType<typeof analyse>, browserName: string): void {
  const d = r.down, row = (name: string, t: (typeof r.timing)[string]) =>
    `  ${name.padEnd(10)}${String(t.frames).padStart(7)}${t.seconds.toFixed(1).padStart(8)}${t.fps.toFixed(0).padStart(6)}${t.p95ms.toFixed(0).padStart(8)}${t.maxMs.toFixed(0).padStart(8)}${String(t.over33).padStart(8)}`;
  console.log(`\nSolve from "${SCRAMBLE}" (distance ${rec.startDepth}), ${LAYERS} layers, speed ${SPEED_NAMES[SPEED]}`);
  console.log(`${browserName}${HEADED ? ', headed' : ', headless'}; WebGL renderer: ${rec.renderer}`);
  if (/swiftshader|llvmpipe|software/i.test(rec.renderer)) console.log('  (software WebGL: the timings say little about a real GPU)');
  console.log(`\nSmoothness    frames  time s   fps  p95 ms  max ms  >33 ms`);
  console.log(row('approach', r.timing.approach));
  console.log(row('turns', r.timing.turn));
  console.log(row('flights', r.timing.flight));
  console.log(row('all', r.timing.all));
  console.log(`  approach took ${r.approachS} s before the first turn`);
  console.log(`\nTravelling down (descent score ${d.score}/100)`);
  console.log(`  way ahead down    ${d.aheadMedianDeg}° from straight down (median), ${d.aheadWithin45Pct}% of frames within 45°`);
  console.log(`  solved below      ${d.solvedMedianDeg}° from straight down (median), ${d.solvedWithin45Pct}% of frames within 45°`);
  console.log(`  nearer            ${d.nearerPct}% of the camera's movement brings it nearer the solved cube`);
  console.log(`  in view           solved cube ${d.solvedInViewPct}% of frames, next state ${d.nextInViewPct}%`);
  console.log(`  steadiness        turns ${d.turnP95DegS}°/s (95th percentile), ${d.turnMaxDegS}°/s at most; ${d.turnedDeg}° in all for a net ${d.netTurnDeg}°${d.wander ? ` (wander ${d.wander}×)` : ''}`);
}

// ---------- run ----------
const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' };
let server: ReturnType<typeof Bun.serve> | null = null;
let url = opt('url', '');
if (!url) {
  if (!existsSync(join(DIST, 'index.html'))) { console.error('No dist/: run `bun run build` first (or `bun run measure`).'); process.exit(1); }
  server = Bun.serve({
    port: 0,
    fetch(req) {
      let path = decodeURIComponent(new URL(req.url).pathname);
      if (path.endsWith('/')) path += 'index.html';
      const file = join(DIST, path);
      if (!file.startsWith(DIST) || !existsSync(file)) return new Response('not found', { status: 404 });
      return new Response(Bun.file(file), { headers: { 'content-type': types[extname(file)] ?? 'application/octet-stream' } });
    },
  });
  url = `http://localhost:${server.port}/`;
}
url += (url.includes('?') ? '&' : '?') + 'probe';

let browser: Browser | null = null;
try {
  browser = BROWSER === 'webkit'
    ? await webkit.launch({ headless: !HEADED })
    : await chromium.launch({ headless: !HEADED, args: SOFTWARE ? CHROMIUM_ARGS : [], env: chromiumEnv() });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  console.log(`Measuring ${url} in ${BROWSER}${SOFTWARE && BROWSER !== 'webkit' ? ' (software WebGL)' : ''}`);
  await prepare(page, url);
  console.log('  solving…');
  await page.evaluate(record);
  await page.waitForFunction(() => !!(window as unknown as { __measured?: unknown }).__measured, undefined, { timeout: 600_000, polling: 250 });
  const rec = await page.evaluate(() => (window as unknown as { __measured: Recording }).__measured);
  if (errors.length) console.warn('Page errors:\n  ' + errors.join('\n  '));
  const r = analyse(rec);
  report(rec, r, BROWSER);
  if (JSON_OUT) {
    writeFileSync(JSON_OUT, JSON.stringify({ when: new Date().toISOString(), url, browser: BROWSER, headed: HEADED, software: SOFTWARE, renderer: rec.renderer, scramble: SCRAMBLE, layers: LAYERS, speed: SPEED, startDepth: rec.startDepth, ...r }, null, 2) + '\n');
    console.log(`\nWrote ${JSON_OUT}`);
  }
} finally {
  await browser?.close();
  server?.stop(true);
}
