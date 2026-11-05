// The unfolded cube (net) and facelet strings.
import { FACE_AXIS, FACE_SIGN, slotIndex, type Key, type Vec3 } from './cube';

// Net: each face seen from outside, U above F, D below F, then L F R B across. [right, up] per face.
const NET_DIRS: readonly [Vec3, Vec3][] = [[[1, 0, 0], [0, 0, -1]], [[1, 0, 0], [0, 0, 1]], [[0, 0, -1], [0, 1, 0]], [[0, 0, 1], [0, 1, 0]], [[1, 0, 0], [0, 1, 0]], [[-1, 0, 0], [0, 1, 0]]];
/** For each face, its 4 sticker slots read row by row as they appear in the net. */
export const NET_SLOTS: number[][] = [0, 1, 2, 3, 4, 5].map(f => {
  const n: Vec3 = [0, 0, 0]; n[FACE_AXIS[f]] = FACE_SIGN[f];
  const rt = NET_DIRS[f][0], up = NET_DIRS[f][1], out: number[] = [];
  for (const r of [0, 1]) for (const c of [0, 1]) {
    const pp = [0, 1, 2].map(i => n[i] + rt[i] * (c ? 1 : -1) + up[i] * (r ? -1 : 1)) as Vec3;
    out.push(slotIndex(pp, n));
  }
  return out;
});

/** Colour letters, indexed by colour number (U D R L F B = white yellow red orange green blue). */
export const COLOR_LETTER = 'WYROGB';
export const STRING_ORDER: readonly number[] = [0, 2, 4, 1, 3, 5]; // U R F D L B
/** Faces in the order U R F D L B, each read row by row as in the net, e.g. WWWW:RRRR:GGGG:YYYY:OOOO:BBBB. */
export function faceletString(key: Key): string {
  return STRING_ORDER.map(f => NET_SLOTS[f].map(sl => COLOR_LETTER[key.charCodeAt(sl) - 48]).join('')).join(':');
}
