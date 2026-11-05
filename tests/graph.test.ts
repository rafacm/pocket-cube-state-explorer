import { expect, test } from 'bun:test';
import { Rng } from '../src/explorer/rng';
import { activeMoves, totals } from '../src/explorer/settings';
import { createGraph } from '../src/graph/graph';
import { expandLayer, resetGraph } from '../src/graph/expand';
import { computeRadii } from '../src/graph/radii';
import { routes, routeMoves, pathOf } from '../src/graph/routes';
import { tick } from '../src/graph/layout';
import { applyMove, SOLVED } from '../src/model';

function grow(layers: number, half = false) {
  const g = createGraph(), rng = new Rng(), radii: number[] = [];
  computeRadii(radii, half);
  resetGraph(g, rng, 0);
  for (let d = 0; d < layers; d++) expandLayer(g, activeMoves(half), radii, half, rng, 0);
  return { g, rng, radii };
}

test('cube layers hold the published numbers of states', () => {
  const { g } = grow(5);
  for (let d = 0; d <= 5; d++) expect(g.layerNodes[d].length).toBe(totals(false)[d]);
  const h = grow(3, true).g;
  for (let d = 0; d <= 3; d++) expect(h.layerNodes[d].length).toBe(totals(true)[d]);
});

test('three quarter-turn layers: 154 states, 168 links, 15 of them closing loops', () => {
  const { g } = grow(3);
  expect(g.nodes.length).toBe(154);
  expect(g.edges.length).toBe(168);
  expect(g.edges.filter(e => !e.tree).length).toBe(15);
  expect(g.edges.filter(e => e.tree).length).toBe(153); // one per state but the solved one
});

test('quarter turns never link two states of the same layer', () => {
  const { g } = grow(5);
  expect(g.edges.every(e => e.b.depth === e.a.depth + 1)).toBe(true);
});

test('routes really lead from solved to the state', () => {
  const { g } = grow(4);
  for (const n of g.layerNodes[4].slice(0, 50)) {
    expect(pathOf(n).reduce((k, m) => applyMove(k, m), SOLVED)).toBe(n.key);
    const rs = routes(n, 4);
    expect(rs.length).toBe(Math.min(4, n.paths));
    for (const r of rs) expect(routeMoves(r).reduce((k, m) => applyMove(k, m), SOLVED)).toBe(n.key);
  }
});

test('the layout is the same every time', () => {
  const a = grow(4), b = grow(4);
  for (let i = 0; i < 20; i++) { tick(a.g, a.radii, false, a.rng, 1); tick(b.g, b.radii, false, b.rng, 1); }
  expect(a.g.nodes.map(n => [n.x, n.y, n.z])).toEqual(b.g.nodes.map(n => [n.x, n.y, n.z]));
  expect(a.g.nodes.every(n => Number.isFinite(n.x + n.y + n.z))).toBe(true);
});

test('distances match the layer sizes, and routes from them reach the state', async () => {
  const { computeDistances, routeTo } = await import('../src/graph/distances');
  const { decodeCode, NSTATE, ensureTables } = await import('../src/model');
  ensureTables();
  const dist = computeDistances(false);
  const counts = new Array(15).fill(0);
  for (let c = 0; c < NSTATE; c++) counts[dist[c]]++;
  expect(counts).toEqual([...totals(false)]);
  for (const code of [1, 12345, 999999, 3674159]) {
    const r = routeTo(code, dist, activeMoves(false));
    expect(r.length).toBe(dist[code]);
    expect(r.reduce((k, m) => applyMove(k, m), SOLVED)).toBe(decodeCode(code));
  }
});
