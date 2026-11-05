// createExplorer(container): renders the Pocket Cube State Explorer into an element and runs it.
// Everything it needs lives in one Explorer object (src/explorer/types.ts); destroy() stops it and
// frees its WebGL resources and listeners, so it can be mounted and unmounted like any component.
import template from './ui/template.html?raw';
import { findElements } from './ui/elements';
import { readTheme } from './explorer/theme';
import { Rng } from './explorer/rng';
import type { Explorer } from './explorer/types';
import { listen } from './explorer/events';
import { startFrames } from './explorer/frame';
import { startOver } from './explorer/grow';
import { createGraph } from './graph/graph';
import { computeRadii } from './graph/radii';
import { createGraphScene, disposeGraphScene } from './render/scene';
import { createDetail } from './render/detail';
import { createLabels } from './render/labels';
import { bindNavigation } from './render/navigation';
import { bindPicking } from './render/picking';
import { createLiveCube, disposeLiveCube, paintCube } from './cube/live-cube';
import { createBundles } from './outer/bundles';
import { freeDots } from './outer/dots';
import { applyView, bindPanel } from './ui/panel';
import { bindFind } from './ui/find';
import { bindCopy, buildNet } from './ui/net';

export interface ExplorerOptions {
  /**
   * Where keyboard shortcuts (Esc to deselect) work: 'page' anywhere on the page, for a page that is
   * only the explorer; 'explorer' (the default) only inside it, for an explorer embedded in a page.
   * Space-to-pan always needs the pointer over the 3D stage.
   */
  keyboard?: 'page' | 'explorer';
}

export interface ExplorerHandle {
  /** Stops the explorer, removes its listeners and frees its WebGL resources. */
  destroy(): void;
}

/** Can this browser draw with WebGL at all? (A throwaway canvas, released at once.) */
export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

const SITE = 'https://pocket-cube-state-explorer.vercel.app';
/** What shows instead of the explorer when the browser cannot draw it. */
function showNoWebGL(container: HTMLElement, why: string): ExplorerHandle {
  container.innerHTML = `<div class="pcse"><div class="app nogl" role="alert">
    <div class="nogl-box">
      <h2>This explorer needs 3D graphics</h2>
      <p>${why} Try a recent Chrome, Edge, Firefox or Safari with hardware acceleration turned on.</p>
      <img src="${SITE}/og.jpg" alt="What the explorer shows: the solved cube and the states one and two turns away, joined by links labelled with their turns." width="600" height="315">
      <p><a href="${SITE}/" target="_blank" rel="noopener">Open the Pocket Cube State Explorer</a></p>
    </div>
  </div></div>`;
  return { destroy() { container.innerHTML = ''; } };
}

export function createExplorer(container: HTMLElement, options: ExplorerOptions = {}): ExplorerHandle {
  let inner: ExplorerHandle | null = null;
  const start = () => {
    if (!webglAvailable()) { inner = showNoWebGL(container, 'Your browser has WebGL (3D graphics) turned off or unavailable, so the graph of 3,674,160 cube states cannot be drawn here.'); return; }
    try {
      inner = mount(container, options, restart);
    } catch (err) {
      console.error('Pocket Cube State Explorer could not start', err);
      inner = showNoWebGL(container, 'The explorer could not start its 3D graphics on this device.');
    }
  };
  const restart = () => { inner?.destroy(); inner = null; start(); };
  start();
  return { destroy() { inner?.destroy(); inner = null; } };
}

function mount(container: HTMLElement, options: ExplorerOptions, restart: () => void): ExplorerHandle {
  container.innerHTML = template;
  const el = findElements(container);
  const theme = readTheme(container);
  const reducedMotion = !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gs = createGraphScene(el.graph, theme, reducedMotion);
  const radii: number[] = [];
  computeRadii(radii, false);
  const x: Explorer = {
    container, el, theme, reducedMotion,
    halfTurns: false, view: 'all', labelAll: true, colorMode: 'routes',
    renderDirty: true, cubeDirty: true, lastEventAt: 0,
    rng: new Rng(), radii, graph: createGraph(), gs, cube: createLiveCube(el.cube, theme),
    sel: { on: true, node: null, dot: null, free: null, loop: null, highlight: [], boxKey: null, keepBox: false, boxOn: false },
    cam: { fitDist: null, flight: null, flyWhenDone: false, spaceDown: false, overStage: false },
    pointer: { hover: null, inside: false, mx: 0, my: 0, downX: 0, downY: 0, needPick: false },
    growth: { growing: false, auto: false, settledAt: 0, busyShown: '' },
    dots: null, job: null,
    bundles: createBundles(gs.scene, theme),
    detail: createDetail(gs.scene, gs.nodeMat),
    labels: createLabels(),
    fullDist: null, fullDistHalf: null,
    frameId: 0, destroyed: false, cleanup: [],
  };
  paintCube(x, x.cube.key);

  bindNavigation(x, { keyboard: options.keyboard ?? 'explorer' });
  bindPicking(x);
  bindPanel(x);
  bindFind(x);
  bindCopy(x);
  buildNet(x);
  // any input inside the explorer keeps it drawing for a moment (see explorer/frame.ts)
  for (const ev of ['pointermove', 'pointerdown', 'pointerup', 'wheel', 'keydown', 'keyup', 'input', 'change', 'click'])
    listen(x, container, ev, () => { x.lastEventAt = performance.now(); }, { capture: true, passive: true });

  const resize = () => {
    x.renderDirty = true; x.cubeDirty = true;
    const w = el.stage.clientWidth, h = el.stage.clientHeight;
    if (w && h) { gs.renderer.setSize(w, h, false); gs.cam.aspect = w / h; gs.cam.updateProjectionMatrix(); }
    const c = x.cube, cw = el.cubebox.clientWidth, ch = el.cubebox.clientHeight;
    if (cw && ch) { c.renderer.setSize(cw, ch, false); c.cam.aspect = cw / ch; c.cam.updateProjectionMatrix(); }
  };
  const ro = new ResizeObserver(resize);
  ro.observe(el.stage); ro.observe(el.cubebox);
  x.cleanup.push(() => ro.disconnect());
  resize();

  // The browser may take the GPU away (memory pressure on phones, a driver reset, a long time in the
  // background). Three.js restores the scene by itself when the context comes back; if it does not,
  // offer to start the explorer again.
  let lostTimer = 0, lostCount = 0;
  const onLost = (e: Event) => {
    e.preventDefault(); // allows the context to be restored
    lostCount++;
    el.lostText.textContent = 'The browser reset the 3D graphics. Restoring…';
    el.btnRestart.hidden = true; el.lost.hidden = false;
    clearTimeout(lostTimer);
    lostTimer = window.setTimeout(() => {
      el.lostText.textContent = 'The 3D graphics did not come back. Starting again redraws the graph from the solved cube.';
      el.btnRestart.hidden = false; el.btnRestart.focus();
    }, 4000);
  };
  const onRestored = () => {
    if (--lostCount > 0) return;
    lostCount = 0; clearTimeout(lostTimer);
    el.lost.hidden = true; x.renderDirty = true; x.cubeDirty = true;
  };
  for (const canvas of [el.graph, el.cube]) {
    listen(x, canvas, 'webglcontextlost', onLost);
    listen(x, canvas, 'webglcontextrestored', onRestored);
  }
  listen(x, el.btnRestart, 'click', () => restart());
  x.cleanup.push(() => clearTimeout(lostTimer));

  applyView(x);
  startOver(x);
  startFrames(x);

  return {
    destroy() {
      if (x.destroyed) return;
      x.destroyed = true;
      cancelAnimationFrame(x.frameId);
      for (const undo of x.cleanup.splice(0)) undo();
      freeDots(x);
      disposeGraphScene(gs);
      disposeLiveCube(x.cube);
      x.fullDist = null;
      container.innerHTML = '';
    },
  };
}
