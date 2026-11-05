// What the current metric means for the graph: which turns count as one move, how many layers
// there are, and which layers are drawn as cubes rather than dots.
import { ALL_MOVES, HTM_TOTALS, QTM_TOTALS, type Move } from '../model';

export type View = 'all' | 'tree' | 'extra';
export type ColorMode = 'routes' | 'layer';

/** The turns that count as one move: quarter turns, plus half turns when they count as one. */
export const activeMoves = (halfTurns: boolean): Move[] => halfTurns ? ALL_MOVES : ALL_MOVES.filter(m => m.turns !== 2);
/** Every state is within this many moves: God's number is 11 half turns or 14 quarter turns. */
export const maxDepth = (halfTurns: boolean): number => halfTurns ? 11 : 14;
/** Layers up to this one are drawn as cubes with links; the outer layers are dots. */
export const fullMax = (halfTurns: boolean): number => halfTurns ? 5 : 7;
/** Published layer sizes for the metric. */
export const totals = (halfTurns: boolean): readonly number[] => halfTurns ? HTM_TOTALS : QTM_TOTALS;

export const fmt = (n: number): string => n.toLocaleString('en-US');
