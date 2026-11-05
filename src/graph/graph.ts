// The inner layers as real objects: one node per state, one edge per link between neighbouring states.
import { inverseOf, type Key, type Move } from '../model';
import type { View } from '../explorer/settings';

export interface GNode {
  i: number;
  key: Key;
  depth: number;
  /** the state this one was first reached from (its parent in the tree of first routes) */
  parent: GNode | null;
  /** the turn from the parent to this state */
  via: Move | null;
  /** number of shortest routes from solved */
  paths: number;
  adj: Edge[];
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  fx: number; fy: number; fz: number;
  /** grid cell, used by the layout */
  cx: number; cy: number; cz: number;
  /** when it appears (it grows in over a short time) */
  born: number;
  /** cube size in the scene */
  size: number;
  /** its state number, once the outer layers are in use */
  code: number;
  /** its bundle region, once bundles reach it */
  bp: number | null;
}

/** A link; `mv` leads from `a` to `b`, and `a` is never farther from solved than `b`. */
export interface Edge { a: GNode; b: GNode; mv: Move; tree: boolean }

export interface Graph {
  nodes: GNode[];
  byKey: Map<Key, GNode>;
  edges: Edge[];
  edgeSet: Set<string>;
  layerNodes: GNode[][];
  /** the outermost layer drawn so far (cube or dot layer) */
  depthShown: number;
  /** cubes are still growing in until then */
  popUntil: number;
  /** layout "temperature": the force layout runs while it is above 0.004 */
  alpha: number;
  alpha0: number;
  /** layers below this one are frozen in the layout */
  frozenBelow: number;
}

/** Cube sizes by layer: the inner layers are drawn larger. */
export const SIZES = [8.5, 6.5, 5.2, 4.4, 3.9, 3.6, 3.6, 3.6];

export function createGraph(): Graph {
  return { nodes: [], byKey: new Map(), edges: [], edgeSet: new Set(), layerNodes: [], depthShown: 0, popUntil: 0, alpha: 1, alpha0: 1, frozenBelow: 0 };
}

export function clearGraph(g: Graph): void {
  g.nodes = []; g.byKey = new Map(); g.edges = []; g.edgeSet = new Set(); g.layerNodes = [];
  g.depthShown = 0; g.popUntil = 0; g.frozenBelow = 0; g.alpha = 1;
}

export function addNode(g: Graph, key: Key, depth: number, parent: GNode | null, via: Move | null, now: number, pos: [number, number, number]): GNode {
  const n: GNode = {
    i: g.nodes.length, key, depth, parent, via, paths: parent ? parent.paths : 1, adj: [],
    x: pos[0], y: pos[1], z: pos[2], vx: 0, vy: 0, vz: 0, fx: 0, fy: 0, fz: 0, cx: 0, cy: 0, cz: 0,
    born: now, size: SIZES[depth] || 2.6, code: -1, bp: null,
  };
  g.nodes.push(n); g.byKey.set(key, n);
  (g.layerNodes[depth] || (g.layerNodes[depth] = [])).push(n);
  g.popUntil = Math.max(g.popUntil, now + 450);
  return n;
}

/** Adds the link from a to b (turn mv), unless they are already linked. */
export function addEdge(g: Graph, a: GNode, b: GNode, mv: Move, tree: boolean): Edge | null {
  const k = a.i < b.i ? a.i + '|' + b.i : b.i + '|' + a.i;
  if (g.edgeSet.has(k)) return null;
  g.edgeSet.add(k);
  const e: Edge = { a, b, mv, tree };
  g.edges.push(e); a.adj.push(e); b.adj.push(e);
  return e;
}

export const otherEnd = (e: Edge, x: GNode): GNode => e.a === x ? e.b : e.a;
/** The turn that leads along e, starting from `from`. */
export const moveAlong = (e: Edge, from: GNode): Move => e.a === from ? e.mv : inverseOf(e.mv);
export const edgeBetween = (x: GNode, y: GNode): Edge | undefined => x.adj.find(e => otherEnd(e, x) === y);
export const edgeVisible = (view: View, e: Edge): boolean => view === 'all' || (view === 'tree') === e.tree;
