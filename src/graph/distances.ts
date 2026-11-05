// Distances from solved for all 3,674,160 states, one byte each, and routes found from them.
import { NORI, NPERM, NSTATE, OT, PT, applyCode, ensureTables, inverseOf, type Move } from '../model';
import { activeMoves, totals } from '../explorer/settings';

/** Not reached (yet). */
export const FAR = 255;

/** One breadth-first search over the state numbers (under a second): the distance of every state. */
export function computeDistances(halfTurns: boolean): Uint8Array {
  ensureTables();
  const dist = new Uint8Array(NSTATE).fill(FAR), mv = activeMoves(halfTurns).map(m => m.idx), tot = totals(halfTurns);
  dist[0] = 0; let fr = new Int32Array([0]);
  for (let d = 0; fr.length; d++) {
    const nx = new Int32Array(tot[d + 1] || 0); let n = 0;
    for (let k = 0; k < fr.length; k++) {
      const c = fr[k], p = (c / NORI) | 0, o = c - p * NORI;
      for (const m of mv) { const nc = PT[m * NPERM + p] * NORI + OT[m * NORI + o]; if (dist[nc] === FAR) { dist[nc] = d + 1; nx[n++] = nc; } }
    }
    fr = nx.subarray(0, n);
  }
  return dist;
}

/** One shortest route from solved to state number `code`, found by stepping down the distances. */
export function routeTo(code: number, dist: Uint8Array, moves: readonly Move[]): Move[] {
  const out: Move[] = []; let c = code, d = dist[c];
  while (d > 0 && d !== FAR) {
    let next = -1;
    for (const m of moves) { const nc = applyCode(c, m.idx); if (dist[nc] === d - 1) { out.push(inverseOf(m)); next = nc; break; } }
    if (next < 0) break;
    c = next; d--;
  }
  return out.reverse();
}
