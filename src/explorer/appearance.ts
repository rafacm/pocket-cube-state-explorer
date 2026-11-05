// Light, dark or system theme: the page's colours come from CSS tokens (src/styles/tokens.css), and the
// 3D scenes are recoloured from the same tokens whenever the theme changes.
import * as THREE from 'three';
import type { Explorer } from './types';
import { readTheme, schemeOf, type ThemeMode } from './theme';
import { paintCube } from '../cube/live-cube';
import { recolourBundles } from '../outer/bundles';
import { repaintAll } from '../outer/colors';
import { resetLabelColours } from '../render/labels';

/** Sets the theme ('system' follows the device) and recolours everything drawn. */
export function setThemeMode(x: Explorer, mode: ThemeMode): void {
  x.themeMode = mode;
  const root = x.el.pcse;
  if (mode === 'system') delete root.dataset.theme; else root.dataset.theme = mode;
  x.el.themeButtons.forEach(b => b.setAttribute('aria-pressed', b.dataset.themeMode === mode ? 'true' : 'false'));
  refreshTheme(x);
}

/** Reads the tokens again and recolours the 3D scenes to match (after a theme or system change). */
export function refreshTheme(x: Explorer): void {
  const t = readTheme(x.el.pcse), gs = x.gs, c = x.cube;
  x.theme = t;
  gs.renderer.setClearColor(t.stage);
  c.renderer.setClearColor(t.stage);
  gs.nodeMat.uniforms.uPal.value = t.sticker;
  gs.nodeMat.uniforms.uBody.value = t.cubeBody;
  gs.tubeMats[0].color.copy(t.route1); gs.tubeMats[1].color.copy(t.route2);
  (gs.selMark.material as THREE.LineBasicMaterial).color.copy(t.route1);
  (gs.hovMark.material as THREE.LineBasicMaterial).color.copy(t.ink);
  for (const L of [gs.treeL, gs.crossL]) {
    L.list.forEach((e, j) => { const k = t.edge[e.mv.face]; L.col.set([k.r, k.g, k.b, k.r, k.g, k.b], j * 6); });
    L.ca.needsUpdate = true;
  }
  recolourBundles(x);
  c.bodyMat.color.copy(t.cubeBody);
  paintCube(x, c.key);
  repaintAll(x);              // dots coloured by layer use the route colours
  x.detail.dirty = true;      // links of the zoomed-in cubes are rebuilt with the new colours
  resetLabelColours(x);
  x.renderDirty = true; x.cubeDirty = true;
  x.onTheme?.(x.themeMode, schemeOf(x.el.pcse));
}
