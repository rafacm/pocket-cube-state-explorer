// Find a state: from a scramble or a facelet string typed by the user, or a random one.
import { DLB, NSTATE, canonical, decodeCode, encodeKey, ensureTables, faceletString, parseState, type Key } from '../model';
import type { Explorer } from '../explorer/types';
import { clearLoop } from '../explorer/selection';
import { routeFromSolved } from '../explorer/locate';
import { listen } from '../explorer/events';
import { busy } from '../cube/live-cube';

/** Selects the state `held` (as held): the cube jumps there and the camera flies to it if it is drawn. */
export function findState(x: Explorer, held: Key, label: string): void {
  const note = x.el.findNote;
  const c = canonical(held);
  const ok = c.key[DLB[0]] === '1' && c.key[DLB[1]] === '3' && c.key[DLB[2]] === '5';
  ensureTables();
  const code = ok ? encodeKey(c.key) : -1;
  if (!ok || !(code >= 0) || decodeCode(code) !== c.key) {
    note.classList.add('err');
    note.textContent = 'That is not a reachable cube: a corner has impossible colours, or is twisted on its own. Check the string against the net.';
    return;
  }
  note.classList.remove('err');
  if (busy(x)) x.cube.queue.length = 0;
  clearLoop(x);
  routeFromSolved(x, code, route => {
    const D = x.dots, depthShown = x.graph.depthShown;
    const drawn = (D && D.dist[code] !== 255 && D.dist[code] <= depthShown) || x.graph.byKey.has(c.key);
    const d = route.length;
    note.textContent = (label ? label + ': ' : '') + (d === 0 ? 'that is the solved cube.' :
      d + (x.halfTurns ? (d === 1 ? ' move' : ' moves') : (d === 1 ? ' quarter turn' : ' quarter turns')) + ' from solved. Its shortest route is highlighted in the graph' +
      (drawn ? '' : ' as far as the graph is drawn') + '. Press Solve to walk it back, or Play from solved to watch it being built.');
    x.cube.queue.push({ set: held });
    x.cam.flyWhenDone = !!drawn;
  });
}

export function bindFind(x: Explorer): void {
  const el = x.el;
  listen(x, el.findForm, 'submit', (e: SubmitEvent) => {
    e.preventDefault();
    const r = parseState(el.stateInput.value);
    if ('error' in r) { el.findNote.classList.add('err'); el.findNote.textContent = r.error; return; }
    findState(x, r.key, r.kind === 'moves' ? 'Scramble ' + (r.moves.join(' ') || '(no moves)') : 'Facelets');
  });
  listen(x, el.btnRandom, 'click', () => {
    ensureTables();
    const key = decodeCode(Math.floor(Math.random() * NSTATE));
    el.stateInput.value = faceletString(key);
    findState(x, key, 'Random state');
  });
}
