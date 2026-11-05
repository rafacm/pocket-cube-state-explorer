// Growing the graph one layer at a time (and Auto-grow), and starting over.
import { SOLVED } from '../model';
import { activeMoves, fmt, fullMax, maxDepth, totals } from './settings';
import type { Explorer } from './types';
import { expandLayer, resetGraph } from '../graph/expand';
import { computeRadii } from '../graph/radii';
import { abortTurn, paintCube } from '../cube/live-cube';
import { addLinkToScene, addNodeToScene, syncLines } from '../render/scene';
import { fitTo } from '../render/navigation';
import { freeDots, startDotLayer } from '../outer/dots';
import { buildPad, refreshUI, renderCensus } from '../ui/panel';
import { showBusy } from '../ui/status';

/** Adds the next cube layer: its states and links, in the graph and in the scene. */
function growCubeLayer(x: Explorer): void {
  const g = x.graph, D = g.depthShown;
  if (D >= fullMax(x.halfTurns)) return;
  const { fresh, links } = expandLayer(g, activeMoves(x.halfTurns), x.radii, x.halfTurns, x.rng, performance.now());
  for (const n of fresh) addNodeToScene(x.gs, n);
  for (const e of links) addLinkToScene(x.gs, x.theme, e);
  x.gs.nodeMesh.count = g.nodes.length; x.gs.stickAttr.needsUpdate = true;
  syncLines(x.gs);
  const big = fresh.length > 3000;
  g.frozenBelow = big ? D + 1 : Math.max(0, D);
  g.alpha = big ? 0.4 : 1; fitTo(x, g.depthShown);
  x.growth.growing = false;
  refreshUI(x);
}

/** Grow: show what is coming, let the browser paint, then build the layer. */
export function grow(x: Explorer): boolean {
  const g = x.graph;
  if (x.growth.growing || x.job || g.depthShown >= maxDepth(x.halfTurns)) return false;
  x.growth.growing = true;
  const add = totals(x.halfTurns)[g.depthShown + 1];
  x.el.btnGrow.disabled = true;
  const later = (fn: () => void) => requestAnimationFrame(() => setTimeout(() => { if (!x.destroyed) fn(); }, 0));
  if (g.depthShown >= fullMax(x.halfTurns)) {
    showBusy(x, 'Layer ' + (g.depthShown + 1) + ' · preparing…', 0);
    later(() => { startDotLayer(x); renderCensus(x); });
    return true;
  }
  showBusy(x, 'Adding ' + fmt(add) + ' states…', 0);
  later(() => { growCubeLayer(x); g.alpha0 = g.alpha; });
  return true;
}

export function setAuto(x: Explorer, on: boolean): void {
  if (on && x.graph.depthShown >= maxDepth(x.halfTurns)) on = false;
  x.growth.auto = on;
  x.el.btnAuto.setAttribute('aria-pressed', on ? 'true' : 'false');
  if (on && x.graph.alpha < 0.05) grow(x);
}

/** Auto-grow: the next layer once the last one has settled. Called every frame. */
export function stepAuto(x: Explorer, now: number): void {
  const g = x.graph, gr = x.growth;
  if (gr.auto && !gr.growing && !x.job && g.alpha < 0.05 && now - gr.settledAt > 700 && now > g.popUntil + 600) {
    if (g.depthShown >= maxDepth(x.halfTurns)) setAuto(x, false); else grow(x);
  }
}

/** Back to the solved cube alone (also when the metric changes). */
export function startOver(x: Explorer): void {
  const c = x.cube;
  c.queue.length = 0; x.sel.loop = null;
  abortTurn(x);
  x.el.cbMove.classList.remove('on');
  c.key = SOLVED; paintCube(x, c.key);
  x.growth.growing = false; showBusy(x, null); freeDots(x); computeRadii(x.radii, x.halfTurns);
  const root = resetGraph(x.graph, x.rng, performance.now());
  x.gs.treeL.list = []; x.gs.crossL.list = [];
  addNodeToScene(x.gs, root);
  x.gs.nodeMesh.count = 1; x.gs.stickAttr.needsUpdate = true;
  syncLines(x.gs);
  fitTo(x, 0);
  buildPad(x); refreshUI(x);
}
