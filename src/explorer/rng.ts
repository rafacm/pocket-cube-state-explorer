// Deterministic random numbers (mulberry32), so the layout is the same on every visit.
export const LAYOUT_SEED = 20261103;

export class Rng {
  seed: number;
  constructor(seed = LAYOUT_SEED) { this.seed = seed; }
  reset(seed = LAYOUT_SEED): void { this.seed = seed; }
  /** A number in [0, 1). */
  next(): number {
    let s = this.seed | 0;
    s = s + 0x6D2B79F5 | 0; this.seed = s;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}
