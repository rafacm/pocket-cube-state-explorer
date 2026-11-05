// Placement maths for the dot layers.
// Directions are mapped to the six faces of a cube (u, v in -1..1). Each face is cut into C x C patches.
// The states that want a patch are laid out on a small grid inside it, ordered by where they want to
// be, so no state moves farther than one patch. The sphere is made just large enough that the most
// crowded patch still keeps its states DOT_SPACING apart.

/** faceUV writes [face, u, v] here (no allocation in the hot loops). */
export const FUV = new Float64Array(3);
/** faceDir writes a unit direction here. */
export const FDIR = new Float64Array(3);

/** The cube-map face (0..5) and position (u, v in -1..1) of direction (x, y, z), into FUV. */
export function faceUV(x: number, y: number, z: number): void {
  const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
  if (ax >= ay && ax >= az) { FUV[0] = x > 0 ? 0 : 1; FUV[1] = y / ax; FUV[2] = z / ax; }
  else if (ay >= az) { FUV[0] = y > 0 ? 2 : 3; FUV[1] = x / ay; FUV[2] = z / ay; }
  else { FUV[0] = z > 0 ? 4 : 5; FUV[1] = x / (az || 1); FUV[2] = y / (az || 1); }
}

/** The unit direction of cube-map face f at (u, v), into FDIR. */
export function faceDir(f: number, u: number, v: number): void {
  const sg = f % 2 === 0 ? 1 : -1;
  let x: number, y: number, z: number;
  if (f < 2) { x = sg; y = u; z = v; } else if (f < 4) { y = sg; x = u; z = v; } else { z = sg; x = u; y = v; }
  const l = Math.sqrt(x * x + y * y + z * z); FDIR[0] = x / l; FDIR[1] = y / l; FDIR[2] = z / l;
}

const EVEN_BANDS = 96, Q = 1048576, IDX = 2097152;
/**
 * Evens out N wanted directions (x, y, z triples in `want`) over the sphere, keeping order: first by
 * height (rank of z, so each band of equal area holds the same number of states), then around each
 * band (rank of angle). Neighbours stay neighbours; only the large-scale crowding goes away.
 */
export function evenOut(want: Float32Array, N: number): void {
  const z = new Float64Array(N), ang = new Float64Array(N), key = new Float64Array(N);
  for (let j = 0; j < N; j++) {
    const x = want[j * 3], y = want[j * 3 + 1], w = want[j * 3 + 2], l = Math.hypot(x, y, w) || 1;
    z[j] = w / l; ang[j] = Math.atan2(y, x);
    key[j] = Math.floor((z[j] + 1) / 2 * (Q - 1)) * IDX + j;
  }
  key.sort();
  const zr = new Float64Array(N), band = new Int32Array(N), per = N / EVEN_BANDS;
  for (let r = 0; r < N; r++) { const j = key[r] % IDX; zr[j] = 2 * (r + 0.5) / N - 1; band[j] = Math.min(EVEN_BANDS - 1, Math.floor(r / per)); }
  for (let j = 0; j < N; j++) key[j] = band[j] * Q * IDX + Math.floor((ang[j] + Math.PI) / (2 * Math.PI) * (Q - 1)) * IDX + j;
  key.sort();
  let r = 0;
  while (r < N) {
    const b = Math.floor(key[r] / (Q * IDX)); let e = r;
    while (e < N && Math.floor(key[e] / (Q * IDX)) === b) e++;
    const n = e - r;
    for (let q = r; q < e; q++) {
      const j = key[q] % IDX, a = 2 * Math.PI * (q - r + 0.5) / n - Math.PI, zz = zr[j], rr = Math.sqrt(Math.max(0, 1 - zz * zz));
      want[j * 3] = rr * Math.cos(a); want[j * 3 + 1] = rr * Math.sin(a); want[j * 3 + 2] = zz;
    }
    r = e;
  }
}
