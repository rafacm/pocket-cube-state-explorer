// Compact numbering of every state.
// A canonical state is fixed by where the 7 movable corners are (7! = 5040 ways) and how 6 of them are
// twisted (3^6 = 729; the 7th twist follows). code = permutation rank * 729 + twist number, 0 .. 3,674,159.
import { ALL_MOVES, SOLVED, applyMove, slotIndex, type Key, type Vec3 } from './cube';

export const NPERM = 5040, NORI = 729, NSTATE = NPERM * NORI;

const C_POS: Vec3[] = [];
for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) if (!(x < 0 && y < 0 && z < 0)) C_POS.push([x, y, z]);
// the three stickers of each corner in one consistent turning order, starting with its U/D sticker
const C_SLOTS: number[][] = C_POS.map(p => {
  const ny: Vec3 = [0, p[1], 0], nx: Vec3 = [p[0], 0, 0], nz: Vec3 = [0, 0, p[2]];
  const order = -p[0] * p[1] * p[2] > 0 ? [ny, nx, nz] : [ny, nz, nx];
  return order.map(n => slotIndex(p, n));
});
const C_COLS: string[][] = C_SLOTS.map(sl => sl.map(s => SOLVED[s]));
const C_PIECE: Record<string, number> = {}; C_COLS.forEach((c, i) => { C_PIECE[c.slice().sort().join('')] = i; });

/** The number (0 .. 3,674,159) of a canonical state. */
export function encodeKey(key: Key): number {
  const perm: number[] = [], ori: number[] = [];
  for (let i = 0; i < 7; i++) {
    const cs = C_SLOTS[i].map(s => key[s]);
    perm.push(C_PIECE[cs.slice().sort().join('')]);
    ori.push(cs[0] === '0' || cs[0] === '1' ? 0 : cs[1] === '0' || cs[1] === '1' ? 1 : 2);
  }
  let r = 0;
  for (let i = 0; i < 7; i++) { let c = 0; for (let j = i + 1; j < 7; j++) if (perm[j] < perm[i]) c++; r = r * (7 - i) + c; }
  let o = 0; for (let i = 5; i >= 0; i--) o = o * 3 + ori[i];
  return r * NORI + o;
}
/** The canonical state with this number. */
export function decodeCode(code: number): Key {
  let r = Math.floor(code / NORI), o = code % NORI;
  const dg = new Array<number>(7);
  for (let i = 6; i >= 0; i--) { dg[i] = r % (7 - i); r = Math.floor(r / (7 - i)); }
  const avail = [0, 1, 2, 3, 4, 5, 6], perm = dg.map(d => avail.splice(d, 1)[0]);
  const ori: number[] = []; let sum = 0;
  for (let i = 0; i < 6; i++) { ori.push(o % 3); sum += o % 3; o = Math.floor(o / 3); }
  ori.push((3 - sum % 3) % 3);
  const arr = SOLVED.split('');
  for (let i = 0; i < 7; i++) for (let j = 0; j < 3; j++) arr[C_SLOTS[i][(ori[i] + j) % 3]] = C_COLS[perm[i]][j];
  return arr.join('');
}

// Move tables: permutation and twist change independently of each other.
// PT[m * NPERM + p] and OT[m * NORI + o] for the 9 moves of ALL_MOVES; filled by ensureTables().
// Live bindings: importers see the filled tables once ensureTables() has run.
export let PT = new Uint16Array(0), OT = new Uint16Array(0);
export function ensureTables(): void {
  if (PT.length) return;
  const pt = new Uint16Array(9 * NPERM), ot = new Uint16Array(9 * NORI);
  for (let m = 0; m < 9; m++) {
    for (let p = 0; p < NPERM; p++) pt[m * NPERM + p] = Math.floor(encodeKey(applyMove(decodeCode(p * NORI), ALL_MOVES[m])) / NORI);
    for (let o = 0; o < NORI; o++) ot[m * NORI + o] = encodeKey(applyMove(decodeCode(o), ALL_MOVES[m])) % NORI;
  }
  PT = pt; OT = ot;
}
/** The number of the state reached from state number c by ALL_MOVES[m] (after ensureTables()). */
export function applyCode(c: number, m: number): number { const p = (c / NORI) | 0; return PT[m * NPERM + p] * NORI + OT[m * NORI + c - p * NORI]; }

// Fast sticker colours for a code, without strings (used to draw thousands of cubes at a time).
let PERM_UN: Uint8Array | null = null, ORI_UN: Uint8Array | null = null;
const SOLVED_N = Uint8Array.from(SOLVED, ch => ch.charCodeAt(0) - 48);
const C_COLS_N = C_COLS.map(c => c.map(ch => ch.charCodeAt(0) - 48));
function ensureUnrank(): void {
  if (PERM_UN) return;
  PERM_UN = new Uint8Array(NPERM * 7); ORI_UN = new Uint8Array(NORI * 7);
  for (let r0 = 0; r0 < NPERM; r0++) {
    let r = r0; const dg = new Array<number>(7);
    for (let i = 6; i >= 0; i--) { dg[i] = r % (7 - i); r = Math.floor(r / (7 - i)); }
    const avail = [0, 1, 2, 3, 4, 5, 6]; for (let i = 0; i < 7; i++) PERM_UN[r0 * 7 + i] = avail.splice(dg[i], 1)[0];
  }
  for (let o0 = 0; o0 < NORI; o0++) {
    let o = o0, sum = 0;
    for (let i = 0; i < 6; i++) { ORI_UN[o0 * 7 + i] = o % 3; sum += o % 3; o = Math.floor(o / 3); }
    ORI_UN[o0 * 7 + 6] = (3 - sum % 3) % 3;
  }
}
/** Writes the 24 sticker colours (0..5) of state number `code` into `out`. */
export function decodeStickersInto(code: number, out: Uint8Array): Uint8Array {
  ensureUnrank();
  const pu = PERM_UN!, ou = ORI_UN!;
  const p = (code / NORI) | 0, o = code - p * NORI;
  out.set(SOLVED_N);
  for (let i = 0; i < 7; i++) {
    const cols = C_COLS_N[pu[p * 7 + i]], tw = ou[o * 7 + i], sl = C_SLOTS[i];
    out[sl[tw % 3]] = cols[0]; out[sl[(tw + 1) % 3]] = cols[1]; out[sl[(tw + 2) % 3]] = cols[2];
  }
  return out;
}
