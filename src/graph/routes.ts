// Shortest routes through the cube layers: every link into the layer inside is the last turn of some
// shortest route, so the routes form a DAG over the graph.
import type { Move } from '../model';
import { edgeBetween, moveAlong, otherEnd, type GNode } from './graph';

/** The neighbours one layer closer to solved; the tree parent first. */
export function preds(n: GNode): GNode[] {
  const ps = n.adj.map(e => otherEnd(e, n)).filter(o => o.depth === n.depth - 1);
  ps.sort((p, q) => p === n.parent ? -1 : q === n.parent ? 1 : p.i - q.i);
  return ps;
}

/** Up to `limit` shortest routes from solved to n, each a list of nodes starting at solved. */
export function routes(n: GNode, limit: number): GNode[][] {
  if (n.depth === 0) return [[n]];
  const out: GNode[][] = [];
  for (const p of preds(n)) {
    for (const r of routes(p, limit - out.length)) { out.push(r.concat([n])); if (out.length >= limit) return out; }
  }
  return out;
}

/** The turns along a route of nodes. */
export function routeMoves(r: GNode[]): Move[] {
  const m: Move[] = [];
  for (let i = 1; i < r.length; i++) m.push(moveAlong(edgeBetween(r[i - 1], r[i])!, r[i - 1]));
  return m;
}

/** The turns along the tree of first routes, from solved to node. */
export function pathOf(node: GNode | null): Move[] {
  const out: Move[] = [];
  while (node && node.parent) { out.push(node.via!); node = node.parent; }
  return out.reverse();
}
