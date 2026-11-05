// The cube as 24 stickers, the turns that move them, and the canonical way of holding it.
//
// Coordinates: x = right, y = up, z = front. Cubies sit at (±1, ±1, ±1).
// Faces 0..5 = U D R L F B. A sticker slot is (cubie position, outward normal).
// A state ("key") is a 24-character string: the colour (face number '0'..'5') in each slot.

export type Vec3 = [number, number, number];
/** 24 characters '0'..'5': the colour of each sticker slot, colours numbered like the faces. */
export type Key = string;
export type Axis = 0 | 1 | 2;

export interface Move {
  name: string;
  ax: Axis;
  /** which layer turns: 1 (the + side), -1 (the - side) or 0 (the whole cube) */
  sel: 1 | -1 | 0;
  /** signed quarter turns, clockwise as seen from the + end of the axis */
  q: number;
  /** face that turns (0..5), or -1 for whole-cube rotations */
  face: number;
  turns: number;
  /** where each slot's sticker goes */
  perm: number[];
  kind: 'turn' | 'rot';
  /** index into ALL_MOVES (and the move tables); -1 for other moves */
  idx: number;
}

/** Anything that permutes the stickers: a move or an orientation. */
export interface Permutation { perm: readonly number[] }

export const FACE_AXIS: readonly Axis[] = [1, 1, 0, 0, 2, 2];
export const FACE_SIGN: readonly number[] = [1, -1, 1, -1, 1, -1];
export const FACE_NAME: readonly string[] = ['U', 'D', 'R', 'L', 'F', 'B'];

function otherAxes(ax: Axis): [Axis, Axis] { return ax === 0 ? [1, 2] : ax === 1 ? [0, 2] : [0, 1]; }
function faceOf(n: Vec3): number { for (let f = 0; f < 6; f++) if (n[FACE_AXIS[f]] === FACE_SIGN[f]) return f; return -1; }
export function slotIndex(p: Vec3, n: Vec3): number {
  const f = faceOf(n), o = otherAxes(FACE_AXIS[f]);
  return f * 4 + (p[o[0]] > 0 ? 2 : 0) + (p[o[1]] > 0 ? 1 : 0);
}

export interface Slot { p: Vec3; n: Vec3; f: number }
export const SLOTS: Slot[] = [];
for (let f = 0; f < 6; f++) {
  const ax = FACE_AXIS[f], o = otherAxes(ax);
  for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
    const n: Vec3 = [0, 0, 0], p: Vec3 = [0, 0, 0];
    n[ax] = FACE_SIGN[f]; p[ax] = FACE_SIGN[f]; p[o[0]] = a ? 1 : -1; p[o[1]] = b ? 1 : -1;
    SLOTS.push({ p, n, f });
  }
}

// Clockwise quarter turn seen from the + end of the axis (= -90° about it).
function rotCW(v: Vec3, ax: Axis): Vec3 {
  const x = v[0], y = v[1], z = v[2];
  if (ax === 1) return [-z, y, x];
  if (ax === 0) return [x, z, -y];
  return [y, -x, z];
}
function quarterPerm(ax: Axis, sel: 1 | -1 | 0 = 1): number[] {
  const dst = new Array<number>(24);
  for (let s = 0; s < 24; s++) {
    const { p, n } = SLOTS[s];
    dst[s] = (sel === 0 || p[ax] === sel) ? slotIndex(rotCW(p, ax), rotCW(n, ax)) : s;
  }
  return dst;
}
function powerPerm(d: number[], times: number): number[] {
  let cur = Array.from({ length: 24 }, (_, i) => i);
  for (let t = 0; t < times; t++) cur = cur.map(x => d[x]);
  return cur;
}

// Only U, R, F turn: the D-L-B corner stays fixed, which factors out whole-cube rotations.
export const BASE: readonly { n: string; ax: Axis; f: number }[] = [{ n: 'U', ax: 1, f: 0 }, { n: 'R', ax: 0, f: 2 }, { n: 'F', ax: 2, f: 4 }];
/** U U' U2 R R' R2 F F' F2: the turns the graph grows with (idx 0..8). */
export const ALL_MOVES: Move[] = [];
for (const b of BASE) {
  const q = quarterPerm(b.ax);
  const base = { ax: b.ax, sel: 1 as const, face: b.f, kind: 'turn' as const, idx: 0 };
  ALL_MOVES.push({ ...base, name: b.n, q: 1, turns: 1, perm: q });
  ALL_MOVES.push({ ...base, name: b.n + "'", q: -1, turns: -1, perm: powerPerm(q, 3) });
  ALL_MOVES.push({ ...base, name: b.n + '2', q: 2, turns: 2, perm: powerPerm(q, 2) });
}
ALL_MOVES.forEach((m, i) => { m.idx = i; });

export function inverseOf(mv: Move): Move {
  const t = mv.turns === 2 ? 2 : -mv.turns;
  return ALL_MOVES.find(m => m.ax === mv.ax && m.turns === t)!;
}
export function applyMove(key: Key, mv: Permutation): Key {
  const out = new Array<number>(24);
  for (let s = 0; s < 24; s++) out[mv.perm[s]] = key.charCodeAt(s);
  return String.fromCharCode.apply(null, out);
}
export const SOLVED: Key = SLOTS.map(s => String(s.f)).join('');

function makeMove(name: string, ax: Axis, sel: 1 | -1 | 0, q: number, face: number, kind: Move['kind']): Move {
  return { name, ax, sel, q, face, kind, turns: q, idx: -1, perm: powerPerm(quarterPerm(ax, sel), ((q % 4) + 4) % 4) };
}
// D, L, B turn clockwise as seen from below, the left and the back.
export const OPP: readonly { n: string; ax: Axis; f: number }[] = [{ n: 'D', ax: 1, f: 1 }, { n: 'L', ax: 0, f: 3 }, { n: 'B', ax: 2, f: 5 }];
export const OPP_MOVES: Move[] = [];
for (const b of OPP) OPP_MOVES.push(makeMove(b.n, b.ax, -1, -1, b.f, 'turn'), makeMove(b.n + "'", b.ax, -1, 1, b.f, 'turn'), makeMove(b.n + '2', b.ax, -1, 2, b.f, 'turn'));
// Whole-cube rotations x, y, z follow R, U, F.
export const ROT_MOVES: Move[] = [];
for (const [n, ax] of [['x', 0], ['y', 1], ['z', 2]] as const) ROT_MOVES.push(makeMove(n, ax, 0, 1, -1, 'rot'), makeMove(n + "'", ax, 0, -1, -1, 'rot'), makeMove(n + '2', ax, 0, 2, -1, 'rot'));

export interface Orientation { perm: number[]; seq: Move[] }
/** The 24 orientations, each with a shortest rotation sequence that produces it (identity first). */
export const ORIENTS: Orientation[] = (function () {
  const id = Array.from({ length: 24 }, (_, i) => String.fromCharCode(65 + i)).join('');
  const seqs = new Map<string, Move[]>([[id, []]]), order = [id];
  for (let h = 0; h < order.length; h++) for (const r of ROT_MOVES) {
    const k = applyMove(order[h], r);
    if (!seqs.has(k)) { seqs.set(k, seqs.get(order[h])!.concat([r])); order.push(k); }
  }
  return order.map(k => { const perm = new Array<number>(24); for (let t = 0; t < 24; t++) perm[k.charCodeAt(t) - 65] = t; return { perm, seq: seqs.get(k)! }; });
})();

// Canonical form: rotate until the yellow-orange-blue corner sits at DLB with yellow down.
export const DLB: readonly number[] = [slotIndex([-1, -1, -1], [0, -1, 0]), slotIndex([-1, -1, -1], [-1, 0, 0]), slotIndex([-1, -1, -1], [0, 0, -1])];
export function canonical(key: Key): { key: Key; seq: Move[] } {
  for (const o of ORIENTS) {
    const k = applyMove(key, o);
    if (k[DLB[0]] === '1' && k[DLB[1]] === '3' && k[DLB[2]] === '5') return { key: k, seq: o.seq };
  }
  return { key, seq: [] };
}
