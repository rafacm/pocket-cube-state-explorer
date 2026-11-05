// Colour by routes in.
// "Routes in" is how many neighbours a state has in the layer inside it, i.e. how many shortest routes
// arrive at it in their last turn. 1 means it hangs off the tree by a single link; more means routes merge.
import * as THREE from 'three';
import { fullMax, maxDepth } from '../explorer/settings';
import { otherEnd } from '../graph/graph';
import type { Explorer } from '../explorer/types';
import { renderRoutesIn } from '../ui/panel';

export const PIN_COLORS = ['#9AA3B5', '#9AA3B5', '#2E9BC6', '#3E63DD', '#7B4FD6', '#C23FA8', '#E0337E', '#E0337E', '#E0337E', '#E0337E'];
const PIN_RGB = PIN_COLORS.map(h => { const c = new THREE.Color(h); return [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)]; });

/** Colour by layer: from blue (first dot layer) to pink (last). */
function layerColor(x: Explorer, d: number): THREE.Color {
  const F = fullMax(x.halfTurns), M = maxDepth(x.halfTurns);
  const t = Math.min(1, Math.max(0, (d - F - 1) / Math.max(1, M - F - 1)));
  return x.theme.route2.clone().lerpHSL(x.theme.route1, t);
}

export function paintLayer(x: Explorer, d: number): void {
  const D = x.dots;
  if (!D || !D.layers[d]) return;
  const o = D.off[d], n = D.cnt[d], C = D.col, P = D.pin;
  if (x.colorMode === 'layer') {
    const lc = layerColor(x, d), r = Math.round(lc.r * 255), g = Math.round(lc.g * 255), b = Math.round(lc.b * 255);
    for (let k = 0; k < n; k++) { const i = (o + k) * 3; C[i] = r; C[i + 1] = g; C[i + 2] = b; }
  } else {
    for (let k = 0; k < n; k++) { const i = (o + k) * 3, c = PIN_RGB[Math.min(9, P[o + k])]; C[i] = c[0]; C[i + 1] = c[1]; C[i + 2] = c[2]; }
  }
  D.layers[d]!.cattr.needsUpdate = true;
}

export function repaintAll(x: Explorer): void {
  x.renderDirty = true;
  if (x.dots) for (let d = fullMax(x.halfTurns) + 1; d <= maxDepth(x.halfTurns); d++) if (x.dots.layers[d]) paintLayer(x, d);
  renderRoutesIn(x);
}

/** Routes-in histogram of a cube layer, straight from its links. */
export function cubeHist(x: Explorer, d: number): number[] {
  const h = new Array<number>(10).fill(0);
  for (const n of x.graph.layerNodes[d] || []) { let k = 0; for (const e of n.adj) if (otherEnd(e, n).depth === d - 1) k++; h[Math.min(9, k)]++; }
  return h;
}
