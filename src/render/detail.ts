// Zooming in: nearby dots are drawn as real cubes, with their links and turn labels.
// Each finished dot layer gets a grid index. A dot becomes a cube when its cube would be at least
// MIN_PX pixels on screen; the nearest DETAIL_CAP of those are drawn, the nearest EDGE_CUBES get their
// links, and the nearest LABEL_CUBES that are big enough on screen get turn labels.
import * as THREE from 'three';
import { applyCode, decodeStickersInto, type Move } from '../model';
import { activeMoves, fmt, fullMax, maxDepth } from '../explorer/settings';
import type { DotHover, Explorer } from '../explorer/types';
import { FAR } from '../graph/distances';
import { cubeSizeOf } from '../outer/dots';
import { parentOf, posOfCode } from '../explorer/locate';
import { packStickers } from './cube-shader';
import { focalPx } from './scene';

const MIN_PX = 7, DETAIL_CAP = 20000, EDGE_CUBES = 2500, LABEL_CUBES = 40;
/** Turn labels need a cube at least this big on screen. */
export const LABEL_MIN_PX = 16;
const DE_CAP = EDGE_CUBES * 9;

export interface LayerIndex { start: Int32Array; items: Int32Array; gn: number; goff: number; cs: number; g: (v: number) => number }
export interface DetailLabel { x: number; y: number; z: number; mv: Move }

export interface Detail {
  mesh: THREE.InstancedMesh;
  stick: Float32Array; stickAttr: THREE.InstancedBufferAttribute;
  idx: Int32Array; dist: Float32Array;
  deGeo: THREE.BufferGeometry; dePos: Float32Array; deCol: Float32Array;
  dePosAttr: THREE.BufferAttribute; deColAttr: THREE.BufferAttribute;
  /** cubes drawn */
  n: number;
  dirty: boolean;
  at: number;
  labels: DetailLabel[];
  lastCam: Float32Array;
}

// candidates of one update (scratch space, shared by all explorers on the page)
const candI = new Int32Array(300000), candD = new Float32Array(300000), stk = new Uint8Array(24);

export function createDetail(scene: THREE.Scene, nodeMat: THREE.Material): Detail {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const stick = new Float32Array(DETAIL_CAP * 4), stickAttr = new THREE.InstancedBufferAttribute(stick, 4);
  geo.setAttribute('aStick', stickAttr);
  const mesh = new THREE.InstancedMesh(geo, nodeMat, DETAIL_CAP);
  mesh.count = 0; mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);
  // links of the nearest cubes
  const dePos = new Float32Array(DE_CAP * 6), deCol = new Float32Array(DE_CAP * 6);
  const deGeo = new THREE.BufferGeometry();
  const dePosAttr = new THREE.BufferAttribute(dePos, 3).setUsage(THREE.DynamicDrawUsage), deColAttr = new THREE.BufferAttribute(deCol, 3).setUsage(THREE.DynamicDrawUsage);
  deGeo.setAttribute('position', dePosAttr); deGeo.setAttribute('color', deColAttr); deGeo.setDrawRange(0, 0);
  const deMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false });
  const deLines = new THREE.LineSegments(deGeo, deMat); deLines.frustumCulled = false; scene.add(deLines);
  return {
    mesh, stick, stickAttr, idx: new Int32Array(DETAIL_CAP), dist: new Float32Array(DETAIL_CAP),
    deGeo, dePos, deCol, dePosAttr, deColAttr, n: 0, dirty: false, at: 0, labels: [], lastCam: new Float32Array(16),
  };
}

export function clearDetail(x: Explorer): void {
  const t = x.detail;
  t.mesh.count = 0; t.n = 0; t.labels = []; t.deGeo.setDrawRange(0, 0);
}

/** A grid index for finished dot layer d, sized to its sphere (radii are known only once a layer is arranged). */
export function buildLayerIndex(x: Explorer, d: number): void {
  const D = x.dots!, n = D.cnt[d], o = D.off[d], P = D.pos;
  const gn = 64, goff = x.radii[d] + 50, cs = 2 * goff / gn, NC = gn * gn * gn;
  const g = (v: number) => Math.min(gn - 1, Math.max(0, Math.floor((v + goff) / cs)));
  const start = new Int32Array(NC + 1), items = new Int32Array(n), cell = new Int32Array(n);
  for (let k = 0; k < n; k++) { const i = o + k, c = (g(P[i * 3]) * gn + g(P[i * 3 + 1])) * gn + g(P[i * 3 + 2]); cell[k] = c; start[c + 1]++; }
  for (let c = 0; c < NC; c++) start[c + 1] += start[c];
  const cur = start.slice(0, NC);
  for (let k = 0; k < n; k++) items[cur[cell[k]]++] = o + k;
  D.index[d] = { start, items, gn, goff, cs, g };
  x.detail.dirty = true;
}

/** Turns the dots near the camera into cubes (when the camera moved, at most every 120 ms). */
export function updateDetail(x: Explorer, now: number): void {
  const t = x.detail, D = x.dots, gs = x.gs, cam = gs.cam;
  if (!D) { if (t.mesh.count) clearDetail(x); return; }
  cam.updateMatrixWorld();
  const mw = cam.matrixWorld.elements; let moved = false;
  for (let i = 0; i < 16; i++) if (Math.abs(mw[i] - t.lastCam[i]) > 1e-4) { moved = true; break; }
  if (!moved && !t.dirty) return;
  if (now - t.at < 120) return;
  t.at = now; t.dirty = false; t.lastCam.set(mw);
  const w = x.el.graph.clientWidth, h = x.el.graph.clientHeight; if (!w || !h) return;
  gs.pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  const e = gs.pm.elements, focal = focalPx(cam, h), P = D.pos;
  const cx = cam.position.x, cy = cam.position.y, cz = cam.position.z;
  let nc = 0;
  for (let d = fullMax(x.halfTurns) + 1; d <= maxDepth(x.halfTurns); d++) {
    const ix = D.index[d]; if (!ix) continue;
    const rq = cubeSizeOf() * focal / MIN_PX, rq2 = rq * rq, G = ix.goff, gc = ix.g, gn = ix.gn;
    // skip layers whose sphere is nowhere near the camera
    const cr = Math.sqrt(cx * cx + cy * cy + cz * cz); if (Math.abs(cr - x.radii[d]) > rq) continue;
    if (cx - rq > G || cx + rq < -G || cy - rq > G || cy + rq < -G || cz - rq > G || cz + rq < -G) continue;
    const x0 = gc(cx - rq), x1 = gc(cx + rq), y0 = gc(cy - rq), y1 = gc(cy + rq), z0 = gc(cz - rq), z1 = gc(cz + rq);
    for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) {
      const base = (gx * gn + gy) * gn;
      for (let q = ix.start[base + z0], te = ix.start[base + z1 + 1]; q < te; q++) {
        const i = ix.items[q], px = P[i * 3], py = P[i * 3 + 1], pz = P[i * 3 + 2];
        const dx = px - cx, dy = py - cy, dz = pz - cz, d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > rq2) continue;
        const cw = e[3] * px + e[7] * py + e[11] * pz + e[15]; if (cw <= 0.5) continue;
        const X = (e[0] * px + e[4] * py + e[8] * pz + e[12]) / cw; if (X < -1.05 || X > 1.05) continue;
        const Y = (e[1] * px + e[5] * py + e[9] * pz + e[13]) / cw; if (Y < -1.05 || Y > 1.05) continue;
        candI[nc] = i; candD[nc] = d2; nc++;
        if (nc >= candI.length) break;
      }
      if (nc >= candI.length) break;
    }
  }
  let limit = Infinity;
  if (nc > DETAIL_CAP) limit = candD.slice(0, nc).sort()[DETAIL_CAP - 1];
  let m = 0;
  const DM = t.mesh.instanceMatrix.array as Float32Array;
  for (let c = 0; c < nc && m < DETAIL_CAP; c++) {
    if (candD[c] > limit) continue;
    const i = candI[c], s = cubeSizeOf(), o = m * 16;
    DM.fill(0, o, o + 16); DM[o] = s; DM[o + 5] = s; DM[o + 10] = s; DM[o + 15] = 1;
    DM[o + 12] = P[i * 3]; DM[o + 13] = P[i * 3 + 1]; DM[o + 14] = P[i * 3 + 2];
    decodeStickersInto(D.codes[i], stk);
    packStickers(k => stk[k], t.stick, m);
    t.idx[m] = i; t.dist[m] = candD[c]; m++; x.renderDirty = true;
  }
  t.n = m; t.mesh.count = m;
  t.mesh.instanceMatrix.updateRange.offset = 0; t.mesh.instanceMatrix.updateRange.count = Math.max(16, m * 16);
  t.mesh.instanceMatrix.needsUpdate = true;
  t.stickAttr.updateRange.offset = 0; t.stickAttr.updateRange.count = Math.max(4, m * 4);
  t.stickAttr.needsUpdate = true;
  buildDetailLinks(x, e, focal);
  x.el.statDetail.textContent = m ? fmt(m) + (m >= DETAIL_CAP ? '+' : '') + ' dots shown as cubes' : 'Zoom in to see dots as cubes';
}

function buildDetailLinks(x: Explorer, e: ArrayLike<number>, focal: number): void {
  const t = x.detail, D = x.dots!, STAGE = x.theme.stage;
  t.labels = [];
  const order = Array.from({ length: t.n }, (_, j) => j).sort((a, b) => t.dist[a] - t.dist[b]);
  const nE = Math.min(EDGE_CUBES, t.n), P = D.pos, mark = D.mark, mv = activeMoves(x.halfTurns);
  for (let q = 0; q < nE; q++) mark[t.idx[order[q]]] = 1;
  let s = 0;
  for (let q = 0; q < nE; q++) {
    const i = t.idx[order[q]], c = D.codes[i], d = D.layerOf[i];
    const px = P[i * 3], py = P[i * 3 + 1], pz = P[i * 3 + 2], size = cubeSizeOf();
    const pred = D.parent[i];
    const cw = e[3] * px + e[7] * py + e[11] * pz + e[15], spx = size * focal / Math.max(0.5, cw);
    const label = q < LABEL_CUBES && spx >= LABEL_MIN_PX;
    for (const mvv of mv) {
      const n = applyCode(c, mvv.idx), dn = D.dist[n];
      if (dn === FAR || dn > x.graph.depthShown) continue;
      const b = posOfCode(x, n); if (!b) continue;
      const tree = dn === d - 1 ? n === pred : dn === d + 1 ? parentOf(x, n) === c : false;
      if (x.view === 'tree' && !tree) continue;
      if (x.view === 'extra' && tree) continue;
      if (label) {
        const vx = b.x - px, vy = b.y - py, vz = b.z - pz, l = Math.hypot(vx, vy, vz) || 1, f = size * 1.7 / l;
        t.labels.push({ x: px + vx * f, y: py + vy * f, z: pz + vz * f, mv: mvv });
      }
      if (b.j != null && b.j < i && mark[b.j]) continue;     // drawn from the other end
      if (s >= DE_CAP) continue;
      const col = x.theme.edge[mvv.face], k = tree ? 1 : 0.55, o = s * 6, dePos = t.dePos, deCol = t.deCol;
      dePos[o] = px; dePos[o + 1] = py; dePos[o + 2] = pz; dePos[o + 3] = b.x; dePos[o + 4] = b.y; dePos[o + 5] = b.z;
      deCol[o] = deCol[o + 3] = col.r * k + (1 - k) * STAGE.r; deCol[o + 1] = deCol[o + 4] = col.g * k + (1 - k) * STAGE.g; deCol[o + 2] = deCol[o + 5] = col.b * k + (1 - k) * STAGE.b;
      s++;
    }
  }
  for (let q = 0; q < nE; q++) mark[t.idx[order[q]]] = 0;
  t.dePosAttr.updateRange.offset = 0; t.dePosAttr.updateRange.count = Math.max(6, s * 6); t.dePosAttr.needsUpdate = true;
  t.deColAttr.updateRange.offset = 0; t.deColAttr.updateRange.count = Math.max(6, s * 6); t.deColAttr.needsUpdate = true;
  t.deGeo.setDrawRange(0, s * 2);
}

/** The dot drawn as a cube under the pointer (its dot index), or -1. */
export function pickDetail(x: Explorer): number {
  const t = x.detail, D = x.dots, gs = x.gs, cam = gs.cam;
  if (!t.n || !D) return -1;
  const w = x.el.graph.clientWidth, h = x.el.graph.clientHeight, { mx, my } = x.pointer;
  cam.updateMatrixWorld(); gs.pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  const e = gs.pm.elements, focal = focalPx(cam, h), P = D.pos;
  let best = -1, bestW = Infinity;
  for (let m = 0; m < t.n; m++) {
    const i = t.idx[m], px = P[i * 3], py = P[i * 3 + 1], pz = P[i * 3 + 2];
    const cw = e[3] * px + e[7] * py + e[11] * pz + e[15]; if (cw <= 0.5 || cw >= bestW) continue;
    const sx = ((e[0] * px + e[4] * py + e[8] * pz + e[12]) / cw + 1) / 2 * w, sy = (1 - (e[1] * px + e[5] * py + e[9] * pz + e[13]) / cw) / 2 * h;
    const r = Math.max(5, cubeSizeOf() * 0.75 * focal / cw), dx = sx - mx, dy = sy - my;
    if (dx * dx + dy * dy <= r * r) { best = i; bestW = cw; }
  }
  return best;
}

export function dotHover(x: Explorer, i: number): DotHover {
  const D = x.dots!, P = D.pos;
  return { x: P[i * 3], y: P[i * 3 + 1], z: P[i * 3 + 2], size: cubeSizeOf(), depth: D.layerOf[i], code: D.codes[i], dotIdx: i };
}
