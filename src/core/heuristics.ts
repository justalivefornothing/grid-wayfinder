import type { Cell } from './grid'

export type Heuristic = (a: Cell, b: Cell) => number
export type HeuristicName = 'manhattan' | 'euclidean' | 'chebyshev'

export const manhattan: Heuristic = ([ax, ay], [bx, by]) => Math.abs(ax - bx) + Math.abs(ay - by)
export const euclidean: Heuristic = ([ax, ay], [bx, by]) => Math.hypot(ax - bx, ay - by)
export const chebyshev: Heuristic = ([ax, ay], [bx, by]) => Math.max(Math.abs(ax - bx), Math.abs(ay - by))
export const zero: Heuristic = () => 0

export const HEURISTICS: Record<HeuristicName, Heuristic> = { manhattan, euclidean, chebyshev }
