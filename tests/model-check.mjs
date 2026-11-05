// Checks the cube model inside index.html without a browser: node tests/model-check.mjs
// It runs the code between /*MODEL-START*/ and /*MODEL-END*/ and verifies that
//   1. state numbers round-trip (decode(encode(state)) === state),
//   2. the move tables agree with the sticker model,
//   3. the canonical form is the same for all 24 ways of holding a state,
//   4. a full breadth-first search finds exactly the published layer sizes in both metrics.
// Takes a few seconds. Exit code 1 on any failure.
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const model = html.split('/*MODEL-START*/')[1]?.split('/*MODEL-END*/')[0];
if (!model) { console.error('Could not find the /*MODEL-START*/ ... /*MODEL-END*/ section in index.html'); process.exit(1); }

// new Function (not eval) so the code is optimised normally
const M = new Function(`"use strict";\n${model}\nreturn { SOLVED, ALL_MOVES, OPP_MOVES, ROT_MOVES, ORIENTS, NSTATE, QTM_TOTALS, HTM_TOTALS,
  applyMove, canonical, encodeKey, decodeCode, ensureTables, applyCode, faceletString };`)();

let failed = 0;
const check = (ok, label) => { console.log((ok ? 'ok    ' : 'FAIL  ') + label); if (!ok) failed++; };

let seed = 12345;
const rnd = (n) => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed % n; };
const allMoves = [...M.ALL_MOVES, ...M.OPP_MOVES];

M.ensureTables();
check(M.encodeKey(M.SOLVED) === 0 && M.decodeCode(0) === M.SOLVED, 'solved cube is state number 0');
check(M.faceletString(M.SOLVED) === 'WWWW:RRRR:GGGG:YYYY:OOOO:BBBB', 'facelet string of the solved cube');

// random walk with U R F turns (the canonical frame): numbers and tables agree with the stickers
let key = M.SOLVED, bad = 0;
for (let i = 0; i < 20000; i++) {
  const mv = M.ALL_MOVES[rnd(9)], c0 = M.encodeKey(key);
  key = M.applyMove(key, mv);
  if (M.applyCode(c0, mv.idx) !== M.encodeKey(key) || M.decodeCode(M.encodeKey(key)) !== key) bad++;
}
check(bad === 0, `20,000 random turns: numbering and move tables agree (${bad} mismatches)`);

// canonical form: any turn, any whole-cube rotation, one answer per state
key = M.SOLVED; bad = 0;
for (let i = 0; i < 300; i++) {
  key = M.applyMove(key, allMoves[rnd(allMoves.length)]);
  const c = M.canonical(key).key;
  for (const o of M.ORIENTS) if (M.canonical(M.applyMove(key, o)).key !== c) bad++;
  let held = key; for (const r of M.canonical(key).seq) held = M.applyMove(held, r);
  if (held !== c) bad++;
}
check(bad === 0, `canonical form is the same for all 24 orientations (${bad} mismatches)`);

// full search in both metrics
for (const [name, half, expected] of [['quarter turns', false, M.QTM_TOTALS], ['half turns', true, M.HTM_TOTALS]]) {
  const mv = M.ALL_MOVES.filter(m => half || m.turns !== 2).map(m => m.idx);
  const dist = new Uint8Array(M.NSTATE).fill(255); dist[0] = 0;
  let frontier = [0]; const counts = [1]; let sameLayer = 0;
  for (let d = 0; frontier.length; d++) {
    const next = [];
    for (const c of frontier) for (const m of mv) {
      const n = M.applyCode(c, m);
      if (dist[n] === 255) { dist[n] = d + 1; next.push(n); } else if (dist[n] === d) sameLayer++;
    }
    if (next.length) counts.push(next.length);
    frontier = next;
  }
  const total = counts.reduce((a, b) => a + b, 0);
  check(JSON.stringify(counts) === JSON.stringify(expected), `${name}: layer sizes match the published table (${counts.length - 1} layers)`);
  check(total === M.NSTATE, `${name}: ${total.toLocaleString('en-US')} states in total`);
  if (!half) check(sameLayer === 0, 'quarter turns: no links inside a layer');
}

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
