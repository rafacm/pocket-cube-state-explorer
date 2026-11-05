// The 3D scene of the state graph: renderer, camera and controls, the cube layers as one instanced
// mesh, their links as two line sets (tree links and extra links), the selection and hover boxes,
// and the tubes that highlight routes.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Key } from '../model';
import type { Edge, GNode } from '../graph/graph';
import type { Theme } from '../explorer/theme';
import { createCubeMaterial, packStickers } from './cube-shader';

/** Most cube-layer states drawn at once (layers 0..7 hold 44,971). */
export const CAP = 46000;
export const TUBES = 220;

export interface Lines {
  pos: Float32Array; col: Float32Array;
  pa: THREE.BufferAttribute; ca: THREE.BufferAttribute;
  g: THREE.BufferGeometry; mat: THREE.LineBasicMaterial; l: THREE.LineSegments;
  list: Edge[];
}

export interface GraphScene {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  cam: THREE.PerspectiveCamera;
  controls: OrbitControls;
  /** projection * view, reused for projecting points to the screen */
  pm: THREE.Matrix4;
  nodeMat: THREE.ShaderMaterial;
  nodeMesh: THREE.InstancedMesh;
  stickArr: Float32Array;
  stickAttr: THREE.InstancedBufferAttribute;
  treeL: Lines;
  crossL: Lines;
  selMark: THREE.LineSegments;
  hovMark: THREE.LineSegments;
  tubes: THREE.Mesh[];
  tubeMats: THREE.MeshBasicMaterial[];
}

function makeLines(scene: THREE.Scene, cap: number, opacity: number): Lines {
  const pos = new Float32Array(cap * 6), col = new Float32Array(cap * 6);
  const g = new THREE.BufferGeometry();
  const pa = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const ca = new THREE.BufferAttribute(col, 3);
  g.setAttribute('position', pa); g.setAttribute('color', ca); g.setDrawRange(0, 0);
  const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity, depthWrite: false });
  const l = new THREE.LineSegments(g, mat); l.frustumCulled = false; scene.add(l);
  return { pos, col, pa, ca, g, mat, l, list: [] };
}

export function createGraphScene(canvas: HTMLCanvasElement, theme: Theme, reducedMotion: boolean): GraphScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(theme.stage);
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(45, 1, 1, 200000);
  cam.position.set(60, 46, 96);
  const controls = new OrbitControls(cam, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.minDistance = 12; controls.maxDistance = 90000;
  controls.autoRotate = !reducedMotion; controls.autoRotateSpeed = 0.55;
  controls.enableZoom = false; // the wheel zooms toward the pointer instead (render/navigation.ts)

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const stickArr = new Float32Array(CAP * 4);
  const stickAttr = new THREE.InstancedBufferAttribute(stickArr, 4);
  boxGeo.setAttribute('aStick', stickAttr);
  const nodeMat = createCubeMaterial(theme);
  const nodeMesh = new THREE.InstancedMesh(boxGeo, nodeMat, CAP);
  nodeMesh.count = 0; nodeMesh.frustumCulled = false;
  nodeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(nodeMesh);

  // two line sets: the BFS tree (first route found to each state) and the extra links
  const treeL = makeLines(scene, CAP, 0.85);
  const crossL = makeLines(scene, CAP * 4, 0.3);

  const boxEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
  const selMark = new THREE.LineSegments(boxEdges, new THREE.LineBasicMaterial({ color: theme.route1 }));
  const hovMark = new THREE.LineSegments(boxEdges, new THREE.LineBasicMaterial({ color: theme.ink, transparent: true, opacity: 0.7 }));
  selMark.visible = hovMark.visible = false;
  scene.add(selMark, hovMark);
  const tubeGeo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
  const tubeMats = [new THREE.MeshBasicMaterial({ color: theme.route1 }), new THREE.MeshBasicMaterial({ color: theme.route2 })];
  const tubes: THREE.Mesh[] = [];
  for (let i = 0; i < TUBES; i++) { const t = new THREE.Mesh(tubeGeo, tubeMats[0]); t.visible = false; scene.add(t); tubes.push(t); }

  return { renderer, scene, cam, controls, pm: new THREE.Matrix4(), nodeMat, nodeMesh, stickArr, stickAttr, treeL, crossL, selMark, hovMark, tubes, tubeMats };
}

/** Pixels per scene unit at distance 1 in front of the camera, for a canvas `h` pixels high. */
export const focalPx = (cam: THREE.PerspectiveCamera, h: number): number => h / 2 / Math.tan(cam.fov * Math.PI / 360);

/** Gives node n its stickers; it starts with zero size and grows in (writeGeometry). */
export function addNodeToScene(gs: GraphScene, n: GNode, key: Key = n.key): void {
  packStickers(k => key.charCodeAt(k) - 48, gs.stickArr, n.i);
  const IM = gs.nodeMesh.instanceMatrix.array as Float32Array, o = n.i * 16;
  IM.fill(0, o, o + 16); IM[o + 15] = 1;
}

/** Adds a link to the tree or extra line set, coloured by its turning face. */
export function addLinkToScene(gs: GraphScene, theme: Theme, e: Edge): void {
  const L = e.tree ? gs.treeL : gs.crossL, j = L.list.length;
  L.list.push(e);
  const c = theme.edge[e.mv.face];
  L.col.set([c.r, c.g, c.b, c.r, c.g, c.b], j * 6);
}

/** Uploads the line colours and draw ranges after links were added or cleared. */
export function syncLines(gs: GraphScene): void {
  for (const L of [gs.treeL, gs.crossL]) { L.ca.needsUpdate = true; L.g.setDrawRange(0, L.list.length * 2); }
}

/** Positions and sizes of all cubes and links, with the grow-in animation of new cubes. */
export function writeGeometry(gs: GraphScene, nodes: readonly GNode[], now: number): void {
  const IM = gs.nodeMesh.instanceMatrix.array as Float32Array;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]; let s = n.size;
    const t = (now - n.born) / 420;
    if (t < 1) s *= t <= 0 ? 0.001 : 1 - Math.pow(1 - t, 3);
    const o = i * 16; IM[o] = s; IM[o + 5] = s; IM[o + 10] = s; IM[o + 12] = n.x; IM[o + 13] = n.y; IM[o + 14] = n.z;
  }
  gs.nodeMesh.instanceMatrix.updateRange.offset = 0; gs.nodeMesh.instanceMatrix.updateRange.count = nodes.length * 16;
  gs.nodeMesh.instanceMatrix.needsUpdate = true;
  for (const L of [gs.treeL, gs.crossL]) {
    const P = L.pos, list = L.list;
    for (let j = 0; j < list.length; j++) {
      const e = list[j], o = j * 6;
      P[o] = e.a.x; P[o + 1] = e.a.y; P[o + 2] = e.a.z; P[o + 3] = e.b.x; P[o + 4] = e.b.y; P[o + 5] = e.b.z;
    }
    L.pa.updateRange.offset = 0; L.pa.updateRange.count = Math.max(6, list.length * 6);
    L.pa.needsUpdate = true;
  }
}

/** Frees the GPU resources of the scene. */
export function disposeGraphScene(gs: GraphScene): void {
  gs.controls.dispose();
  gs.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach(x => x.dispose()); else mat?.dispose();
  });
  gs.renderer.dispose();
}
