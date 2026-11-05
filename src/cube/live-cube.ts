// The large cube in the panel: a small scene of 8 stickered cubies, and a queue of turns it plays.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SLOTS, SOLVED, applyMove, type Key, type Move, type Vec3 } from '../model';
import type { Theme } from '../explorer/theme';
import type { Explorer } from '../explorer/types';
import { onState } from '../explorer/selection';

/** A queued step: a turn, a jump straight to a state, or a pause. */
export type QueueItem = { mv: Move; dur: number } | { set: Key } | { wait: number };
type Turning = { kind: 'turn'; item: { mv: Move; dur: number }; pivot: THREE.Group; layer: Cubie[]; t0: number; dur: number };
type Waiting = { kind: 'wait'; t0: number; dur: number };
interface Cubie { p: Vec3; g: THREE.Group }

export interface LiveCube {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  cam: THREE.PerspectiveCamera;
  controls: OrbitControls;
  root: THREE.Group;
  cubies: Cubie[];
  stickerMats: THREE.MeshLambertMaterial[];
  bodyMat: THREE.MeshLambertMaterial;
  /** the state of the cube as held (not canonical) */
  key: Key;
  queue: QueueItem[];
  anim: Turning | Waiting | null;
}

function roundedSquare(w: number, r: number): THREE.ShapeGeometry {
  const h = w / 2, s = new THREE.Shape();
  s.moveTo(-h + r, -h); s.lineTo(h - r, -h); s.quadraticCurveTo(h, -h, h, -h + r);
  s.lineTo(h, h - r); s.quadraticCurveTo(h, h, h - r, h); s.lineTo(-h + r, h);
  s.quadraticCurveTo(-h, h, -h, h - r); s.lineTo(-h, -h + r); s.quadraticCurveTo(-h, -h, -h + r, -h);
  return new THREE.ShapeGeometry(s, 5);
}

export function createLiveCube(canvas: HTMLCanvasElement, theme: Theme): LiveCube {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(theme.stage);
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  cam.position.set(3.3, 2.75, 4.1);
  const controls = new OrbitControls(cam, canvas);
  controls.enablePan = false; controls.enableZoom = false; controls.enableDamping = true; controls.rotateSpeed = 0.7;
  scene.add(new THREE.AmbientLight(0xffffff, 0.62));
  const dl = new THREE.DirectionalLight(0xffffff, 0.55); dl.position.set(3, 6, 4); scene.add(dl);
  const dl2 = new THREE.DirectionalLight(0xffffff, 0.18); dl2.position.set(-4, -2, -3); scene.add(dl2);
  const root = new THREE.Group(); scene.add(root);

  const stickerGeo = roundedSquare(0.84, 0.1);
  const bodyGeo = new THREE.BoxGeometry(0.97, 0.97, 0.97);
  const bodyMat = new THREE.MeshLambertMaterial({ color: theme.cubeBody });
  const stickerMats = SLOTS.map(() => new THREE.MeshLambertMaterial({ color: 0xffffff }));
  const cubies: Cubie[] = [];
  for (const px of [-1, 1]) for (const py of [-1, 1]) for (const pz of [-1, 1]) {
    const p: Vec3 = [px, py, pz], g = new THREE.Group();
    g.position.set(px * 0.5, py * 0.5, pz * 0.5);
    g.add(new THREE.Mesh(bodyGeo, bodyMat));
    SLOTS.forEach((sl, s) => {
      if (sl.p[0] !== px || sl.p[1] !== py || sl.p[2] !== pz) return;
      const m = new THREE.Mesh(stickerGeo, stickerMats[s]);
      const n = new THREE.Vector3(sl.n[0], sl.n[1], sl.n[2]);
      m.position.copy(n).multiplyScalar(0.487);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
      g.add(m);
    });
    root.add(g); cubies.push({ p, g });
  }
  return { renderer, scene, cam, controls, root, cubies, stickerMats, bodyMat, key: SOLVED, queue: [], anim: null };
}

export function paintCube(x: Explorer, key: Key): void {
  const c = x.cube;
  for (let s = 0; s < 24; s++) c.stickerMats[s].color.copy(x.theme.sticker[key.charCodeAt(s) - 48]);
  x.cubeDirty = true;
}

/** Puts the cubies of a turn that was cut short back in place. */
export function abortTurn(x: Explorer): void {
  const c = x.cube, a = c.anim;
  if (a && a.kind === 'turn') {
    a.layer.forEach(q => { c.root.add(q.g); q.g.position.set(q.p[0] * 0.5, q.p[1] * 0.5, q.p[2] * 0.5); q.g.rotation.set(0, 0, 0); });
    c.root.remove(a.pivot);
  }
  c.anim = null;
}

const AX = ['x', 'y', 'z'] as const;

function startNext(x: Explorer, now: number): void {
  const c = x.cube;
  while (!c.anim && c.queue.length) {
    const item = c.queue.shift()!;
    if ('set' in item) { c.key = item.set; paintCube(x, c.key); x.sel.on = true; x.ui.cardWanted = true; onState(x); continue; }
    if ('wait' in item) { c.anim = { kind: 'wait', t0: now, dur: item.wait }; break; }
    const pivot = new THREE.Group(); c.root.add(pivot);
    const sel = item.mv.sel;
    const layer = c.cubies.filter(q => sel === 0 || q.p[item.mv.ax] === sel);
    layer.forEach(q => pivot.add(q.g));
    c.anim = { kind: 'turn', item, pivot, layer, t0: now, dur: x.reducedMotion ? 60 : item.dur };
    x.el.cbMove.textContent = item.mv.name; x.el.cbMove.classList.add('on');
  }
}

/** Advances the cube's animation; called every frame. */
export function stepCube(x: Explorer, now: number): void {
  const c = x.cube;
  if (!c.anim) startNext(x, now);
  const a = c.anim;
  if (!a) return;
  const t = Math.min(1, (now - a.t0) / a.dur);
  if (a.kind === 'wait') { if (t >= 1) { c.anim = null; startNext(x, now); } return; }
  const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const { item, pivot, layer } = a;
  pivot.rotation.set(0, 0, 0);
  pivot.rotation[AX[item.mv.ax]] = -Math.PI / 2 * item.mv.q * e;
  if (t >= 1) {
    layer.forEach(q => { c.root.add(q.g); q.g.position.set(q.p[0] * 0.5, q.p[1] * 0.5, q.p[2] * 0.5); q.g.rotation.set(0, 0, 0); });
    c.root.remove(pivot);
    c.key = applyMove(c.key, item.mv); paintCube(x, c.key);
    c.anim = null;
    if (!c.queue.length) x.el.cbMove.classList.remove('on');
    x.sel.on = true; x.ui.cardWanted = true; onState(x);
    startNext(x, now);
  }
}

/** The cube is turning or has turns queued. */
export const busy = (x: Explorer): boolean => !!x.cube.anim || x.cube.queue.length > 0;

export function disposeLiveCube(c: LiveCube): void {
  c.controls.dispose();
  c.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as THREE.Material | undefined;
    mat?.dispose?.();
  });
  c.renderer.dispose();
}
