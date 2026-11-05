// Growing the cube layers: every turn from every state of the outermost layer, keeping the new states
// and all links between neighbouring states.
import { applyMove, SOLVED, type Move } from '../model';
import type { Rng } from '../explorer/rng';
import { addEdge, addNode, clearGraph, type Edge, type GNode, type Graph } from './graph';
import { spawnPos } from './layout';

/** Empties the graph and adds the solved cube at the centre. */
export function resetGraph(g: Graph, rng: Rng, now: number): GNode {
  clearGraph(g); rng.reset();
  return addNode(g, SOLVED, 0, null, null, now, [0, 0, 0]);
}

/** Adds the next layer. Returns its new states and all new links, in the order they were made. */
export function expandLayer(g: Graph, moves: readonly Move[], radii: readonly number[], halfTurns: boolean, rng: Rng, now: number): { fresh: GNode[]; links: Edge[] } {
  const D = g.depthShown, frontier = g.layerNodes[D] || [];
  const fresh: GNode[] = [], links: Edge[] = [];
  const link = (a: GNode, b: GNode, mv: Move, tree: boolean) => { const e = addEdge(g, a, b, mv, tree); if (e) links.push(e); return e; };
  for (const a of frontier) {
    for (const mv of moves) {
      const k = applyMove(a.key, mv);
      let b = g.byKey.get(k);
      if (!b) {
        const born = now + rng.next() * 450; // drawn before the position, as the layout has always done
        b = addNode(g, k, D + 1, a, mv, born, spawnPos(radii, halfTurns, rng, a, D + 1));
        b.paths = 0; fresh.push(b);
      }
      if (b.depth === D + 1) { if (link(a, b, mv, b.parent === a)) b.paths += a.paths; }
      else if (b.depth === D) link(a, b, mv, false);
    }
  }
  // links between states of the new layer (only possible with half turns)
  for (const a of fresh) for (const mv of moves) {
    const b = g.byKey.get(applyMove(a.key, mv));
    if (b && b.depth === D + 1) link(a, b, mv, false);
  }
  g.depthShown = D + 1;
  return { fresh, links };
}
