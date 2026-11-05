// Turn labels: HTML elements projected onto the stage each frame.
// Plain link labels show only when both of a link's cubes are big enough on screen to read (zoomed in on
// them), longest links first and never on top of another label. Boxed, clickable labels show the turns
// of the state the user clicked.
import * as THREE from 'three';
import { applyCode, type Move } from '../model';
import { activeMoves } from '../explorer/settings';
import { edgeVisible, moveAlong, otherEnd, type Edge } from '../graph/graph';
import type { Explorer } from '../explorer/types';
import { boxesShown } from '../explorer/selection';
import { dotPoint, posOfCode } from '../explorer/locate';
import { busy } from '../cube/live-cube';
import { queueGraphMove } from '../cube/walks';
import { LABEL_MIN_PX } from './detail';
import { focalPx } from './scene';

const LABEL_MIN_LINK_PX = 46, LABEL_MAX = 220, LABEL_MIN_CUBE_PX = 14, LABEL_BOX_W = 30, LABEL_BOX_H = 18;

interface LabelEl extends HTMLDivElement { _mv: Move | null; _t?: string; _f?: number }

export interface Labels {
  /** the cube-layer links labelled at the moment */
  edges: Edge[];
  at: number;
  dirty: boolean;
  lastCam: Float32Array;
  pool: LabelEl[];
}

export const createLabels = (): Labels => ({ edges: [], at: 0, dirty: true, lastCam: new Float32Array(16), pool: [] });

/** Chooses which cube-layer links get a label (when the camera moved, at most every 150 ms). */
export function updateEdgeLabels(x: Explorer, now: number): void {
  const L = x.labels, gs = x.gs, cam = gs.cam;
  if (!x.labelAll) { L.edges = []; return; }
  const mw = cam.matrixWorld.elements; let moved = L.dirty || x.graph.alpha > 0.004;
  if (!moved) for (let i = 0; i < 16; i++) if (Math.abs(mw[i] - L.lastCam[i]) > 1e-4) { moved = true; break; }
  if (!moved || now - L.at < 150) return;
  L.at = now; L.dirty = false; L.lastCam.set(mw);
  const w = x.el.graph.clientWidth, h = x.el.graph.clientHeight; if (!w || !h) return;
  gs.pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  const e = gs.pm.elements, out: [number, Edge, number, number][] = [], focalL = focalPx(cam, h), edges = x.graph.edges;
  const sel = x.sel.node, boxes = boxesShown(x);
  for (let j = 0; j < edges.length; j++) {
    const ed = edges[j];
    if (!edgeVisible(x.view, ed)) continue;
    if (boxes && sel && (ed.a === sel || ed.b === sel)) continue;
    const A = ed.a, B = ed.b;
    const wa = e[3] * A.x + e[7] * A.y + e[11] * A.z + e[15], wb = e[3] * B.x + e[7] * B.y + e[11] * B.z + e[15];
    if (wa <= 0.5 || wb <= 0.5) continue;
    const ax = (e[0] * A.x + e[4] * A.y + e[8] * A.z + e[12]) / wa, ay = (e[1] * A.x + e[5] * A.y + e[9] * A.z + e[13]) / wa;
    const bx = (e[0] * B.x + e[4] * B.y + e[8] * B.z + e[12]) / wb, by = (e[1] * B.x + e[5] * B.y + e[9] * B.z + e[13]) / wb;
    const mxn = (ax + bx) / 2, myn = (ay + by) / 2; if (mxn < -1 || mxn > 1 || myn < -1 || myn > 1) continue;
    const len = Math.hypot((ax - bx) * w / 2, (ay - by) * h / 2); if (len < LABEL_MIN_LINK_PX) continue;
    const pxA = A.size * focalL / wa, pxB = B.size * focalL / wb;
    if (Math.min(pxA, pxB) < LABEL_MIN_CUBE_PX) continue;
    out.push([len, ed, (mxn + 1) / 2 * w, (1 - myn) / 2 * h]);
  }
  out.sort((p, q) => q[0] - p[0]);
  // greedy placement: skip any label whose box would overlap one already placed
  const taken = new Set<number>(), list: Edge[] = [];
  for (const [, ed, sx, sy] of out) {
    if (list.length >= LABEL_MAX) break;
    const c0 = Math.floor((sx - LABEL_BOX_W / 2) / LABEL_BOX_W), c1 = Math.floor((sx + LABEL_BOX_W / 2) / LABEL_BOX_W);
    const r0 = Math.floor((sy - LABEL_BOX_H / 2) / LABEL_BOX_H), r1 = Math.floor((sy + LABEL_BOX_H / 2) / LABEL_BOX_H);
    let free = true;
    for (let c = c0; c <= c1 && free; c++) for (let r = r0; r <= r1; r++) if (taken.has(c * 4096 + r)) { free = false; break; }
    if (!free) continue;
    for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) taken.add(c * 4096 + r);
    list.push(ed);
  }
  L.edges = list; x.renderDirty = true;
}

function getLabel(x: Explorer, i: number): LabelEl {
  const pool = x.labels.pool;
  while (pool.length <= i) {
    const d = document.createElement('div') as LabelEl; d.className = 'lab'; d.hidden = true; d._mv = null;
    d.addEventListener('click', () => { if (d._mv && !busy(x)) { x.sel.keepBox = true; queueGraphMove(x, d._mv); } });
    x.el.labels.appendChild(d); pool.push(d);
  }
  return pool[i];
}

const pv = new THREE.Vector3();
/** Positions the label elements for this frame. */
export function placeLabels(x: Explorer): void {
  const w = x.el.stage.clientWidth, h = x.el.stage.clientHeight, cam = x.gs.cam, sel = x.sel;
  let k = 0;
  const put = (px: number, py: number, pz: number, mv: Move, boxed: boolean) => {
    pv.set(px, py, pz).project(cam);
    if (pv.z > 1 || pv.z < -1) return;
    const sx = (pv.x + 1) / 2 * w, sy = (1 - pv.y) / 2 * h;
    if (sx < -30 || sx > w + 30 || sy < -30 || sy > h + 30) return;
    const d = getLabel(x, k++);
    if (d._t !== mv.name) { d.textContent = mv.name; d._t = mv.name; }
    if (d._f !== mv.face) { d.style.setProperty('--lc', x.theme.faceCss[mv.face]); d._f = mv.face; }
    const cls = boxed ? 'lab sel' : 'lab'; if (d.className !== cls) d.className = cls;
    d._mv = boxed ? mv : null;
    if (boxed) d.title = 'Turn ' + mv.name; else d.removeAttribute('title');
    d.style.transform = 'translate(' + sx.toFixed(1) + 'px,' + sy.toFixed(1) + 'px) translate(-50%,-50%)';
    d.hidden = false;
  };
  // the current state's turns (boxed, clickable): only when they are big enough on screen to read,
  // the same rule as the other labels, so they never clutter the view from far away
  const scr = (px: number, py: number, pz: number): [number, number] | null => { pv.set(px, py, pz).project(cam); return pv.z > 1 || pv.z < -1 ? null : [(pv.x + 1) / 2 * w, (1 - pv.y) / 2 * h]; };
  const boxes = boxesShown(x) && !x.cube.anim;
  const S = sel.node;
  if (boxes && S) {
    const A = scr(S.x, S.y, S.z);
    const rpx = S.size * 0.9 * focalPx(cam, h) / Math.max(1, Math.hypot(S.x - cam.position.x, S.y - cam.position.y, S.z - cam.position.z));
    for (const e of S.adj) {
      if (!edgeVisible(x.view, e)) continue;
      const o = otherEnd(e, S), B = scr(o.x, o.y, o.z);
      const len = A && B ? Math.hypot(A[0] - B[0], A[1] - B[1]) : 0;
      if (!A || !B || len < LABEL_MIN_LINK_PX) continue;
      // far enough along the link to clear the cube on screen, but not past the middle of the link
      const t = Math.min(0.5, Math.max(0.3, (rpx + 18) / len));
      put(S.x + (o.x - S.x) * t, S.y + (o.y - S.y) * t, S.z + (o.z - S.z) * t, moveAlong(e, S), true);
    }
  }
  if (boxes && sel.dot) {
    const P = dotPoint(x, sel.dot.code);
    const camDist = P ? Math.hypot(P.x - cam.position.x, P.y - cam.position.y, P.z - cam.position.z) : Infinity;
    if (P && P.size * focalPx(cam, h) / camDist >= LABEL_MIN_PX) for (const mvv of activeMoves(x.halfTurns)) {
      const n = applyCode(sel.dot.code, mvv.idx), b = posOfCode(x, n); if (!b) continue;
      const vx = b.x - P.x, vy = b.y - P.y, vz = b.z - P.z, l = Math.hypot(vx, vy, vz) || 1, t = P.size * 2.4 / l;
      put(P.x + vx * t, P.y + vy * t, P.z + vz * t, mvv, true);
    }
  }
  if (x.labelAll) for (const L of x.detail.labels) put(L.x, L.y, L.z, L.mv, false);
  if (x.labelAll) {
    const list = x.labels.edges;
    for (let j = 0; j < list.length; j++) {
      const e = list[j];
      put((e.a.x + e.b.x) / 2, (e.a.y + e.b.y) / 2, (e.a.z + e.b.z) / 2, e.mv, false);
    }
  }
  const pool = x.labels.pool;
  for (let i = k; i < pool.length; i++) if (!pool[i].hidden) pool[i].hidden = true;
}
