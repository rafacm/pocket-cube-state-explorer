// The instrument panel: move pads, link views and colouring, growth controls, totals, the layer census
// and the routes-in chart.
import { ALL_MOVES, BASE, FACE_NAME, NSTATE, OPP, OPP_MOVES, ROT_MOVES, type Move } from '../model';
import { fmt, fullMax, maxDepth, totals, type ColorMode, type View } from '../explorer/settings';
import type { Explorer } from '../explorer/types';
import { onState } from '../explorer/selection';
import { currentPoint, dotPoint } from '../explorer/locate';
import { listen } from '../explorer/events';
import { grow, setAuto, startOver } from '../explorer/grow';
import { busy } from '../cube/live-cube';
import { SPEEDS, goHome, jumpTo, normalize, playFromSolved, queueMove, walkLoop } from '../cube/walks';
import { shownIn, totalEdges, totalStates } from '../outer/dots';
import { PIN_COLORS, cubeHist, repaintAll } from '../outer/colors';
import { flyHome, flyTo } from '../render/navigation';
import { twoRouteState } from './routes';

function padButton(x: Explorer, mv: Move): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = mv.kind === 'rot' ? 'mv rot' : 'mv';
  btn.setAttribute('aria-label', (mv.kind === 'rot' ? 'Rotate the whole cube ' : 'Turn ') + mv.name);
  btn.innerHTML = (mv.kind === 'rot' ? '' : '<span class="sw" style="--sw:var(--c-' + FACE_NAME[mv.face] + ')"></span>') + mv.name;
  btn.addEventListener('click', () => queueMove(x, mv));
  return btn;
}
/** The move pads: U R F with D L B beside them (and half turns when they count), and x y z. */
export function buildPad(x: Explorer): void {
  const pad = x.el.pad; pad.innerHTML = '';
  const ok = (m: Move) => x.halfTurns || m.q !== 2;
  pad.style.gridTemplateColumns = 'repeat(' + (x.halfTurns ? 6 : 4) + ', minmax(0, 1fr))';
  for (let i = 0; i < 3; i++) {
    ALL_MOVES.filter(m => m.ax === BASE[i].ax && ok(m)).forEach(m => pad.appendChild(padButton(x, m)));
    OPP_MOVES.filter(m => m.ax === OPP[i].ax && ok(m)).forEach(m => pad.appendChild(padButton(x, m)));
  }
  const rp = x.el.padRot; rp.innerHTML = '';
  ROT_MOVES.filter(m => m.q !== 2).forEach(m => rp.appendChild(padButton(x, m)));
}

/** Everything in the panel that depends on how far the graph has grown. */
export function refreshUI(x: Explorer): void {
  const max = maxDepth(x.halfTurns), tot = totals(x.halfTurns), el = x.el, depthShown = x.graph.depthShown;
  renderTotals(x);
  applyView(x);
  el.labelsText.textContent = 'Label links with their turns (labels appear as you zoom close enough to read them)';
  x.labels.dirty = true;
  const g = el.btnGrow;
  if (depthShown >= max) {
    g.textContent = 'All ' + max + ' layers grown'; g.disabled = true; x.growth.auto = false;
    el.growNote.textContent = 'Every one of the ' + fmt(NSTATE) + ' states is drawn. None is more than ' + max + (x.halfTurns ? ' moves' : ' quarter turns') + ' from solved.';
    setAuto(x, false);
  } else {
    g.textContent = 'Grow layer ' + (depthShown + 1); g.disabled = x.growth.growing;
    const add = tot[depthShown + 1], asDots = depthShown + 1 > fullMax(x.halfTurns);
    el.growNote.textContent = 'Adds ' + fmt(add) + ' new states' + (asDots ? ', drawn as dots.' : '.') +
      (!asDots && add > 20000 ? ' The layout takes several seconds to settle.' : !asDots && add > 5000 ? ' The layout takes a few seconds to settle.' : '');
  }
  renderCensus(x);
  renderRoutesIn(x);
  onState(x);
}

function drawnIn(x: Explorer, d: number): number {
  const F = fullMax(x.halfTurns);
  if (d <= Math.min(x.graph.depthShown, F)) return totals(x.halfTurns)[d];
  return d > F ? shownIn(x, d) : 0;
}

export function renderTotals(x: Explorer): void {
  const n = totalStates(x), e = totalEdges(x), extra = e - (n - 1), el = x.el;
  el.statStates.textContent = fmt(n);
  el.statEdges.textContent = 'states · ' + fmt(e) + ' links';
  el.statLoops.textContent = fmt(extra) + ' independent loops';
  el.figTree.textContent = fmt(n - 1);
  el.figExtra.textContent = fmt(extra);
  el.figLoops.textContent = fmt(extra);
}

/** The table of layers: how many states each holds and how many are drawn. */
export function renderCensus(x: Explorer): void {
  const tot = totals(x.halfTurns), F = fullMax(x.halfTurns), lmax = Math.log10(Math.max(...tot) + 1), job = x.job, depthShown = x.graph.depthShown;
  x.el.census.innerHTML = tot.map((t, d) => {
    const dr = drawnIn(x, d), done = dr === t && dr > 0, active = job && job.nd === d;
    const cls = (done ? 'done' : '') + (d === depthShown && !job ? ' cur' : '') + (active ? ' cur' : '');
    const w = (Math.log10(t + 1) / lmax * 100).toFixed(1), fw = (dr / t * 100).toFixed(1);
    const kind = d > F ? ' <span class="dotmark" title="drawn as dots"></span>' : '';
    return '<tr class="' + cls + '"><td>' + d + kind + (d === tot.length - 1 ? ' <span style="color:var(--muted)">max</span>' : '') + '</td><td class="n">' + (dr ? fmt(dr) : '–') +
      '</td><td class="n">' + fmt(t) + '</td><td class="barcell"><div class="track" style="width:' + w + '%"><div class="fill" style="width:' + fw + '%"></div></div></td></tr>';
  }).join('');
}

/** Routes into each state, by layer: stacked bars of the routes-in histogram. */
export function renderRoutesIn(x: Explorer): void {
  const rows: string[] = [];
  for (let d = 2; d <= x.graph.depthShown; d++) {
    const h = d <= fullMax(x.halfTurns) ? cubeHist(x, d) : x.dots && x.dots.hist[d]; if (!h) continue;
    const tot = h.reduce((a, b) => a + b, 0); if (!tot) continue;
    let mean = 0; h.forEach((c, k) => { mean += c * k; });
    const seg = h.map((c, k) => c && k ? '<i style="width:' + (100 * c / tot).toFixed(2) + '%;background:' + PIN_COLORS[k] + '" title="' + k + (k === 1 ? ' route: ' : ' routes: ') + fmt(c) + ' states"></i>' : '').join('');
    rows.push('<div class="rin"><span>' + d + '</span><div class="rbar">' + seg + '</div><span class="rmean">' + (mean / tot).toFixed(2) + '</span></div>');
  }
  x.el.routesIn.innerHTML = rows.length ? '<div class="rin hd"><span>Layer</span><span></span><span class="rmean">avg</span></div>' + rows.join('') : '<p class="note" style="margin:0">Grow two layers or more to see routes merge.</p>';
}

/** Which links are visible (all, tree, extra; bundles on or off) and how strongly they are drawn. */
export function applyView(x: Explorer): void {
  const { treeL, crossL } = x.gs, B = x.bundles, view = x.view;
  x.renderDirty = true;
  treeL.l.visible = view !== 'extra';
  crossL.l.visible = view !== 'tree';
  const showB = x.el.optBundles.checked;
  B.tree.l.visible = showB && view !== 'extra';
  B.extra.l.visible = showB && view !== 'tree';
  const n = x.graph.nodes.length, dense = n > 12000 ? 2 : n > 2500 ? 1 : 0;
  treeL.mat.opacity = [0.85, 0.6, 0.32][dense];
  crossL.mat.opacity = view === 'extra' ? [0.9, 0.6, 0.3][dense] : [0.3, 0.18, 0.08][dense];
  x.el.viewButtons.forEach(b => b.setAttribute('aria-pressed', b.dataset.view === view ? 'true' : 'false'));
}

export function bindPanel(x: Explorer): void {
  const el = x.el;
  el.viewButtons.forEach(b => listen(x, b, 'click', () => { x.view = b.dataset.view as View; applyView(x); x.detail.dirty = true; x.labels.dirty = true; }));
  el.colorButtons.forEach(b => listen(x, b, 'click', () => {
    x.colorMode = b.dataset.color as ColorMode;
    el.colorButtons.forEach(c => c.setAttribute('aria-pressed', c.dataset.color === x.colorMode ? 'true' : 'false'));
    el.pinLegend.hidden = x.colorMode !== 'routes';
    repaintAll(x);
  }));
  listen(x, el.optBundles, 'change', () => applyView(x));
  listen(x, el.btnGrow, 'click', () => { grow(x); });
  listen(x, el.btnAuto, 'click', () => setAuto(x, !x.growth.auto));
  listen(x, el.btnReset, 'click', () => { setAuto(x, false); startOver(x); });
  listen(x, el.btnHome, 'click', () => { if (busy(x)) { x.cube.queue.length = 0; x.cam.flyWhenDone = false; } else goHome(x); });
  listen(x, el.optHalf, 'change', () => { x.halfTurns = el.optHalf.checked; setAuto(x, false); startOver(x); });
  listen(x, el.optLabels, 'change', () => { x.labelAll = el.optLabels.checked; x.labels.dirty = true; });
  listen(x, el.btnNorm, 'click', () => normalize(x));
  listen(x, el.btnLoop, 'click', () => {
    if (busy(x)) return;
    if (x.sel.node && x.sel.node.paths >= 2) walkLoop(x);
    else { const t = twoRouteState(x); if (t) jumpTo(x, t.key); }
  });
  listen(x, el.btnPlay, 'click', () => playFromSolved(x));
  listen(x, el.optSpeed, 'input', () => { el.speedText.textContent = SPEEDS[+el.optSpeed.value]!.name; });
  listen(x, el.btnZoomCur, 'click', () => {
    const S = x.sel.node || (x.sel.dot && dotPoint(x, x.sel.dot.code));
    if (S) flyTo(x, S);
  });
  listen(x, el.btnZoomAll, 'click', () => flyHome(x));
}

/** After a walk or a find: fly to the current state once the cube stops. Called every frame. */
export function stepPanel(x: Explorer): void {
  if (x.cam.flyWhenDone && !busy(x)) { x.cam.flyWhenDone = false; const P = currentPoint(x); if (P) flyTo(x, P); }
  const hb = x.el.btnHome, hbText = busy(x) ? 'Stop' : 'Solve';
  if (hb.textContent !== hbText) hb.textContent = hbText;
}
