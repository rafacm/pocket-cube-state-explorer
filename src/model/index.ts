// Pure cube logic: no DOM, no Three.js. Tests run against this module.
export * from './cube';
export * from './net';
export * from './numbering';

/** Published layer sizes for the whole 2x2x2 group (fixed corner, U/R/F turns), quarter-turn metric. */
export const QTM_TOTALS: readonly number[] = [1, 6, 27, 120, 534, 2256, 8969, 33058, 114149, 360508, 930588, 1350852, 782536, 90280, 276];
/** The same in the half-turn metric. */
export const HTM_TOTALS: readonly number[] = [1, 9, 54, 321, 1847, 9992, 50136, 227536, 870072, 1887748, 623800, 2644];
export * from './parse';
