// Where a state is drawn (cube-layer node or dot), and routes to states outside the drawn graph.
import { NSTATE, type Move } from '../model';
import type { GNode } from '../graph/graph';
import { computeDistances, routeTo } from '../graph/distances';
import { activeMoves, fmt } from './settings';
import type { DotPoint, Explorer, Point } from './types';
import { cubeSizeOf } from '../outer/dots';
import { showBusy } from '../ui/status';

/** Where a state of a finished layer is drawn; `j` is its dot index for dots. */
export function posOfCode(x: Explorer, code: number): (Point & { j?: number }) | null {
  const D = x.dots!, j = D.map[code];
  if (j <= -2) return x.graph.nodes[-2 - j];
  if (j >= 0 && D.dist[code] <= x.graph.depthShown) return { x: D.pos[j * 3], y: D.pos[j * 3 + 1], z: D.pos[j * 3 + 2], j };
  return null;
}
/** The state number a dot was first reached from, or -1. */
export function parentOf(x: Explorer, code: number): number { const D = x.dots!, j = D.map[code]; return j >= 0 ? D.parent[j] : -1; }

/** Where a state is drawn, as a node or a dot (also while its layer is still being revealed). */
export function dotPoint(x: Explorer, code: number): GNode | DotPoint | null {
  const D = x.dots!, i = D.map[code];
  if (i <= -2) return x.graph.nodes[-2 - i];
  if (i >= 0) return { x: D.pos[i * 3], y: D.pos[i * 3 + 1], z: D.pos[i * 3 + 2], size: cubeSizeOf(), dot: true };
  return null;
}

/** Where the current state is drawn, if anywhere. */
export function currentPoint(x: Explorer): GNode | DotPoint | null {
  return x.sel.node || (x.sel.dot && dotPoint(x, x.sel.dot.code)) || null;
}

/** One shortest route from solved, from the drawn graph's distances. */
export function routeInGraph(x: Explorer, code: number): Move[] {
  return routeTo(code, x.dots!.dist, activeMoves(x.halfTurns));
}

/** Distance from solved for every state, so any state can be found and solved even when its layer is not drawn yet. */
export function ensureFullDist(x: Explorer): Uint8Array {
  if (x.fullDist && x.fullDistHalf === x.halfTurns) return x.fullDist;
  x.fullDist = computeDistances(x.halfTurns); x.fullDistHalf = x.halfTurns;
  return x.fullDist;
}
function withFullDist(x: Explorer, cb: (dist: Uint8Array) => void): void {
  if (x.fullDist && x.fullDistHalf === x.halfTurns) { cb(x.fullDist); return; }
  showBusy(x, 'Measuring the distance of all ' + fmt(NSTATE) + ' states…', 0.5);
  requestAnimationFrame(() => setTimeout(() => {
    if (x.destroyed) return;
    const d = ensureFullDist(x); showBusy(x, null); cb(d);
  }, 0));
}
/** Moves from solved to a state number: the graph's own distances when its layer is drawn, else the full table. */
export function routeFromSolved(x: Explorer, code: number, cb: (route: Move[]) => void): void {
  if (x.dots && x.dots.dist[code] !== 255) { cb(routeInGraph(x, code)); return; }
  withFullDist(x, d => cb(routeTo(code, d, activeMoves(x.halfTurns))));
}
