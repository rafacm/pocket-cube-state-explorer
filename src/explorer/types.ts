// The state of one explorer instance. Everything that used to be a top-level variable of the page
// script lives here, grouped by the part of the explorer that owns it; modules are plain functions
// that take the explorer as their first argument.
import type * as THREE from 'three';
import type { Key, Move } from '../model';
import type { Elements } from '../ui/elements';
import type { Graph, GNode } from '../graph/graph';
import type { Rng } from './rng';
import type { ColorMode, View } from './settings';
import type { Theme, ThemeMode } from './theme';
import type { GraphScene } from '../render/scene';
import type { LiveCube } from '../cube/live-cube';
import type { Dots, Job } from '../outer/dots';
import type { Bundles } from '../outer/bundles';
import type { Detail } from '../render/detail';
import type { Labels } from '../render/labels';

export interface Point { x: number; y: number; z: number }
/** A dot of an outer layer, located for flying or highlighting. */
export interface DotPoint extends Point { size: number; dot: true }
/** A dot under the pointer, drawn as a cube up close. */
export interface DotHover extends Point { size: number; depth: number; code: number; dotIdx: number }
export type Hover = GNode | DotHover;
/** A route segment to draw as a tube: from, to, colour (0 = route 1, 1 = route 2), thickness. */
export type Highlight = [Point, Point, 0 | 1, number];

/** A state of an outer layer (or one not drawn yet) with one shortest route to it. */
export interface Located { code: number; depth: number; route: Move[] }

export interface Loop { A: GNode[]; B: GNode[]; k: number; n: GNode; len: number }

export interface Selection {
  /** false after deselecting: the cube keeps its state, but nothing is highlighted */
  on: boolean;
  /** the current state as a cube-layer node */
  node: GNode | null;
  /** ... or as a dot of a finished outer layer */
  dot: Located | null;
  /** ... or as a state that is not drawn yet, when its distance is known */
  free: Located | null;
  loop: Loop | null;
  highlight: Highlight[];
  // Boxed turn labels show only for a state the user clicked in the graph (and for the states reached
  // by clicking those boxes). Any other change of state hides them.
  boxKey: Key | null;
  keepBox: boolean;
  boxOn: boolean;
}

export interface Flight { t0: number; dur: number; fromT: THREE.Vector3; toT: THREE.Vector3; fromP: THREE.Vector3; toP: THREE.Vector3 }

export interface CameraState {
  /** distance the camera eases to after growth; null when the user has taken over */
  fitDist: number | null;
  flight: Flight | null;
  /** fly to the current state once the cube has finished moving */
  flyWhenDone: boolean;
  spaceDown: boolean;
  overStage: boolean;
}

export interface Pointer {
  hover: Hover | null;
  inside: boolean;
  /** pointer position in the stage, CSS pixels */
  mx: number; my: number;
  downX: number; downY: number;
  needPick: boolean;
}

export interface Growth {
  growing: boolean;
  auto: boolean;
  settledAt: number;
  busyShown: string;
  /** the most layers this explorer may add (an embed can set fewer than all) */
  maxLayers: number;
  /** layers the user agreed to add after a heads-up on a constrained device */
  agreed: Set<number>;
  /** the device could not hold the outer layers: growth stops at the cube layers */
  outOfMemory: boolean;
}

export type ToolsTab = 'find' | 'turn' | 'view' | 'data' | 'about';

/** The controls on the stage (src/ui/controls.ts). */
export interface Controls {
  /** the selection card shows once the user has picked or moved to a state, until they deselect */
  cardWanted: boolean;
  cardCollapsed: boolean;
  coachDismissed: boolean;
  toolsOpen: boolean;
  tab: ToolsTab;
  /** frame-time watchdog: smoothed frame time, since when it has been slow, and whether we asked */
  frameMs: number;
  slowSince: number;
  slowAsked: boolean;
  /** what the heads-up's "Add it" does */
  headsYes: (() => void) | null;
}

export interface Explorer {
  container: HTMLElement;
  el: Elements;
  theme: Theme;
  themeMode: ThemeMode;
  /** told the theme setting and the scheme in effect after every theme change */
  onTheme: ((mode: ThemeMode, scheme: 'light' | 'dark') => void) | null;
  reducedMotion: boolean;

  // settings
  halfTurns: boolean;
  view: View;
  labelAll: boolean;
  colorMode: ColorMode;

  // drawing only when something changes: set renderDirty when changing anything visible without input
  renderDirty: boolean;
  cubeDirty: boolean;
  lastEventAt: number;

  rng: Rng;
  /** sphere radius of each layer */
  radii: number[];
  graph: Graph;
  gs: GraphScene;
  cube: LiveCube;
  sel: Selection;
  cam: CameraState;
  pointer: Pointer;
  growth: Growth;
  ui: Controls;

  /** the outer layers (null until the first one is grown) and the layer being built */
  dots: Dots | null;
  job: Job | null;
  bundles: Bundles;
  detail: Detail;
  labels: Labels;

  /** distances of all states, for finding states outside the drawn graph */
  fullDist: Uint8Array | null;
  fullDistHalf: boolean | null;

  frameId: number;
  destroyed: boolean;
  /** undoes listeners and observers on destroy() */
  cleanup: (() => void)[];
}
