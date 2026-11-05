// Sphere radii. Every layer gets a sphere big enough for its states: cube layers so that their cubes
// sit about CUBE_SPACING apart, dot layers so that the most crowded patch keeps DOT_SPACING (the dot
// radii here are estimates; each is set when its layer is arranged). Radii also grow steadily, so the
// gaps between layers look alike from the centre outwards.
import { fullMax, maxDepth, totals } from '../explorer/settings';

export const DOT_SPACING = 9, CUBE_SPACING = 11.25;

/** Fills `radii` (index = layer) with the starting radii for the metric. */
export function computeRadii(radii: number[], halfTurns: boolean): void {
  const tot = totals(halfTurns), F = fullMax(halfTurns), M = maxDepth(halfTurns);
  radii.length = 0; radii.push(0, 40);
  for (let d = 2; d <= M; d++) {
    const even = Math.sqrt(tot[d] / (4 * Math.PI));
    radii.push(d <= F ? Math.max(radii[d - 1] + 50, radii[d - 1] * 1.25, CUBE_SPACING * even)
                      : Math.max(radii[d - 1] * 1.25, DOT_SPACING * even * 1.3));
  }
}

/** Average distance between neighbouring states of layer d if they were spread evenly. */
export function layerSpacing(radii: readonly number[], halfTurns: boolean, d: number): number {
  const R = radii[Math.min(d, radii.length - 1)], c = Math.max(1, totals(halfTurns)[d] || 1);
  return Math.sqrt(4 * Math.PI * R * R / c);
}

/** The camera distance that shows everything up to layer `depth`. */
export function fitDistance(radii: readonly number[], depth: number): number {
  return (radii[Math.min(depth, radii.length - 1)] + 26) * 2.55 + 40;
}
