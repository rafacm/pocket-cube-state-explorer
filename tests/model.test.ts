// The cube model (src/model): bun test
//   1. state numbers round-trip (decode(encode(state)) === state),
//   2. the move tables agree with the sticker model,
//   3. the canonical form is the same for all 24 ways of holding a state,
//   4. a full breadth-first search finds exactly the published layer sizes in both metrics.
import { describe, expect, test } from 'bun:test';
import * as M from '../src/model';

let seed = 12345;
const rnd = (n: number) => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed % n; };
const allMoves = [...M.ALL_MOVES, ...M.OPP_MOVES];
M.ensureTables();

test('solved cube is state number 0', () => {
  expect(M.encodeKey(M.SOLVED)).toBe(0);
  expect(M.decodeCode(0)).toBe(M.SOLVED);
});

test('facelet string of the solved cube', () => {
  expect(M.faceletString(M.SOLVED)).toBe('WWWW:RRRR:GGGG:YYYY:OOOO:BBBB');
});

test('20,000 random U/R/F turns: numbering, move tables and fast decode agree', () => {
  let key = M.SOLVED, bad = 0;
  const out = new Uint8Array(24);
  for (let i = 0; i < 20000; i++) {
    const mv = M.ALL_MOVES[rnd(9)], c0 = M.encodeKey(key);
    key = M.applyMove(key, mv);
    const c = M.encodeKey(key);
    if (M.applyCode(c0, mv.idx) !== c || M.decodeCode(c) !== key) bad++;
    if (String.fromCharCode(...M.decodeStickersInto(c, out).map(v => v + 48)) !== key) bad++;
  }
  expect(bad).toBe(0);
});

test('canonical form is the same for all 24 orientations', () => {
  let key = M.SOLVED, bad = 0;
  for (let i = 0; i < 300; i++) {
    key = M.applyMove(key, allMoves[rnd(allMoves.length)]);
    const c = M.canonical(key).key;
    for (const o of M.ORIENTS) if (M.canonical(M.applyMove(key, o)).key !== c) bad++;
    let held = key; for (const r of M.canonical(key).seq) held = M.applyMove(held, r);
    if (held !== c) bad++;
  }
  expect(bad).toBe(0);
});

describe.each([['quarter turns', false, M.QTM_TOTALS], ['half turns', true, M.HTM_TOTALS]] as const)('%s', (_name, half, expected) => {
  const mv = M.ALL_MOVES.filter(m => half || m.turns !== 2).map(m => m.idx);
  const dist = new Uint8Array(M.NSTATE).fill(255); dist[0] = 0;
  let frontier = [0]; const counts = [1]; let sameLayer = 0;
  for (let d = 0; frontier.length; d++) {
    const next: number[] = [];
    for (const c of frontier) for (const m of mv) {
      const n = M.applyCode(c, m);
      if (dist[n] === 255) { dist[n] = d + 1; next.push(n); } else if (dist[n] === d) sameLayer++;
    }
    if (next.length) counts.push(next.length);
    frontier = next;
  }
  test('layer sizes match the published table', () => expect(counts).toEqual([...expected]));
  test('3,674,160 states in total', () => expect(counts.reduce((a, b) => a + b, 0)).toBe(M.NSTATE));
  if (!half) test('no links inside a layer', () => expect(sameLayer).toBe(0));
});
