import { expect, test } from 'bun:test';
import { SOLVED, applyMove, canonical, faceletString, parseState, ROT_MOVES, ALL_MOVES, OPP_MOVES, invertMove, moveByName } from '../src/model';

const key = (text: string) => { const r = parseState(text); if ('error' in r) throw new Error(r.error); return r.key; };

test('an empty scramble is the solved cube', () => {
  expect(parseState('')).toEqual({ error: 'Type a scramble or a facelet string first.' });
  expect(parseState('   ')).toHaveProperty('error');
});

test('scrambles apply their moves in order', () => {
  const r = parseState("R U R' F2");
  expect(r).toMatchObject({ kind: 'moves', moves: ['R', 'U', "R'", 'F2'] });
  const byHand = ["R", "U", "R'", "F2"].reduce((k, n) => applyMove(k, ALL_MOVES.find(m => m.name === n)!), SOLVED);
  expect(key("R U R' F2")).toBe(byHand);
});

test("typographic apostrophes, no spaces and 2' are accepted", () => {
  expect(key('R U’')).toBe(key("R U'"));
  expect(key("RUR'")).toBe(key("R U R'"));
  expect(key("R2'")).toBe(key('R2'));
});

test('a move and its inverse cancel', () => {
  expect(key("R R'")).toBe(SOLVED);
  expect(key('U2 U2')).toBe(SOLVED);
  expect(key("D L B B' L' D'")).toBe(SOLVED);
});

test('whole-cube rotations change only how the cube is held', () => {
  const held = key('x y');
  expect(held).not.toBe(SOLVED);
  expect(canonical(held).key).toBe(SOLVED);
  expect(ROT_MOVES.map(m => m.name)).toContain("z'");
});

test('unknown moves are rejected', () => {
  const r = parseState('R Q');
  expect(r).toHaveProperty('error');
  expect((r as { error: string }).error).toContain('"Q"');
});

test('facelet strings round-trip with faceletString', () => {
  const k = key("R U R' F2");
  const r = parseState(faceletString(k));
  expect(r).toEqual({ key: k, kind: 'facelets' });
  expect(parseState('WWWWRRRRGGGGYYYYOOOOBBBB')).toEqual({ key: SOLVED, kind: 'facelets' });
});

test('facelet strings with wrong letters or counts are rejected', () => {
  expect((parseState('WWWW:RRRR:GGGG:YYYY:OOOO:BBBX') as { error: string }).error).toContain('only the letters W Y R O G B');
  expect((parseState('WWWW:RRRR:GGGG') as { error: string }).error).toContain('needs 24 letters');
  expect((parseState('WWWW:RRRR:GGGG:YYYY:OOOO:BBBW') as { error: string }).error).toContain('exactly 4 times');
});

test('every turn and rotation has an inverse that undoes it', () => {
  const key = parseState("R U2 F' D L' B2 x y'") as { key: string };
  for (const m of [...ALL_MOVES, ...OPP_MOVES, ...ROT_MOVES]) {
    const inv = invertMove(m);
    expect(applyMove(applyMove(key.key, m), inv)).toBe(key.key);
    expect(inv.kind).toBe(m.kind);
  }
  expect(invertMove(moveByName('D')!).name).toBe("D'");
  expect(invertMove(moveByName("x'")!).name).toBe('x');
  expect(invertMove(moveByName('B2')!).name).toBe('B2');
});
