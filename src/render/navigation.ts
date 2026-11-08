// Design-app navigation and camera flights.
// Pan: Cmd/Ctrl/Shift + drag (built into OrbitControls), right-drag, or hold Space and drag.
// Zoom: the wheel zooms toward whatever is under the pointer, not toward the centre.
import * as THREE from 'three';
import type { Explorer, Point } from '../explorer/types';
import { deselect } from '../explorer/selection';
import { fitDistance } from '../graph/radii';
import { listen } from '../explorer/events';
import { closeTopmost } from '../ui/controls';

export interface Flyable extends Point { size?: number; dot?: boolean; dotIdx?: number }

/** Eases the camera to the distance that shows everything up to layer `depth`. */
export function fitTo(x: Explorer, depth: number): void { x.cam.holdFade = false; x.cam.fitDist = fitDistance(x.radii, depth); }

/** How far from t the camera stops: close enough to see the cube, more room for a dot. */
const flyDistance = (t: Flyable): number => t.dot || t.dotIdx != null ? 70 : Math.max(18, (t.size || 2) * 14);

/** Flies the camera close to t (keeping the viewing direction). `walk`: a step of a walk the camera follows. */
export function flyTo(x: Explorer, t: Flyable, dur?: number, walk = false): void {
  const { cam, controls } = x.gs;
  x.cam.fitDist = null; controls.autoRotate = false;
  if (!walk) x.cam.holdFade = false;
  const to = new THREE.Vector3(t.x, t.y, t.z);
  const dir = cam.position.clone().sub(controls.target).normalize();
  const dist = flyDistance(t);
  x.cam.flight = { t0: performance.now(), dur: x.reducedMotion ? 1 : (dur || 900), fromT: controls.target.clone(), toT: to, fromP: cam.position.clone(), toP: to.clone().add(dir.multiplyScalar(dist)) };
}

/**
 * Flies the camera to t on a walk toward `ahead`: behind t, looking at t over its shoulder, and a little
 * below the way ahead, so the way ahead runs down the screen beyond t: the walk feels like a descent.
 */
export function chaseTo(x: Explorer, t: Flyable, ahead: THREE.Vector3, dur?: number): void {
  const { cam, controls } = x.gs;
  const to = new THREE.Vector3(t.x, t.y, t.z), fwd = ahead.clone().sub(to);
  if (fwd.lengthSq() < 1e-6) { flyTo(x, t, dur, true); return; }
  fwd.normalize();
  // "above" is world up made square to the way ahead; any square direction when heading straight up or down
  const side = fwd.clone().cross(cam.up);
  if (side.lengthSq() < 1e-4) side.set(1, 0, 0).cross(fwd);
  const above = side.normalize().cross(fwd);
  const dist = flyDistance(t) * 1.15, tilt = -0.5; // about 29 degrees below the way ahead
  x.cam.fitDist = null; controls.autoRotate = false;
  const off = fwd.multiplyScalar(-Math.cos(tilt)).addScaledVector(above, Math.sin(tilt)).multiplyScalar(dist);
  x.cam.flight = { t0: performance.now(), dur: x.reducedMotion ? 1 : (dur || 900), fromT: controls.target.clone(), toT: to, fromP: cam.position.clone(), toP: to.clone().add(off) };
}

const sph = new THREE.Spherical();
/** Turns the camera around the point it looks at (keyboard orbit): angles in radians. */
export function orbitBy(x: Explorer, dTheta: number, dPhi: number): void {
  const { cam, controls } = x.gs;
  x.cam.fitDist = null; x.cam.flight = null; controls.autoRotate = false;
  x.cam.holdFade = false;
  const off = cam.position.clone().sub(controls.target);
  sph.setFromVector3(off);
  sph.theta += dTheta; sph.phi = Math.min(Math.PI - 0.05, Math.max(0.05, sph.phi + dPhi));
  off.setFromSpherical(sph);
  cam.position.copy(controls.target).add(off);
  controls.update(); x.renderDirty = true;
}
/** Moves the camera toward (k < 1) or away from (k > 1) the point it looks at. */
export function zoomBy(x: Explorer, k: number): void {
  const { cam, controls } = x.gs;
  x.cam.fitDist = null; x.cam.flight = null; controls.autoRotate = false; x.cam.holdFade = false;
  const off = cam.position.clone().sub(controls.target);
  off.setLength(Math.min(controls.maxDistance, Math.max(controls.minDistance, off.length() * k)));
  cam.position.copy(controls.target).add(off);
  controls.update(); x.renderDirty = true;
}

/** Flies back out to the whole graph. */
export function flyHome(x: Explorer): void {
  const { cam, controls } = x.gs;
  x.cam.holdFade = false;
  x.cam.flight = {
    t0: performance.now(), dur: x.reducedMotion ? 1 : 900, fromT: controls.target.clone(), toT: new THREE.Vector3(0, 0, 0), fromP: cam.position.clone(),
    toP: cam.position.clone().sub(controls.target).normalize().multiplyScalar(fitDistance(x.radii, x.graph.depthShown)),
  };
}

/** The element an event really started on, also inside shadow roots. */
export const origin = (e: Event): EventTarget | null => e.composedPath()[0] ?? e.target;
export const isTyping = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
};

/** Is a key press meant for this explorer? Anywhere on a page that is only the explorer; else only
 *  with the pointer over its stage or the focus inside it. */
export function ownsKey(x: Explorer, e: Event, opts: NavigationOptions): boolean {
  return opts.keyboard === 'page' || x.cam.overStage || e.composedPath().includes(x.container);
}

export interface NavigationOptions {
  /** 'page': keys work anywhere on the page (the standalone explorer); 'explorer': only inside it */
  keyboard: 'page' | 'explorer';
}

export function bindNavigation(x: Explorer, opts: NavigationOptions): void {
  const { cam, controls } = x.gs, canvas = x.el.graph;
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  x.el.panKey.textContent = isMac ? '⌘' : 'Ctrl';
  const setPanCursor = (on: boolean) => { canvas.classList.toggle('pan', on); };
  const panMode = (on: boolean) => { x.cam.spaceDown = on; controls.mouseButtons.LEFT = on ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE; setPanCursor(on); };
  const ours = (e: Event) => ownsKey(x, e, opts);

  listen(x, controls, 'start', () => { x.cam.fitDist = null; x.cam.flight = null; controls.autoRotate = false; x.cam.holdFade = false; });
  listen(x, canvas, 'pointerenter', () => { x.cam.overStage = true; });
  listen(x, canvas, 'pointerleave', () => { x.cam.overStage = false; });
  listen(x, window, 'keydown', (e: KeyboardEvent) => {
    if (isTyping(origin(e))) return;
    if (e.code === 'Space' && x.cam.overStage) { e.preventDefault(); if (!x.cam.spaceDown) panMode(true); }
    else if (e.key === 'Meta' || e.key === 'Control' || e.key === 'Shift') setPanCursor(true);
  });
  listen(x, window, 'keydown', (e: KeyboardEvent) => {
    const t = origin(e) as HTMLElement | null;
    if (e.key !== 'Escape' || !ours(e)) return;
    // Esc closes the topmost pop-up or the drawer first (also from inside it), then deselects
    if (closeTopmost(x)) { e.preventDefault(); return; }
    if (!(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'))) deselect(x);
  });
  listen(x, window, 'keyup', (e: KeyboardEvent) => {
    if (e.code === 'Space' && x.cam.spaceDown) panMode(false);
    else if ((e.key === 'Meta' || e.key === 'Control' || e.key === 'Shift') && !x.cam.spaceDown) setPanCursor(false);
  });
  listen(x, window, 'blur', () => { if (x.cam.spaceDown) panMode(false); setPanCursor(false); });

  // Zoom: OrbitControls' own zoom (pinch, on touch screens) is on only for touch; the wheel zooms toward
  // the pointer below instead. Both listeners run in the capture phase, so they fire before
  // OrbitControls' own listeners on the same canvas.
  listen(x, canvas, 'pointerdown', (e: PointerEvent) => { controls.enableZoom = e.pointerType === 'touch'; }, { capture: true });
  const wheelRay = new THREE.Vector3(), wheelP = new THREE.Vector3(), viewN = new THREE.Vector3();
  listen(x, canvas, 'wheel', (e: WheelEvent) => {
    e.preventDefault();
    controls.enableZoom = false;
    x.cam.fitDist = null; x.cam.flight = null; controls.autoRotate = false; x.cam.holdFade = false;
    const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
    const k = Math.exp(Math.max(-60, Math.min(60, dy)) * (e.ctrlKey ? 0.012 : 0.0018));   // ctrl + wheel is a trackpad pinch
    const r = canvas.getBoundingClientRect(), w = r.width, h = r.height;
    const px = e.clientX - r.left, py = e.clientY - r.top, hover = x.pointer.hover;
    // the point to zoom toward: the cube or dot under the pointer, else where the pointer ray meets
    // the plane through the orbit centre
    if (hover && Math.hypot(px - x.pointer.mx, py - x.pointer.my) < 4) wheelP.set(hover.x, hover.y, hover.z);
    else {
      wheelRay.set(px / w * 2 - 1, -(py / h) * 2 + 1, 0.5).unproject(cam).sub(cam.position).normalize();
      viewN.copy(controls.target).sub(cam.position);
      const depth = viewN.length(); viewN.normalize();
      const t = depth / Math.max(0.05, wheelRay.dot(viewN));
      wheelP.copy(cam.position).addScaledVector(wheelRay, t);
    }
    const dist = cam.position.distanceTo(controls.target);
    const nd = Math.min(controls.maxDistance, Math.max(controls.minDistance, dist * k)), kk = nd / dist;
    cam.position.sub(wheelP).multiplyScalar(kk).add(wheelP);
    controls.target.sub(wheelP).multiplyScalar(kk).add(wheelP);
    controls.update();
  }, { passive: false, capture: true });
}

const fromOff = new THREE.Vector3(), toOff = new THREE.Vector3(), turn = new THREE.Quaternion(), turnK = new THREE.Quaternion();
/** Advances a flight and the fit-to-graph easing; called every frame. */
export function stepCamera(x: Explorer, now: number): void {
  const { cam, controls } = x.gs, f = x.cam.flight;
  if (f) {
    const t = Math.min(1, (now - f.t0) / f.dur), k = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    // the point looked at moves in a straight line; the camera swings around it, turning its viewing
    // direction and easing its distance, so a flight that turns the view never cuts through the target
    controls.target.lerpVectors(f.fromT, f.toT, k);
    fromOff.subVectors(f.fromP, f.fromT); toOff.subVectors(f.toP, f.toT);
    const d0 = fromOff.length(), d1 = toOff.length();
    turn.setFromUnitVectors(fromOff.normalize(), toOff.normalize());
    turnK.identity().slerp(turn, k);
    cam.position.copy(fromOff.applyQuaternion(turnK).multiplyScalar(d0 + (d1 - d0) * k)).add(controls.target);
    if (t >= 1) x.cam.flight = null;
  }
  if (x.cam.fitDist != null) {
    const off = cam.position.clone().sub(controls.target), d = off.length();
    const nd = d + (x.cam.fitDist - d) * 0.045;
    cam.position.copy(controls.target).add(off.setLength(nd));
    if (Math.abs(nd - x.cam.fitDist) < 0.5) x.cam.fitDist = null;
  }
}
