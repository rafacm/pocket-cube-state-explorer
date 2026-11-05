// Drawing only when something changes.
// The explorer redraws only while the camera moves (including its glide after you let go), the layout
// settles, a layer streams in, the camera flies, the cube turns, or you are using it. Idle, it draws
// nothing, so the GPU rests.
import type { Explorer } from './types';
import { tick } from '../graph/layout';
import { stepAuto } from './grow';
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

function frameBody(x: Explorer, now: number, startedAt: number): void {
  const g = x.graph, gs = x.gs;
  const moving = g.alpha > 0.004;
  if (moving) {
    tick(g, x.radii, x.halfTurns, x.rng, g.alpha); if (g.nodes.length < 8000) tick(g, x.radii, x.halfTurns, x.rng, g.alpha);
    g.alpha *= g.nodes.length < 8000 ? 0.975 : 0.96;
    if (g.alpha <= 0.004) x.growth.settledAt = now;
  }
  if (x.job) {
    runJob(x, 12, now);
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
  const frame = (now: number) => {
    if (x.destroyed) return;
    try { frameBody(x, now, startedAt); } catch (err) { console.error('frame failed', err); x.renderDirty = true; }
    x.frameId = requestAnimationFrame(frame);
  };
  x.frameId = requestAnimationFrame(frame);
}
