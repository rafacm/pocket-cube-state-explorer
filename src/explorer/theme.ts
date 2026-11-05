// Colours for the 3D scenes, read from the CSS custom properties (design tokens) on the explorer's
// element, so the page's styles and the WebGL drawing share one palette.
import * as THREE from 'three';

/** 'system' follows the device's light or dark setting. */
export type ThemeMode = 'system' | 'light' | 'dark';
export const THEME_MODES: readonly ThemeMode[] = ['system', 'light', 'dark'];

export interface Theme {
  stage: THREE.Color;
  /** sticker colours, by colour number (U D R L F B) */
  sticker: THREE.Color[];
  /** CSS colour of the links for each turning face (U = 0, R = 2, F = 4) */
  faceCss: Record<number, string>;
  edge: Record<number, THREE.Color>;
  route1: THREE.Color;
  route2: THREE.Color;
  ink: THREE.Color;
  cubeBody: THREE.Color;
}

export function readTheme(el: Element): Theme {
  const css = getComputedStyle(el);
  const tok = (name: string) => css.getPropertyValue(name).trim();
  const faceCss: Record<number, string> = { 0: tok('--e-U'), 2: tok('--e-R'), 4: tok('--e-F') };
  return {
    stage: new THREE.Color(tok('--stage') || '#F6F4EF'),
    sticker: ['--c-U', '--c-D', '--c-R', '--c-L', '--c-F', '--c-B'].map(t => new THREE.Color(tok(t))),
    faceCss,
    edge: { 0: new THREE.Color(faceCss[0]), 2: new THREE.Color(faceCss[2]), 4: new THREE.Color(faceCss[4]) },
    route1: new THREE.Color(tok('--route1')),
    route2: new THREE.Color(tok('--route2')),
    ink: new THREE.Color(tok('--stage-ink')),
    cubeBody: new THREE.Color(tok('--cube-body') || '#16181D'),
  };
}

/** Whether the element shows its light or its dark colours now. */
export function schemeOf(el: Element): 'light' | 'dark' {
  return getComputedStyle(el).colorScheme.includes('dark') ? 'dark' : 'light';
}
