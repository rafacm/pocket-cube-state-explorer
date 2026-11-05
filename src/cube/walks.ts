// What the live cube plays: single turns from the pad, Solve, Play from solved and Walk the loop.
// Walk timing: with the camera following, each step is: turn the cube, then fly to the new state,
// then the next turn. The speed slider scales both.
import { ROT_MOVES, SOLVED, canonical, encodeKey, ensureTables, inverseOf, invertMove, type Key, type Move } from '../model';
import { edgeBetween, moveAlong } from '../graph/graph';
import { routeMoves, routes } from '../graph/routes';
import type { Explorer } from '../explorer/types';
import { clearLoop, computeHighlight } from '../explorer/selection';
import { routeFromSolved } from '../explorer/locate';
import { renderRoutes } from '../ui/routes';
import { busy } from './live-cube';

export const SPEEDS = [null, { f: 2, name: 'Very slow' }, { f: 1.45, name: 'Slow' }, { f: 1, name: 'Normal' }, { f: 0.6, name: 'Fast' }, { f: 0.32, name: 'Very fast' }] as const;
function speedF(x: Explorer): number { return (SPEEDS[+x.el.optSpeed.value] || SPEEDS[3]).f; }
function walkTurn(x: Explorer): number { return (x.el.optFollow.checked ? 900 : 450) * speedF(x); }
/** How long the camera takes to fly to the next state of a walk. */
export function walkFly(x: Explorer): number { return 1200 * speedF(x); }

/** A turn by hand (the pad or a key), as held; it can be undone. */
export function queueMove(x: Explorer, mv: Move): void {
  if (x.cube.queue.length >= 3) return;
  clearLoop(x);
  x.cube.queue.push({ mv, dur: mv.kind === 'rot' ? 380 : 300 });
  x.cube.history.push(mv);
}
/** Undoes the last turn made by hand. */
export function undoTurn(x: Explorer): void {
  const h = x.cube.history;
  if (!h.length || x.cube.queue.length >= 3) return;
  const mv = invertMove(h.pop()!);
  clearLoop(x);
  x.cube.queue.push({ mv, dur: mv.kind === 'rot' ? 380 : 300 });
}
/** Anything but a turn by hand moves the cube: there is nothing left to undo. */
export const forgetTurns = (x: Explorer): void => { x.cube.history.length = 0; };
// moves in the graph are meant for the canonical orientation: rotate there first
function pushReorient(x: Explorer): Key {
  const c = canonical(x.cube.key);
  c.seq.forEach(m => x.cube.queue.push({ mv: m, dur: 380 }));
  return c.key;
}
/** A turn along a link of the graph (a clicked turn label). */
export function queueGraphMove(x: Explorer, mv: Move): void { if (busy(x)) return; clearLoop(x); forgetTurns(x); pushReorient(x); x.cube.queue.push({ mv, dur: 300 }); }
/** Rotates the cube into the canonical orientation. */
export function normalize(x: Explorer): void { if (busy(x)) return; clearLoop(x); forgetTurns(x); pushReorient(x); }

// queue a walk: one turn per step, and when the camera follows, a pause for its flight after each turn
function pushWalk(x: Explorer, moves: readonly Move[]): void {
  const follow = x.el.optFollow.checked;
  moves.forEach(m => { x.cube.queue.push({ mv: m, dur: walkTurn(x) }); if (follow) x.cube.queue.push({ wait: walkFly(x) }); });
}

/** Solve: play a shortest route back to solved (from any state), turn by turn. */
export function goHome(x: Explorer): void {
  if (busy(x) || x.cube.key === SOLVED) return;
  clearLoop(x); forgetTurns(x);
  const ck = canonical(x.cube.key).key, cur = x.graph.byKey.get(ck);
  if (cur) {
    pushReorient(x);
    const mv: Move[] = []; for (let n = cur; n.parent; n = n.parent) mv.push(inverseOf(n.via!));
    pushWalk(x, mv);
    return;
  }
  ensureTables();
  routeFromSolved(x, encodeKey(ck), route => {
    if (busy(x)) return;
    pushReorient(x);
    pushWalk(x, route.slice().reverse().map(m => inverseOf(m)));
  });
}

/**
 * Walk a loop: from the current state go back along route 2 to where it splits from route 1,
 * then out along route 1. The cube ends exactly where it started.
 */
export function walkLoop(x: Explorer): void {
  const sel = x.sel.node;
  if (busy(x) || !sel) return;
  const rs = routes(sel, 2); if (rs.length < 2) return;
  const A = rs[0], B = rs[1];
  let k = 0; while (A[k] === B[k]) k++;
  x.sel.loop = { A, B, k, n: sel, len: 2 * (A.length - k) };
  forgetTurns(x);
  pushReorient(x);
  const back: Move[] = []; for (let i = B.length - 1; i >= k; i--) back.push(moveAlong(edgeBetween(B[i], B[i - 1])!, B[i]));
  pushWalk(x, back);
  x.cube.queue.push({ wait: 380 });
  const out: Move[] = []; for (let i = k; i < A.length; i++) out.push(moveAlong(edgeBetween(A[i - 1], A[i])!, A[i - 1]));
  pushWalk(x, out);
  computeHighlight(x); renderRoutes(x);
}

/** Select a state: the cube jumps there at once; Solve or Play from solved then walk the route. */
export function jumpTo(x: Explorer, key: Key): void {
  x.cube.queue.length = 0; clearLoop(x); x.cam.flyWhenDone = false; forgetTurns(x);
  x.cube.queue.push({ set: key });
}

/** Play from solved: reset to solved, then build the current state along a shortest route. */
export function playFromSolved(x: Explorer): void {
  if (busy(x)) return;
  const c = canonical(x.cube.key), s = x.sel;
  let route: Move[] | null = null;
  if (s.node) route = s.node.depth ? routeMoves(routes(s.node, 1)[0]) : [];
  else if (s.dot) route = s.dot.route;
  else if (s.free) route = s.free.route;
  if (!route || !route.length) return;
  clearLoop(x); forgetTurns(x);
  x.cube.queue.push({ set: SOLVED }, { wait: 300 });
  pushWalk(x, route);
  for (let i = c.seq.length - 1; i >= 0; i--) {
    const r = c.seq[i];
    x.cube.queue.push({ mv: ROT_MOVES.find(m => m.ax === r.ax && m.q === (r.q === 2 ? 2 : -r.q))!, dur: 380 });
  }
}
