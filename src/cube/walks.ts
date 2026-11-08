// What the live cube plays: single turns from the pad, Solve, Play from solved and Walk the loop.
// Walk timing: with the camera following, each step is: turn the cube, then fly to the new state,
// then the next turn. The speed slider scales both.
import * as THREE from 'three';
import { ROT_MOVES, SOLVED, applyMove, canonical, encodeKey, ensureTables, inverseOf, invertMove, type Key, type Move } from '../model';
import { edgeBetween, moveAlong } from '../graph/graph';
import { routeMoves, routes } from '../graph/routes';
import type { Explorer } from '../explorer/types';
import { clearLoop, computeHighlight } from '../explorer/selection';
import { currentPoint, pointOfKey, routeFromSolved } from '../explorer/locate';
import { chaseTo } from '../render/navigation';
import { renderRoutes } from '../ui/routes';
import { busy } from './live-cube';

export const SPEEDS = [null, { f: 2, name: 'Very slow' }, { f: 1.45, name: 'Slow' }, { f: 1, name: 'Normal' }, { f: 0.6, name: 'Fast' }, { f: 0.32, name: 'Very fast' }] as const;
function speedF(x: Explorer): number { return (SPEEDS[+x.el.optSpeed.value] || SPEEDS[3]).f; }
function walkTurn(x: Explorer): number { return (x.el.optFollow.checked ? 900 : 450) * speedF(x); }
/** How long the camera takes to fly to the next state of a walk. */
export function walkFly(x: Explorer): number { return 1200 * speedF(x); }
/** How long the camera takes to fly to the selected state before Solve's first turn. */
function approachFly(x: Explorer): number { return 1800 * speedF(x); }

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
function pushWalk(x: Explorer, moves: readonly Move[], home = false): void {
  const follow = x.el.optFollow.checked;
  moves.forEach(m => { x.cube.queue.push({ mv: m, dur: walkTurn(x), home }); if (follow) x.cube.queue.push({ wait: walkFly(x) }); });
}

/**
 * Where Solve's walk heads from the state the cube will be in after the queued turns before it: mostly
 * toward the solved cube, partly toward the next state, so the camera keeps a steady course and does not
 * swing with every zigzag of the route. Null when no turn of Solve's walk is left.
 */
export function homeHeading(x: Explorer): THREE.Vector3 | null {
  let key = x.cube.key;
  for (const item of x.cube.queue) {
    if (!('mv' in item)) continue;
    key = applyMove(key, item.mv);
    if (!item.home) continue;
    const P = currentPoint(x), N = pointOfKey(x, key), S = x.graph.nodes[0];
    if (!P) return null;
    const toSolved = new THREE.Vector3(S.x - P.x, S.y - P.y, S.z - P.z);
    if (toSolved.lengthSq() < 1e-6) return null;
    const dir = toSolved.normalize().multiplyScalar(0.65);
    if (N) { const toNext = new THREE.Vector3(N.x - P.x, N.y - P.y, N.z - P.z); if (toNext.lengthSq() > 1e-6) dir.addScaledVector(toNext.normalize(), 0.35); }
    return dir.add(new THREE.Vector3(P.x, P.y, P.z));
  }
  return null;
}

// Solve's walk: when the camera follows and the cube is drawn, first fly to it, facing the way home,
// then start turning
function walkHome(x: Explorer, moves: readonly Move[]): void {
  pushReorient(x);
  pushWalk(x, moves, true);
  const P = currentPoint(x), ahead = x.el.optFollow.checked && P ? homeHeading(x) : null;
  if (P && ahead) { chaseTo(x, P, ahead, approachFly(x)); x.cube.queue.unshift({ wait: x.reducedMotion ? 1 : approachFly(x) }); x.cam.holdFade = true; }
}

/** Solve: play a shortest route back to solved (from any state), turn by turn. */
export function goHome(x: Explorer): void {
  if (busy(x) || x.cube.key === SOLVED) return;
  clearLoop(x); forgetTurns(x);
  const ck = canonical(x.cube.key).key, cur = x.graph.byKey.get(ck);
  if (cur) {
    const mv: Move[] = []; for (let n = cur; n.parent; n = n.parent) mv.push(inverseOf(n.via!));
    walkHome(x, mv);
    return;
  }
  ensureTables();
  routeFromSolved(x, encodeKey(ck), route => {
    if (busy(x)) return;
    walkHome(x, route.slice().reverse().map(m => inverseOf(m)));
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
  forgetTurns(x); x.cam.holdFade = false;
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
  x.cube.queue.length = 0; clearLoop(x); x.cam.flyWhenDone = false; x.cam.holdFade = false; forgetTurns(x);
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
  clearLoop(x); forgetTurns(x); x.cam.holdFade = false;
  x.cube.queue.push({ set: SOLVED }, { wait: 300 });
  pushWalk(x, route);
  for (let i = c.seq.length - 1; i >= 0; i--) {
    const r = c.seq[i];
    x.cube.queue.push({ mv: ROT_MOVES.find(m => m.ax === r.ax && m.q === (r.q === 2 ? 2 : -r.q))!, dur: 380 });
  }
}
