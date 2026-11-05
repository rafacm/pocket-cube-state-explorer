// Reading a state the user typed: a scramble (U R F D L B with ' or 2, and x y z) or a 24-letter
// facelet string in the order U R F D L B, each face read row by row as in the net, with W Y R O G B
// for the colours.
import { ALL_MOVES, OPP_MOVES, ROT_MOVES, SOLVED, applyMove, type Key, type Move } from './cube';
import { COLOR_LETTER, NET_SLOTS, STRING_ORDER } from './net';

export type Parsed =
  | { error: string }
  | { key: Key; kind: 'facelets' }
  | { key: Key; kind: 'moves'; moves: string[] };

const ALL_NAMED: Record<string, Move> = {};
for (const m of [...ALL_MOVES, ...OPP_MOVES, ...ROT_MOVES]) ALL_NAMED[m.name] = m;

/** The state (as held, not canonical) described by a scramble or a facelet string. */
export function parseState(text: string): Parsed {
  const t = text.trim();
  if (!t) return { error: 'Type a scramble or a facelet string first.' };
  const letters = t.toUpperCase().replace(/[^A-Z]/g, '');
  const looksFacelets = t.includes(':') || (!/\s/.test(t) && letters.length >= 16 && !/['’2]/.test(t));
  if (looksFacelets && (letters.length !== 24 || !/^[WYROGB]+$/.test(letters))) {
    const bad = [...new Set(letters.replace(/[WYROGB]/g, ''))];
    return { error: bad.length ? 'Facelet strings use only the letters W Y R O G B; this one also has ' + bad.join(', ') + '.'
                               : 'A facelet string needs 24 letters, 4 per face; this one has ' + letters.length + '.' };
  }
  if (letters.length === 24 && /^[WYROGB]+$/.test(letters) && !/['’2]/.test(t)) {
    const counts: Record<string, number> = {}; for (const ch of letters) counts[ch] = (counts[ch] || 0) + 1;
    const off = [...COLOR_LETTER].filter(ch => counts[ch] !== 4).map(ch => (counts[ch] || 0) + ' ' + ch);
    if (off.length) return { error: 'Each colour must appear exactly 4 times; this string has ' + off.join(', ') + '.' };
    const arr = new Array<string>(24); let i = 0;
    for (const f of STRING_ORDER) for (let q = 0; q < 4; q++) arr[NET_SLOTS[f][q]] = String(COLOR_LETTER.indexOf(letters[i++]));
    return { key: arr.join(''), kind: 'facelets' };
  }
  const norm = t.replace(/[’`]/g, "'");
  const toks = norm.match(/\S/g) ? norm.match(/[A-Za-z][2']*'?|\S/g) ?? [] : [];
  let key = SOLVED; const used: string[] = [];
  for (const tok of toks) {
    const base = tok[0], mod = tok.slice(1).replace("2'", '2');
    const m = ALL_NAMED[base + mod];
    if (!m) return { error: 'I don\'t know the move "' + tok + '". Use U R F D L B with \' or 2, or x y z for turning the whole cube.' };
    key = applyMove(key, m); used.push(m.name);
  }
  return { key, kind: 'moves', moves: used };
}
