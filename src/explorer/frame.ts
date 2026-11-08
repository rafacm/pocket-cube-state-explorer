// Drawing only when something changes.
// The explorer redraws only while the camera moves (including its glide after you let go), the layout
// settles, a layer streams in, the camera flies, the cube turns, or you are using it. Idle, it draws
// nothing, so the GPU rests.
import type { Explorer } from './types';
import { tick } from '../graph/layout';
import { stepAuto, stopOutOfMemory } from './grow';
import { finishJob, jobProgress, runJob } from '../outer/dots';
import { stepCube } from '../cube/live-cube';
import { writeGeometry } from '../render/scene';
import { stepCamera } from '../render/navigation';
import { updateDetail } from '../render/detail';
import { placeLabels, updateEdgeLabels } from '../render/labels';
import { updateHover } from '../render/picking';
import { placeMarkers } from '../render/markers';
import { renderCensus, renderTotals, stepPanel } from '../ui/panel';
import { showBusy } from '../ui/status';

/** The automatic spin stops this long after the explorer starts. */
const AUTO_SPIN_MS = 25000;

/** Frames slower than this, for this long, while a layer streams in: offer to stop animating it. */
const SLOW_FRAME_MS = 120, SLOW_FOR_MS = 2500;

function watchFrames(x: Explorer, now: number, dt: number): void {
  const u = x.ui;
  u.frameMs = u.frameMs ? u.frameMs * 0.9 + dt * 0.1 : dt;
  const streaming = !!x.job && x.el.optPace.checked;
  if (!streaming || u.slowAsked || u.frameMs < SLOW_FRAME_MS) { u.slowSince = 0; return; }
  if (!u.slowSince) u.slowSince = now;
  else if (now - u.slowSince > SLOW_FOR_MS && x.el.heads.hidden) { u.slowAsked = true; x.el.slowTip.hidden = false; }
}

/**
 * On Solve's walk with the camera following, cubes between the camera and the state it looks at fade
 * out, so the view down the route stays clear. They fade back in when anything else moves the camera
 * (x.cam.holdFade).
 */
function stepFade(x: Explorer): void {
  const { cam, controls } = x.gs;
  const want = x.cam.holdFade ? cam.position.distanceTo(controls.target) * 0.75 : 0;
  let f = x.cam.fade + (want - x.cam.fade) * 0.08;
  if (Math.abs(want - f) < 0.05) f = want;
  if (f === x.cam.fade) return;
  x.cam.fade = f; x.gs.nodeMat.uniforms.uFade.value = f; x.renderDirty = true;
}

function frameBody(x: Explorer, now: number, startedAt: number): void {
  const g = x.graph, gs = x.gs;
  const moving = g.alpha > 0.004;
  if (moving) {
    tick(g, x.radii, x.halfTurns, x.rng, g.alpha); if (g.nodes.length < 8000) tick(g, x.radii, x.halfTurns, x.rng, g.alpha);
    g.alpha *= g.nodes.length < 8000 ? 0.975 : 0.96;
    if (g.alpha <= 0.004) x.growth.settledAt = now;
  }
  if (x.job) {
    try { runJob(x, 12, now); } catch (err) { stopOutOfMemory(x, err); }
  }
  if (x.job) {
    if (x.job.done) { finishJob(x, now); showBusy(x, null); }
    else {
      jobProgress(x, now);
      if (now - x.job.lastUi > 250) { x.job.lastUi = now; renderCensus(x); renderTotals(x); }
    }
  } else if (!x.growth.growing) {
    if (g.alpha > 0.004 && g.nodes.length > 2500) showBusy(x, 'Settling layout', Math.min(1, Math.log(g.alpha0 / g.alpha) / Math.log(g.alpha0 / 0.004)));
    else showBusy(x, null);
  }
  if (moving || now < g.popUntil) writeGeometry(gs, g.nodes, now);
  stepAuto(x, now);
  stepPanel(x);
  stepCamera(x, now);
  stepFade(x);
  if (gs.controls.autoRotate && now - startedAt > AUTO_SPIN_MS) gs.controls.autoRotate = false;
  const camMoved = gs.controls.update() as unknown as boolean; // r147 returns whether the camera moved
  updateDetail(x, now);
  updateEdgeLabels(x, now);
  updateHover(x);
  const recent = now - x.lastEventAt < 600, c = x.cube;
  if (camMoved || moving || x.job || x.growth.growing || now < g.popUntil + 100 || x.cam.flight || x.cam.fitDist != null || c.anim || c.queue.length || recent || x.renderDirty) {
    placeMarkers(x);
    gs.renderer.render(gs.scene, gs.cam);
    placeLabels(x);
    x.renderDirty = false;
  }
  stepCube(x, now);
  const cubeMoved = c.controls.update() as unknown as boolean;
  if (cubeMoved || c.anim || x.cubeDirty || recent) { c.renderer.render(c.scene, c.cam); x.cubeDirty = false; }
}

/** Starts the frame loop. It keeps drawing even if one frame fails, so nothing (a label, a marker) can get stuck on screen. */
export function startFrames(x: Explorer): void {
  const startedAt = performance.now();
  let last = 0;
  const frame = (now: number) => {
    if (x.destroyed) return;
    if (last) watchFrames(x, now, now - last);
    last = now;
    try { frameBody(x, now, startedAt); } catch (err) { console.error('frame failed', err); x.renderDirty = true; }
    x.frameId = requestAnimationFrame(frame);
  };
  x.frameId = requestAnimationFrame(frame);
}
