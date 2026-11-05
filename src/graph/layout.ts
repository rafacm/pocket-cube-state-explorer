// Force layout of the cube layers.
// Each layer lives on its own sphere. Nodes repel only inside their own layer, over a range set by
// that layer's spacing, so the work grows with the number of states rather than with their density.
// Links act as springs. Inner layers that have settled are frozen while the newest layers settle.
import type { Rng } from '../explorer/rng';
import type { GNode, Graph } from './graph';
import { layerSpacing } from './radii';

const KR = 0.12, DAMP = 0.6, LREST = 36, REP = 1.3;

/** Where a new state starts: on its own sphere, close to the state it came from. */
export function spawnPos(radii: readonly number[], halfTurns: boolean, rng: Rng, parent: GNode, depth: number): [number, number, number] {
  const R = radii[Math.min(depth, radii.length - 1)];
  let ux: number, uy: number, uz: number;
  const pr = Math.hypot(parent.x, parent.y, parent.z);
  if (pr < 1e-3) { const u = rng.next() * 2 - 1, th = rng.next() * Math.PI * 2, s = Math.sqrt(1 - u * u); ux = s * Math.cos(th); uy = u; uz = s * Math.sin(th); }
  else {
    const j = 2.4 * layerSpacing(radii, halfTurns, depth) / R;
    ux = parent.x / pr + (rng.next() - 0.5) * j; uy = parent.y / pr + (rng.next() - 0.5) * j; uz = parent.z / pr + (rng.next() - 0.5) * j;
  }
  const l = Math.hypot(ux, uy, uz) || 1;
  return [ux / l * R, uy / l * R, uz / l * R];
}

// flat spatial hash in typed arrays (a Map keyed by cell was the bottleneck); scratch space shared
// by all explorers on the page, used only inside one synchronous tick()
const HSIZE = 1 << 16, HMASK = HSIZE - 1;
const hStart = new Int32Array(HSIZE + 1), hCur = new Int32Array(HSIZE);
let hItems = new Int32Array(4096), hCell = new Int32Array(4096);
const hashCell = (cx: number, cy: number, cz: number) => (Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663) ^ Math.imul(cz, 83492791)) & HMASK;

/** One step of the layout at temperature a. */
export function tick(g: Graph, radii: readonly number[], halfTurns: boolean, rng: Rng, a: number): void {
  const d0 = Math.max(1, g.frozenBelow), layerNodes = g.layerNodes, edges = g.edges;
  for (let d = d0; d <= g.depthShown; d++) for (const n of layerNodes[d] || []) { n.fx = n.fy = n.fz = 0; }
  for (let d = d0; d <= g.depthShown; d++) {
    const L = layerNodes[d] || [], N = L.length; if (N < 2) continue;
    const cut = Math.min(60, Math.max(10, 2.2 * layerSpacing(radii, halfTurns, d))), cut2 = cut * cut, inv = 1 / cut;
    if (hItems.length < N) { hItems = new Int32Array(N * 2); hCell = new Int32Array(N * 2); }
    hStart.fill(0);
    for (let k = 0; k < N; k++) {
      const n = L[k];
      n.cx = Math.floor(n.x * inv); n.cy = Math.floor(n.y * inv); n.cz = Math.floor(n.z * inv);
      const c = hashCell(n.cx, n.cy, n.cz); hCell[k] = c; hStart[c + 1]++;
    }
    for (let c = 0; c < HSIZE; c++) hStart[c + 1] += hStart[c];
    hCur.set(hStart.subarray(0, HSIZE));
    for (let k = 0; k < N; k++) hItems[hCur[hCell[k]]++] = k;
    for (let k = 0; k < N; k++) {
      const n = L[k], cx = n.cx, cy = n.cy, cz = n.cz;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        const X = cx + dx, Y = cy + dy, Z = cz + dz, c = hashCell(X, Y, Z);
        for (let t = hStart[c], te = hStart[c + 1]; t < te; t++) {
          const j = hItems[t]; if (j <= k) continue;
          const m = L[j]; if (m.cx !== X || m.cy !== Y || m.cz !== Z) continue;
          let ex = n.x - m.x, ey = n.y - m.y, ez = n.z - m.z, d2 = ex * ex + ey * ey + ez * ez;
          if (d2 >= cut2) continue;
          if (d2 < 1e-4) { ex = rng.next() - 0.5; ey = rng.next() - 0.5; ez = rng.next() - 0.5; d2 = 0.1; }
          const dd = Math.sqrt(d2), f = REP * (1 - dd * inv) / dd;
          n.fx += ex * f; n.fy += ey * f; n.fz += ez * f; m.fx -= ex * f; m.fy -= ey * f; m.fz -= ez * f;
        }
      }
    }
  }
  for (let j = 0; j < edges.length; j++) {
    const e = edges[j], A = e.a, B = e.b;
    if (B.depth < d0) continue;
    const ex = B.x - A.x, ey = B.y - A.y, ez = B.z - A.z, d = Math.sqrt(ex * ex + ey * ey + ez * ez) || 1e-3;
    const rest = Math.max(LREST, radii[B.depth] - radii[A.depth]);
    const f = (e.tree ? 0.04 : 0.012) * (d - rest) / d;
    A.fx += ex * f; A.fy += ey * f; A.fz += ez * f; B.fx -= ex * f; B.fy -= ey * f; B.fz -= ez * f;
  }
  for (let d = d0; d <= g.depthShown; d++) for (const n of layerNodes[d] || []) {
    const r = Math.sqrt(n.x * n.x + n.y * n.y + n.z * n.z) || 1e-3;
    const fr = KR * (radii[n.depth] - r) / r;
    n.fx += n.x * fr; n.fy += n.y * fr; n.fz += n.z * fr;
    n.vx = (n.vx + n.fx * a) * DAMP; n.vy = (n.vy + n.fy * a) * DAMP; n.vz = (n.vz + n.fz * a) * DAMP;
    const sp = Math.hypot(n.vx, n.vy, n.vz); if (sp > 9) { const s = 9 / sp; n.vx *= s; n.vy *= s; n.vz *= s; }
    n.x += n.vx; n.y += n.vy; n.z += n.vz;
  }
}
