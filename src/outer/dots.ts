// The outer layers: every state as a dot.
// Each state is a number (see encodeKey). One byte per state holds its distance from solved. A dot layer
// is built in steps, a slice per frame: find its states, arrange them on the layer's sphere (each state
// near the state it was reached from, as far as even spacing allows), then reveal them.
import * as THREE from 'three';
import { NORI, NPERM, NSTATE, OT, PT, encodeKey, ensureTables } from '../model';
import { activeMoves, fmt, fullMax, maxDepth, totals } from '../explorer/settings';
import { DOT_SPACING, fitDistance } from '../graph/radii';
import type { Explorer } from '../explorer/types';
import { showBusy } from '../ui/status';
import { refreshUI } from '../ui/panel';
import { FAR } from '../graph/distances';
import { FDIR, FUV, evenOut, faceDir, faceUV } from './placement';
import { paintLayer } from './colors';
import { buildBundles, clearBundles } from './bundles';
import { buildLayerIndex, clearDetail, type LayerIndex } from '../render/detail';

export interface DotLayer {
  pts: THREE.Points; g: THREE.BufferGeometry;
  attr: THREE.BufferAttribute; cattr: THREE.BufferAttribute;
  mat: THREE.PointsMaterial;
  uploaded: number;
}

export interface Dots {
  /** distance from solved of every state number (FAR = not reached) */
  dist: Uint8Array;
  /** state number -> dot index (>= 0), cube-layer node (-2 - node index), or -1 */
  map: Int32Array;
  // per dot, outer layers one after another (layer d starts at off[d])
  codes: Int32Array; parent: Int32Array; pos: Float32Array;
  /** routes in: neighbours in the layer inside */
  pin: Uint8Array;
  col: Uint8Array; patch: Uint16Array; layerOf: Uint8Array; mark: Uint8Array;
  off: number[]; cnt: number[];
  layers: (DotLayer | undefined)[];
  /** links between finished dot layers, and inside them (half turns) */
  edges: number; same: number;
  /** routes-in histogram per layer */
  hist: number[][];
  bundles: boolean[];
  index: (LayerIndex | undefined)[];
}

interface Placement { C: number; dl: number; U: Float32Array; V: Float32Array; start: Int32Array; items: Int32Array; c: number; NC: number }

export interface Job {
  d: number; nd: number; k: number; len: number;
  phase: 'search' | 'count' | 'even' | 'cells' | 'place' | 'relax' | 'reveal';
  t0: number; lastUi: number;
  want: Float32Array | null;
  edges: number; same: number; shown: number;
  targetMs: number;
  pl: Placement | null;
  act: Int32Array | null; isAct: Uint8Array | null; nAct: number;
  it: number; rk: number; r0: number;
  colored: boolean; done: boolean;
}

let dotTex: THREE.CanvasTexture | null = null;
function dotTexture(): THREE.CanvasTexture {
  if (dotTex) return dotTex;
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.beginPath(); g.arc(16, 16, 14, 0, Math.PI * 2); g.fill();
  return (dotTex = new THREE.CanvasTexture(c));
}
/** Dots keep a fixed size on screen; the large layers form a dense shell, the last layers stay visible. */
export function dotPx(x: Explorer, d: number): number { const n = totals(x.halfTurns)[d]; return n > 500000 ? 1.6 : n > 100000 ? 2 : n > 10000 ? 2.6 : n > 1000 ? 3.6 : 6; }
/** Size of the cube a dot becomes up close. */
export const cubeSizeOf = (): number => 0.4 * DOT_SPACING;

function initDots(x: Explorer): Dots {
  ensureTables();
  const tot = totals(x.halfTurns), F = fullMax(x.halfTurns), M = maxDepth(x.halfTurns);
  let cap = 0; for (let d = F + 1; d <= M; d++) cap += tot[d];
  const dots: Dots = {
    dist: new Uint8Array(NSTATE).fill(FAR), map: new Int32Array(NSTATE).fill(-1),
    codes: new Int32Array(cap), parent: new Int32Array(cap), pos: new Float32Array(cap * 3), off: [], cnt: [], layers: [], edges: 0, same: 0,
    pin: new Uint8Array(cap), col: new Uint8Array(cap * 3), patch: new Uint16Array(cap), hist: [], bundles: [],
    layerOf: new Uint8Array(cap), mark: new Uint8Array(cap), index: [],
  };
  for (const n of x.graph.nodes) { const c = encodeKey(n.key); n.code = c; dots.dist[c] = n.depth; dots.map[c] = -2 - n.i; }
  let o = 0; for (let d = F + 1; d <= M; d++) { dots.off[d] = o; dots.cnt[d] = 0; o += tot[d]; }
  for (let d = F + 1; d <= M; d++) dots.layerOf.fill(d, dots.off[d], dots.off[d] + tot[d]);
  return dots;
}

/** Starts building the next layer as dots. */
export function startDotLayer(x: Explorer): void {
  const D = x.dots ?? (x.dots = initDots(x));
  const d = x.graph.depthShown, nd = d + 1, tot = totals(x.halfTurns)[nd];
  const g = new THREE.BufferGeometry();
  const attr = new THREE.BufferAttribute(D.pos.subarray(D.off[nd] * 3, (D.off[nd] + tot) * 3), 3).setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('position', attr); g.setDrawRange(0, 0);
  const cattr = new THREE.BufferAttribute(D.col.subarray(D.off[nd] * 3, (D.off[nd] + tot) * 3), 3, true);
  g.setAttribute('color', cattr);
  const mat = new THREE.PointsMaterial({ size: dotPx(x, nd), sizeAttenuation: false, vertexColors: true, map: dotTexture(), transparent: true, alphaTest: 0.4, opacity: 0.85, depthWrite: false });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; x.gs.scene.add(pts);
  D.layers[nd] = { pts, g, attr, cattr, mat, uploaded: 0 };
  const len = d <= fullMax(x.halfTurns) ? (x.graph.layerNodes[d] || []).length : D.cnt[d];
  x.job = {
    d, nd, k: 0, len, phase: 'search', t0: performance.now(), lastUi: 0, want: new Float32Array(tot * 3), edges: 0, same: 0, shown: 0,
    targetMs: 1000 * Math.min(6, Math.max(1.5, 0.9 * Math.log10(tot))),
    pl: null, act: null, isAct: null, nAct: 0, it: 0, rk: -1, r0: 0, colored: false, done: false,
  };
  x.cam.fitDist = fitDistance(x.radii, nd);
}

// relaxing crowded patches: a spatial hash with cells twice RELAX_D wide (scratch space shared by all
// explorers on the page; a job step never yields in the middle of using it)
const RELAX_D = 7.2, RELAX_CS = 2 * RELAX_D, RELAX_ROUNDS = 4, RHS = 1 << 20;
const relaxStart = new Int32Array(RHS + 1), relaxCur = new Int32Array(RHS);
let relaxCell = new Int32Array(0), relaxItems = new Int32Array(0);
const rHash = (a: number, b: number, c: number) => (Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ Math.imul(c, 83492791)) & (RHS - 1);
/** Only the first dot layer is evened out (evening out every layer pushed states far from their parents). */
const EVEN_LAYERS: 'first' | 'all' = 'first';

/** Runs the current job for about `budget` ms. */
export function runJob(x: Explorer, budget: number, now: number): void {
  const D = x.dots!, job = x.job!, d = job.nd - 1, nd = job.nd, mv = activeMoves(x.halfTurns).map(m => m.idx), nm = mv.length;
  const off = D.off[nd], R = x.radii[nd], jit = 1.2 * DOT_SPACING / R, rng = x.rng;
  const dist = D.dist, codes = D.codes, pos = D.pos, map = D.map;
  const t0 = performance.now();
  if (job.phase === 'search') {
    const fromNodes = d <= fullMax(x.halfTurns), L = x.graph.layerNodes[d], src = fromNodes ? 0 : D.off[d], want = job.want!;
    let k = job.k, cnt = D.cnt[nd], edges = 0, same = 0;
    while (k < job.len) {
      let c: number, px: number, py: number, pz: number;
      if (fromNodes) { const n = L[k]; c = n.code; px = n.x; py = n.y; pz = n.z; }
      else { const i = src + k; c = codes[i]; px = pos[i * 3]; py = pos[i * 3 + 1]; pz = pos[i * 3 + 2]; }
      const pr = Math.sqrt(px * px + py * py + pz * pz) || 1;
      const p = (c / NORI) | 0, o = c - p * NORI;
      for (let t = 0; t < nm; t++) {
        const m = mv[t], nc = PT[m * NPERM + p] * NORI + OT[m * NORI + o], dn = dist[nc];
        if (dn === FAR) {
          dist[nc] = nd; const di = off + cnt; codes[di] = nc; map[nc] = di; D.parent[di] = c; D.pin[di] = 1;
          want[cnt * 3] = px / pr + (rng.next() - 0.5) * jit; want[cnt * 3 + 1] = py / pr + (rng.next() - 0.5) * jit; want[cnt * 3 + 2] = pz / pr + (rng.next() - 0.5) * jit;
          cnt++; edges++;
        } else if (dn === nd) { edges++; D.pin[map[nc]]++; }
        else if (dn === d && !fromNodes) same++;
      }
      k++;
      if ((k & 1023) === 0 && performance.now() - t0 > budget) break;
    }
    D.cnt[nd] = cnt; job.edges += edges; job.same += same; job.k = k;
    if (k >= job.len) {
      // the last layer has no layer beyond it, so count the links inside it here
      if (nd === maxDepth(x.halfTurns) && x.halfTurns) { job.phase = 'count'; job.k = 0; job.len = cnt; }
      else job.phase = 'even';
    }
    return;
  }
  if (job.phase === 'count') {
    let k = job.k, same = 0;
    while (k < job.len) {
      const c = codes[off + k], p = (c / NORI) | 0, o = c - p * NORI;
      for (let t = 0; t < nm; t++) { const m = mv[t]; if (dist[PT[m * NPERM + p] * NORI + OT[m * NORI + o]] === nd) same++; }
      k++;
      if ((k & 1023) === 0 && performance.now() - t0 > budget) break;
    }
    job.same += same; job.k = k;
    if (k >= job.len) job.phase = 'even';
    return;
  }
  const N = D.cnt[nd];
  if (job.phase === 'even') {
    if (EVEN_LAYERS === 'all' || nd === fullMax(x.halfTurns) + 1) evenOut(job.want!, N);
    job.phase = 'cells';
    return;
  }
  if (job.phase === 'cells') {
    // which patch each state wants
    const C = Math.max(8, Math.min(96, Math.round(Math.sqrt(N / 240)))), dl = 2 / C, NC = 6 * C * C;
    const U = new Float32Array(N), V = new Float32Array(N), cellOf = new Int32Array(N), start = new Int32Array(NC + 1);
    const want = job.want!;
    for (let j = 0; j < N; j++) {
      faceUV(want[j * 3], want[j * 3 + 1], want[j * 3 + 2]);
      const iu = Math.min(C - 1, Math.max(0, Math.floor((FUV[1] + 1) / dl))), iv = Math.min(C - 1, Math.max(0, Math.floor((FUV[2] + 1) / dl)));
      const c = (FUV[0] * C + iu) * C + iv;
      U[j] = FUV[1]; V[j] = FUV[2]; cellOf[j] = c; start[c + 1]++;
    }
    for (let c = 0; c < NC; c++) start[c + 1] += start[c];
    const cur = start.slice(0, NC), items = new Int32Array(N);
    for (let j = 0; j < N; j++) items[cur[cellOf[j]]++] = j;
    // the sphere radius: the most crowded patch, at its most squeezed corner, still keeps DOT_SPACING
    let minS = Infinity;
    for (let c = 0; c < NC; c++) {
      const n = start[c + 1] - start[c]; if (!n) continue;
      const iu = Math.floor(c / C) % C, iv = c % C, k = Math.ceil(Math.sqrt(n));
      const cu = Math.max(Math.abs(-1 + iu * dl), Math.abs(-1 + (iu + 1) * dl)), cv = Math.max(Math.abs(-1 + iv * dl), Math.abs(-1 + (iv + 1) * dl));
      const scale = Math.min(Math.sqrt(1 + cu * cu), Math.sqrt(1 + cv * cv)) / (1 + cu * cu + cv * cv);
      minS = Math.min(minS, dl / k * scale);
    }
    const radii = x.radii;
    radii[nd] = Math.max(radii[nd - 1] * 1.25, DOT_SPACING / minS);
    for (let d2 = nd + 1; d2 < radii.length; d2++) radii[d2] = Math.max(radii[d2], radii[d2 - 1] * 1.25);
    x.cam.fitDist = fitDistance(radii, nd);
    job.want = null;
    job.pl = { C, dl, U, V, start, items, c: 0, NC };
    job.act = new Int32Array(N); job.isAct = new Uint8Array(N); job.nAct = 0;
    job.phase = 'place';
    return;
  }
  if (job.phase === 'place') {
    // lay out each patch: rows by v, then columns by u
    const { C, dl, U, V, start, items, NC } = job.pl!, R2 = x.radii[nd], act = job.act!, isAct = job.isAct!;
    let c = job.pl!.c;
    while (c < NC) {
      const s0 = start[c], n = start[c + 1] - s0;
      if (n) {
        const f = Math.floor(c / (C * C)), iu = Math.floor(c / C) % C, iv = c % C, u0 = -1 + iu * dl, v0 = -1 + iv * dl;
        const k = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / k);
        // spacing of this patch's grid on the sphere, at its most squeezed corner
        const cu = Math.max(Math.abs(u0), Math.abs(u0 + dl)), cv = Math.max(Math.abs(v0), Math.abs(v0 + dl));
        const scale = Math.min(Math.sqrt(1 + cu * cu), Math.sqrt(1 + cv * cv)) / (1 + cu * cu + cv * cv);
        const sv = R2 * dl / rows * scale;
        const arr = Array.from(items.subarray(s0, s0 + n)).sort((a, b) => V[a] - V[b]);
        for (let r = 0; r < rows; r++) {
          const row = arr.slice(r * k, Math.min(n, r * k + k)).sort((a, b) => U[a] - U[b]), m = row.length;
          const su = R2 * dl / m * scale, crowded = Math.min(su, sv) < 2.2 * RELAX_D;
          // scatter within each grid spot: freely where the patch is crowded (relaxed below), elsewhere
          // only as far as keeps neighbours RELAX_D apart, so no relaxing is needed there
          const ju = crowded ? 0.45 : Math.min(0.45, 0.5 * (1 - RELAX_D / su)), jv = crowded ? 0.45 : Math.min(0.45, 0.5 * (1 - RELAX_D / sv));
          const v = v0 + (r + 0.5) * dl / rows;
          for (let q = 0; q < m; q++) {
            faceDir(f, u0 + (q + 0.5 + (rng.next() - 0.5) * 2 * ju) * dl / m, v + (rng.next() - 0.5) * 2 * jv * dl / rows);
            const i = (off + row[q]) * 3;
            pos[i] = FDIR[0] * R2; pos[i + 1] = FDIR[1] * R2; pos[i + 2] = FDIR[2] * R2;
            if (crowded) { act[job.nAct++] = row[q]; isAct[row[q]] = 1; }
          }
        }
      }
      c++;
      if ((c & 255) === 0 && performance.now() - t0 > budget) break;
    }
    job.pl!.c = c;
    if (c >= NC) { job.pl = null; job.phase = 'relax'; job.it = 0; job.rk = -1; }
    return;
  }
  if (job.phase === 'relax') {
    // Organic spacing: like the cube layers' layout, close neighbours push each other apart.
    // Each round: hash the layer into cells, then move every pair closer than RELAX_D apart by half
    // the gap each, then put the states back on the sphere.
    const R2 = x.radii[nd], base = off * 3;
    if (job.rk < 0) {
      if (relaxCell.length < N) { relaxCell = new Int32Array(N * 1.2 | 0); relaxItems = new Int32Array(N * 1.2 | 0); }
      relaxStart.fill(0);
      for (let j = 0; j < N; j++) {
        const i = base + j * 3;
        const h = rHash(Math.floor(pos[i] / RELAX_CS), Math.floor(pos[i + 1] / RELAX_CS), Math.floor(pos[i + 2] / RELAX_CS));
        relaxCell[j] = h; relaxStart[h + 1]++;
      }
      for (let h = 0; h < RHS; h++) relaxStart[h + 1] += relaxStart[h];
      relaxCur.set(relaxStart.subarray(0, RHS));
      for (let j = 0; j < N; j++) relaxItems[relaxCur[relaxCell[j]]++] = j;
      job.rk = 0;
      return;
    }
    let a = job.rk;
    const D2 = RELAX_D * RELAX_D, act = job.act!, isAct = job.isAct!, NA = job.nAct;
    while (a < NA) {
      const j = act[a], i = base + j * 3, px = pos[i], py = pos[i + 1], pz = pos[i + 2];
      // cells are twice RELAX_D wide, so any neighbour closer than RELAX_D is in one of 8 cells
      const fx = px / RELAX_CS, fy = py / RELAX_CS, fz = pz / RELAX_CS, X = Math.floor(fx), Y = Math.floor(fy), Z = Math.floor(fz);
      const ox = fx - X < 0.5 ? -1 : 1, oy = fy - Y < 0.5 ? -1 : 1, oz = fz - Z < 0.5 ? -1 : 1;
      for (let c8 = 0; c8 < 8; c8++) {
        const h = rHash(X + (c8 & 1 ? ox : 0), Y + (c8 & 2 ? oy : 0), Z + (c8 & 4 ? oz : 0));
        for (let t = relaxStart[h], te = relaxStart[h + 1]; t < te; t++) {
          const q = relaxItems[t]; if (q === j || (isAct[q] && q < j)) continue;
          const k3 = base + q * 3;
          let ex = pos[i] - pos[k3], ey = pos[i + 1] - pos[k3 + 1], ez = pos[i + 2] - pos[k3 + 2];
          const d2 = ex * ex + ey * ey + ez * ez;
          if (d2 >= D2) continue;
          let dd = Math.sqrt(d2);
          if (dd < 1e-3) { ex = rng.next() - 0.5; ey = rng.next() - 0.5; ez = rng.next() - 0.5; dd = Math.hypot(ex, ey, ez); }
          const push = (RELAX_D - dd) * 0.5 / dd;
          pos[i] += ex * push; pos[i + 1] += ey * push; pos[i + 2] += ez * push;
          pos[k3] -= ex * push; pos[k3 + 1] -= ey * push; pos[k3 + 2] -= ez * push;
        }
      }
      a++;
      if ((a & 4095) === 0 && performance.now() - t0 > budget) break;
    }
    job.rk = a;
    if (a >= NA) {
      for (let b = 0; b < NA; b++) {
        const i = base + act[b] * 3, l = R2 / (Math.hypot(pos[i], pos[i + 1], pos[i + 2]) || 1);
        pos[i] *= l; pos[i + 1] *= l; pos[i + 2] *= l;
      }
      job.it++; job.rk = -1;
      if (job.it >= RELAX_ROUNDS || NA === 0) { job.phase = 'reveal'; job.r0 = now; job.act = null; job.isAct = null; }
    }
    return;
  }
  if (job.phase === 'reveal') {
    if (!job.colored) { paintLayer(x, nd); job.colored = true; }
    const paced = x.el.optPace.checked;
    const f = paced ? Math.min(1, (now - job.r0) / job.targetMs) : 1;
    const shown = Math.min(N, Math.ceil(N * f));
    const Ly = D.layers[nd]!;
    if (shown > Ly.uploaded) {
      Ly.attr.updateRange.offset = Ly.uploaded * 3; Ly.attr.updateRange.count = (shown - Ly.uploaded) * 3;
      Ly.attr.needsUpdate = true; Ly.g.setDrawRange(0, shown); Ly.uploaded = shown;
    }
    job.shown = shown;
    if (shown >= N) job.done = true;
  }
}

/** The progress line while a layer is built. */
export function jobProgress(x: Explorer, now: number): void {
  const job = x.job!, D = x.dots!, tot = totals(x.halfTurns)[job.nd], L = 'Layer ' + job.nd + ' · ';
  if (job.phase === 'search' || job.phase === 'count') {
    showBusy(x, L + 'finding states · ' + fmt(D.cnt[job.nd]) + ' of ' + fmt(tot), 0.15 * D.cnt[job.nd] / tot); return;
  }
  if (job.phase !== 'reveal') {
    const f = job.phase === 'place' && job.pl ? 0.3 * job.pl.c / job.pl.NC : job.phase === 'relax' ? 0.3 + 0.7 * (job.it + Math.max(0, job.rk) / Math.max(1, job.nAct)) / RELAX_ROUNDS : 0;
    showBusy(x, L + 'arranging ' + fmt(tot) + ' states on the sphere', 0.15 + 0.1 * f); return;
  }
  const f = job.shown / tot, el = now - job.r0, eta = f > 0.02 ? el * (1 - f) / f : null;
  const left = eta == null ? 'estimating…' : eta < 1000 ? 'under a second left' : 'about ' + Math.ceil(eta / 1000) + ' s left';
  showBusy(x, L + fmt(job.shown) + ' of ' + fmt(tot) + '<br>' + left, 0.25 + 0.75 * f);
}

export function finishJob(x: Explorer, now: number): void {
  const D = x.dots!, job = x.job!, nd = job.nd;
  D.edges += job.edges; D.same += job.same;
  x.job = null;
  buildLayerIndex(x, nd);
  const h = new Array<number>(10).fill(0), o = D.off[nd];
  for (let k = 0; k < D.cnt[nd]; k++) h[Math.min(9, D.pin[o + k])]++;
  D.hist[nd] = h;
  buildBundles(x, nd);
  x.graph.depthShown = nd; x.growth.growing = false; x.growth.settledAt = now;
  refreshUI(x);
}

/** Removes all dot layers (Start over, or switching the metric). */
export function freeDots(x: Explorer): void {
  if (x.dots) for (const L of x.dots.layers) if (L) { x.gs.scene.remove(L.pts); L.g.dispose(); L.mat.dispose(); }
  clearBundles(x);
  x.dots = null; x.job = null; x.cam.flight = null;
  clearDetail(x);
  x.el.statDetail.textContent = '';
}

/** While a layer is being built, count only the states already revealed (and that share of its links). */
export function shownIn(x: Explorer, d: number): number { return x.job && x.job.nd === d ? x.job.shown : (x.dots && x.dots.cnt[d]) || 0; }
export function totalStates(x: Explorer): number {
  let n = x.graph.nodes.length;
  if (x.dots) for (let d = fullMax(x.halfTurns) + 1; d <= maxDepth(x.halfTurns); d++) n += shownIn(x, d);
  return n;
}
export function totalEdges(x: Explorer): number {
  const D = x.dots, job = x.job;
  return x.graph.edges.length + (D ? D.edges + D.same / 2 + (job ? (job.edges + job.same / 2) * job.shown / Math.max(1, D.cnt[job.nd]) : 0) : 0);
}
