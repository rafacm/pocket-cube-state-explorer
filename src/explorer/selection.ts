// The current state: where it is in the graph, which routes to it light up, and deselecting.
import { applyCode, canonical, decodeCode, encodeKey, type Move } from '../model';
import { preds } from '../graph/routes';
import type { GNode } from '../graph/graph';
import type { Explorer, Point } from './types';
import { currentPoint, dotPoint, posOfCode, routeInGraph } from './locate';
import { routeTo } from '../graph/distances';
import { activeMoves } from './settings';
import { busy } from '../cube/live-cube';
import { walkFly } from '../cube/walks';
import { flyTo } from '../render/navigation';
import { renderNet, renderOrientation } from '../ui/net';
import { renderRoutes } from '../ui/routes';
import { updateCard } from '../ui/controls';

/** Boxed turn labels: decided from the selection itself every time, so no box can outlive its state. */
export const boxesShown = (x: Explorer): boolean => x.sel.on && x.sel.boxKey !== null && x.sel.boxKey === x.cube.key;

/** Called whenever the cube's state changes: find it in the graph and update everything that shows it. */
export function onState(x: Explorer): void {
  x.renderDirty = true; x.cubeDirty = true;
  const s = x.sel, c = canonical(x.cube.key);
  s.node = x.graph.byKey.get(c.key) || null; s.dot = null; s.free = null;
  if (!s.node && x.dots) {
    const code = encodeKey(c.key), dd = x.dots.dist[code];
    if (dd !== 255 && dd <= x.graph.depthShown) s.dot = { code, depth: dd, route: routeInGraph(x, code) };
  }
  if (!s.node && !s.dot && x.fullDist && x.fullDistHalf === x.halfTurns) {
    const code = encodeKey(c.key);
    if (decodeCode(code) === c.key) s.free = { code, depth: x.fullDist[code], route: routeTo(code, x.fullDist, activeMoves(x.halfTurns)) };
  }
  if (s.keepBox) { s.boxKey = x.cube.key; if (!x.cube.queue.length) s.keepBox = false; }
  const nb = boxesShown(x);
  if (nb !== s.boxOn) { s.boxOn = nb; x.labels.dirty = true; }
  renderNet(x); renderOrientation(x, c);
  const el = x.el;
  el.cbDepth.textContent = String(s.node ? s.node.depth : s.dot ? s.dot.depth : s.free ? s.free.depth : '>' + x.graph.depthShown);
  const dep = s.node ? s.node.depth : s.dot ? s.dot.depth : s.free ? s.free.depth : 0;
  el.btnPlay.disabled = dep <= 0;
  // follow the cube: after every turn, fly to the state it is in now
  if (el.optFollow.checked && (busy(x) || x.cube.anim)) { const P = currentPoint(x); if (P) flyTo(x, P, walkFly(x) * 0.95); }
  computeHighlight(x);
  renderRoutes(x);
  updateCard(x);
}

/** The route segments to draw as tubes. */
export function computeHighlight(x: Explorer): void {
  const s = x.sel, hl: typeof s.highlight = [];
  s.highlight = hl;
  fillHighlight(x, hl);
  x.el.legRoute.hidden = hl.length === 0; // the legend lists only what is on screen
}
function fillHighlight(x: Explorer, hl: Explorer['sel']['highlight']): void {
  const s = x.sel;
  if (!s.on) return;
  if (s.loop) {
    const { A, B, k } = s.loop;
    for (let i = 1; i < k; i++) hl.push([A[i - 1], A[i], 0, 0.3]);
    for (let i = k; i < A.length; i++) hl.push([A[i - 1], A[i], 0, 0.8]);
    for (let i = k; i < B.length; i++) hl.push([B[i - 1], B[i], 1, 0.8]);
    return;
  }
  const along = (route: readonly Move[], at: (c: number) => Point | null) => {
    let c = 0, a: Point = x.graph.nodes[0];
    for (const m of route) {
      c = applyCode(c, m.idx); const b = at(c); if (!b) break;
      hl.push([a, b, 0, 0.55]); a = b;
    }
  };
  if (s.dot) { along(s.dot.route, c => dotPoint(x, c)); return; }
  if (s.free) { along(s.free.route, c => x.dots ? posOfCode(x, c) : x.graph.byKey.get(decodeCode(c)) || null); return; }
  if (!s.node) return;
  const seen = new Set<GNode>([s.node]), stack = [s.node];
  while (stack.length && hl.length < x.gs.tubes.length) {
    const n = stack.pop()!;
    for (const p of preds(n)) { hl.push([n, p, 0, 0.55]); if (!seen.has(p)) { seen.add(p); stack.push(p); } }
  }
}

export function clearLoop(x: Explorer): void { if (x.sel.loop) { x.sel.loop = null; computeHighlight(x); renderRoutes(x); } }

/** Nothing selected: the cube keeps its state, but nothing is highlighted. */
export function deselect(x: Explorer): void {
  const s = x.sel;
  if (!s.on) return;
  clearLoop(x); s.on = false; x.labels.dirty = true; s.boxKey = null; s.boxOn = false; x.renderDirty = true;
  x.ui.cardWanted = false;
  computeHighlight(x); renderRoutes(x); updateCard(x);
}
