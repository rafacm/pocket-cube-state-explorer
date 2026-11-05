// The routes box: the shortest routes to the current state as rows of turn chips, and what they mean.
import { FACE_NAME, type Move } from '../model';
import { fmt } from '../explorer/settings';
import { routeMoves, routes } from '../graph/routes';
import type { GNode } from '../graph/graph';
import type { Explorer } from '../explorer/types';

function chip(mv: Move): HTMLElement {
  const el = document.createElement('span'); el.className = 'chip';
  el.innerHTML = '<span class="sw" style="--sw:var(--c-' + FACE_NAME[mv.face] + ')"></span>' + mv.name;
  return el;
}
function routeRow(cls: string, moves: readonly Move[]): HTMLElement {
  const row = document.createElement('div'); row.className = cls;
  const d = document.createElement('span'); d.className = 'rdot'; row.appendChild(d);
  moves.forEach(m => row.appendChild(chip(m)));
  return row;
}

/** A state at distance 2 (or more) with two routes, for "Go to a state with two routes". */
export const twoRouteState = (x: Explorer): GNode | undefined =>
  x.graph.nodes.find(n => n.depth === 2 && n.paths >= 2) || x.graph.nodes.find(n => n.paths >= 2);

export function renderRoutes(x: Explorer): void {
  const box = x.el.routes, note = x.el.routesNote, btn = x.el.btnLoop, s = x.sel;
  box.innerHTML = '';
  if (!s.on) {
    note.textContent = 'No state selected. Click a cube or dot in the graph to select it. Solve and Play from solved still work on the cube as it is.';
    btn.textContent = 'Walk the loop'; btn.disabled = true;
    return;
  }
  const f = s.loop ? s.loop.n : s.node;
  if (!f && s.free) {
    box.appendChild(routeRow('route r1', s.free.route));
    const d = s.free.depth;
    note.textContent = 'This state is ' + d + (x.halfTurns ? (d === 1 ? ' move' : ' moves') : (d === 1 ? ' turn' : ' turns')) + ' from solved, in layer ' + d + ', which is not drawn yet. Grow the graph to see it.';
    btn.textContent = 'Walk the loop'; btn.disabled = true;
    return;
  }
  if (!f && s.dot) {
    box.appendChild(routeRow('route r1', s.dot.route));
    note.textContent = 'One shortest route is shown. Beyond the cube layers the page stores each state\'s distance from solved, which is enough to find a route, but it does not count every route.';
    const t = x.graph.nodes.find(n => n.depth === 2 && n.paths >= 2);
    btn.textContent = 'Go to a state with two routes'; btn.disabled = !t;
    return;
  }
  if (!f) {
    note.textContent = 'This state is not in the graph yet. Grow more layers to reach it, or go back to solved.';
    btn.textContent = 'Walk the loop'; btn.disabled = true; return;
  }
  if (f.depth === 0) {
    const r = document.createElement('div'); r.className = 'route';
    const c = document.createElement('span'); c.className = 'chip'; c.textContent = 'Solved'; r.appendChild(c); box.appendChild(r);
  } else {
    routes(f, 4).forEach((r, i) => box.appendChild(routeRow('route' + (i === 0 ? ' r1' : i === 1 ? ' r2' : ''), routeMoves(r))));
  }
  if (s.loop) {
    note.textContent = 'Walking a loop of ' + s.loop.len + ' turns: back along the blue route to where the two routes split, then out along the pink one. The cube ends exactly where it started.';
  } else if (f.depth === 0) {
    note.textContent = 'This is the center of the graph. Pick a state at distance 2 or more to see several routes.';
  } else if (f.paths === 1) {
    note.textContent = 'Only one shortest route reaches this state.';
  } else {
    note.textContent = fmt(f.paths) + ' different shortest routes reach this state' + (f.paths > 4 ? ' (first 4 shown)' : '') + '. Two different routes to the same state form a loop.';
  }
  const target = twoRouteState(x);
  if (f.paths >= 2) { btn.textContent = 'Walk the loop through routes 1 and 2'; btn.disabled = !!s.loop; }
  else { btn.textContent = 'Go to a state with two routes'; btn.disabled = !target; }
}
