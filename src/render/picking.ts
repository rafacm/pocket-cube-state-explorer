// Picking in screen space: project every cube centre and take the nearest one under the pointer.
// Dots are only picked on click: projecting millions of points on every pointer move would be too slow.
import { decodeCode, type Key } from '../model';
import { fmt, fullMax, maxDepth } from '../explorer/settings';
import type { GNode } from '../graph/graph';
import { pathOf } from '../graph/routes';
import type { Explorer } from '../explorer/types';
import { deselect } from '../explorer/selection';
import { dotPoint, routeInGraph } from '../explorer/locate';
import { listen } from '../explorer/events';
import { busy } from '../cube/live-cube';
import { jumpTo } from '../cube/walks';
import { dotPx } from '../outer/dots';
import { dotHover, pickDetail } from './detail';
import { flyTo, type Flyable } from './navigation';
import { focalPx } from './scene';

/** The cube-layer node under the pointer. */
export function pick(x: Explorer): GNode | null {
  const gs = x.gs, cam = gs.cam, nodes = x.graph.nodes, { mx, my } = x.pointer;
  const w = x.el.graph.clientWidth, h = x.el.graph.clientHeight; if (!w || !nodes.length) return null;
  cam.updateMatrixWorld(); gs.pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  const e = gs.pm.elements, focal = focalPx(cam, h);
  let best: GNode | null = null, bestW = Infinity;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const cw = e[3] * n.x + e[7] * n.y + e[11] * n.z + e[15];
    if (cw <= 0.5 || cw >= bestW) continue;
    const sx = ((e[0] * n.x + e[4] * n.y + e[8] * n.z + e[12]) / cw + 1) / 2 * w;
    const sy = (1 - (e[1] * n.x + e[5] * n.y + e[9] * n.z + e[13]) / cw) / 2 * h;
    const r = Math.max(5, n.size * 0.75 * focal / cw), dx = sx - mx, dy = sy - my;
    if (dx * dx + dy * dy <= r * r) { best = n; bestW = cw; }
  }
  return best;
}

/** The state number of the dot under the pointer, or -1. */
function pickDot(x: Explorer): number {
  const D = x.dots; if (!D) return -1;
  const gs = x.gs, cam = gs.cam, { mx, my } = x.pointer;
  const w = x.el.graph.clientWidth, h = x.el.graph.clientHeight;
  cam.updateMatrixWorld(); gs.pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  const e = gs.pm.elements, P = D.pos;
  let best = -1, bestW = Infinity;
  for (let d = fullMax(x.halfTurns) + 1; d <= maxDepth(x.halfTurns); d++) {
    const n = D.cnt[d]; if (!n) continue;
    const rpx = Math.max(5, dotPx(x, d)), o = D.off[d];
    for (let i = o; i < o + n; i++) {
      const px = P[i * 3], py = P[i * 3 + 1], pz = P[i * 3 + 2];
      const cw = e[3] * px + e[7] * py + e[11] * pz + e[15];
      if (cw <= 0.5 || cw >= bestW) continue;
      const sx = ((e[0] * px + e[4] * py + e[8] * pz + e[12]) / cw + 1) / 2 * w;
      const sy = (1 - (e[1] * px + e[5] * py + e[9] * pz + e[13]) / cw) / 2 * h;
      const dx = sx - mx, dy = sy - my;
      if (dx * dx + dy * dy <= rpx * rpx) { best = i; bestW = cw; }
    }
  }
  return best < 0 ? -1 : D.codes[best];
}

/** Hover: the cube under the pointer gets a box and a tip with its route. Called every frame. */
export function updateHover(x: Explorer): void {
  const p = x.pointer;
  if (!p.needPick || !p.inside) return; p.needPick = false;
  let hover: typeof p.hover = pick(x);
  if (!hover && x.detail.n) { const i = pickDetail(x); if (i >= 0) hover = dotHover(x, i); }
  p.hover = hover;
  const canvas = x.el.graph, tip = x.el.tip;
  canvas.classList.toggle('pointing', !!hover);
  if (!hover) { tip.hidden = true; return; }
  const route = ('dotIdx' in hover ? routeInGraph(x, hover.code) : pathOf(hover)).map(m => m.name).join(' ');
  const paths = 'paths' in hover ? hover.paths : 0;
  tip.innerHTML = '<span class="d">' + hover.depth + (hover.depth === 1 ? ' turn' : ' turns') + '</span>' + (route || 'solved') +
    (paths > 1 ? '<span class="d" style="margin:0 0 0 8px">' + fmt(paths) + ' routes</span>' : '');
  tip.hidden = false;
  const W = x.el.stage.clientWidth, tw = tip.offsetWidth;
  tip.style.left = Math.min(p.mx + 14, W - tw - 8) + 'px'; tip.style.top = (p.my + 16) + 'px';
}

export function bindPicking(x: Explorer): void {
  const canvas = x.el.graph, p = x.pointer;
  const at = (e: MouseEvent) => { const r = canvas.getBoundingClientRect(); p.mx = e.clientX - r.left; p.my = e.clientY - r.top; };
  listen(x, canvas, 'pointermove', (e: PointerEvent) => { at(e); p.inside = true; p.needPick = true; });
  listen(x, canvas, 'pointerleave', () => { p.inside = false; p.hover = null; x.el.tip.hidden = true; canvas.classList.remove('pointing'); });
  listen(x, canvas, 'pointerdown', (e: PointerEvent) => { p.downX = e.clientX; p.downY = e.clientY; });
  listen(x, canvas, 'pointerup', (e: PointerEvent) => {
    if (Math.hypot(e.clientX - p.downX, e.clientY - p.downY) > 6) return;
    at(e);
    // clicking the state whose turn boxes are showing hides them again; any other state is selected
    const choose = (k: Key) => {
      const s = x.sel;
      if (s.boxOn && k === x.cube.key && !busy(x)) { s.boxKey = null; s.boxOn = false; x.labels.dirty = true; return; }
      jumpTo(x, k); s.boxKey = k;
    };
    const n = pick(x); if (n) { choose(n.key); return; }
    const di = pickDetail(x); if (di >= 0) { choose(decodeCode(x.dots!.codes[di])); return; }
    const c = pickDot(x); if (c >= 0) { choose(decodeCode(c)); return; }
    deselect(x);
  });
  // double-click: fly the camera close to that spot
  listen(x, canvas, 'dblclick', (e: MouseEvent) => {
    at(e);
    let t: Flyable | null = pick(x);
    if (!t) { const di = pickDetail(x); if (di >= 0) t = dotHover(x, di); }
    if (!t && x.dots) { const c = pickDot(x); if (c >= 0) t = dotPoint(x, c); }
    if (t) flyTo(x, t);
  });
}
