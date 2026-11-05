// Bundled links between dot layers.
// Zoomed out, the millions of links between dot layers are summed per pair of regions (each sphere cut
// into 6 x 10 x 10 regions) and the busiest pairs are drawn as single lines, darker the more links they
// carry. Tree links and extra links are bundled separately, so the view switch applies to them too.
import * as THREE from 'three';
import { NORI, NPERM, OT, PT } from '../model';
import { activeMoves, fullMax } from '../explorer/settings';
import type { Explorer } from '../explorer/types';
import type { Theme } from '../explorer/theme';
import { FUV, faceUV } from './placement';
import { applyView } from '../ui/panel';

const BC = 10, BNP = 6 * BC * BC, BUNDLE_MAX = 2500;

export interface BundleLines {
  pos: Float32Array; col: Float32Array;
  pa: THREE.BufferAttribute; ca: THREE.BufferAttribute;
  g: THREE.BufferGeometry; l: THREE.LineSegments;
  n: number; color: THREE.Color;
}
export interface Bundles { tree: BundleLines; extra: BundleLines }

function bundlePatch(x: number, y: number, z: number): number {
  faceUV(x, y, z);
  const iu = Math.min(BC - 1, Math.max(0, Math.floor((FUV[1] + 1) / 2 * BC))), iv = Math.min(BC - 1, Math.max(0, Math.floor((FUV[2] + 1) / 2 * BC)));
  return (FUV[0] * BC + iu) * BC + iv;
}

function makeBundleLines(scene: THREE.Scene, color: THREE.Color): BundleLines {
  const cap = BUNDLE_MAX * 8;
  const pos = new Float32Array(cap * 6), col = new Float32Array(cap * 6), g = new THREE.BufferGeometry();
  const pa = new THREE.BufferAttribute(pos, 3), ca = new THREE.BufferAttribute(col, 3);
  g.setAttribute('position', pa); g.setAttribute('color', ca); g.setDrawRange(0, 0);
  const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false }));
  l.frustumCulled = false; scene.add(l);
  return { pos, col, pa, ca, g, l, n: 0, color: color.clone() };
}

export function createBundles(scene: THREE.Scene, theme: Theme): Bundles {
  return { tree: makeBundleLines(scene, theme.ink), extra: makeBundleLines(scene, theme.route1) };
}

export function clearBundles(x: Explorer): void {
  const B = x.bundles;
  B.tree.g.setDrawRange(0, 0); B.extra.g.setDrawRange(0, 0); B.tree.n = B.extra.n = 0;
}

/** Bundles the links between the finished dot layer nd and the layer inside it. */
export function buildBundles(x: Explorer, nd: number): void {
  const D = x.dots!, d = nd - 1, o = D.off[nd], N = D.cnt[nd], P = D.pos, R1 = x.radii[d], R2 = x.radii[nd];
  const nodes = x.graph.nodes, STAGE = x.theme.stage;
  // regions of the new layer, and their centres
  const cen2 = new Float64Array(BNP * 3);
  for (let k = 0; k < N; k++) { const i = o + k, b = bundlePatch(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); D.patch[i] = b; cen2[b * 3] += P[i * 3]; cen2[b * 3 + 1] += P[i * 3 + 1]; cen2[b * 3 + 2] += P[i * 3 + 2]; }
  // regions of the layer inside, and their centres
  const cen1 = new Float64Array(BNP * 3), patchOf = (code: number) => {
    const j = D.map[code];
    if (j <= -2) { const n = nodes[-2 - j]; if (n.bp == null) n.bp = bundlePatch(n.x, n.y, n.z); return n.bp; }
    return D.patch[j];
  };
  if (d <= fullMax(x.halfTurns)) for (const n of x.graph.layerNodes[d] || []) { n.bp = bundlePatch(n.x, n.y, n.z); cen1[n.bp * 3] += n.x; cen1[n.bp * 3 + 1] += n.y; cen1[n.bp * 3 + 2] += n.z; }
  else for (let k = 0, od = D.off[d]; k < D.cnt[d]; k++) { const i = od + k, b = D.patch[i]; cen1[b * 3] += P[i * 3]; cen1[b * 3 + 1] += P[i * 3 + 1]; cen1[b * 3 + 2] += P[i * 3 + 2]; }
  // sum the links per pair of regions
  const tree = new Int32Array(BNP * BNP), extra = new Int32Array(BNP * BNP), mv = activeMoves(x.halfTurns).map(m => m.idx);
  for (let k = 0; k < N; k++) {
    const i = o + k, c = D.codes[i], par = D.parent[i], b2 = D.patch[i], p = (c / NORI) | 0, oo = c - p * NORI;
    for (const m of mv) {
      const nc = PT[m * NPERM + p] * NORI + OT[m * NORI + oo];
      if (D.dist[nc] !== d) continue;
      const cell = patchOf(nc) * BNP + b2;
      if (nc === par) tree[cell]++; else extra[cell]++;
    }
  }
  const pick = (arr: Int32Array): [number, number][] => {
    const out: number[] = [];
    for (let c = 0; c < arr.length; c++) if (arr[c]) out.push(c);
    out.sort((a, b) => arr[b] - arr[a]);
    return out.slice(0, BUNDLE_MAX).map(c => [c, arr[c]]);
  };
  const add = (L: BundleLines, list: [number, number][]) => {
    if (!list.length) return;
    const lmax = Math.log(list[0][1] + 1);
    for (const [c, cnt] of list) {
      if (L.n >= BUNDLE_MAX * 8) break;
      const a = Math.floor(c / BNP), b = c % BNP, q = L.n * 6;
      const la = Math.hypot(cen1[a * 3], cen1[a * 3 + 1], cen1[a * 3 + 2]) || 1, lb = Math.hypot(cen2[b * 3], cen2[b * 3 + 1], cen2[b * 3 + 2]) || 1;
      L.pos[q] = cen1[a * 3] / la * R1; L.pos[q + 1] = cen1[a * 3 + 1] / la * R1; L.pos[q + 2] = cen1[a * 3 + 2] / la * R1;
      L.pos[q + 3] = cen2[b * 3] / lb * R2; L.pos[q + 4] = cen2[b * 3 + 1] / lb * R2; L.pos[q + 5] = cen2[b * 3 + 2] / lb * R2;
      const t = 0.12 + 0.7 * Math.log(cnt + 1) / lmax;
      for (const v of [q, q + 3]) { L.col[v] = STAGE.r + (L.color.r - STAGE.r) * t; L.col[v + 1] = STAGE.g + (L.color.g - STAGE.g) * t; L.col[v + 2] = STAGE.b + (L.color.b - STAGE.b) * t; }
      L.n++;
    }
    L.pa.needsUpdate = true; L.ca.needsUpdate = true; L.g.setDrawRange(0, L.n * 2);
  };
  add(x.bundles.tree, pick(tree)); add(x.bundles.extra, pick(extra));
  D.bundles[nd] = true;
  applyView(x);
}
