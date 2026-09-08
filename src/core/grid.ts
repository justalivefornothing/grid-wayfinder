/** A cell address as `[x, y]` (column, row). */
export type Cell = readonly [x: number, y: number]

export const MUD_COST = 5

export interface Grid {
  readonly width: number
  readonly height: number
  /** `wall[y][x]` — impassable ridge. */
  wall: boolean[][]
  /** `weight[y][x]` — cost to *enter* the cell: 1 for open ground, 5 for mud. */
  weight: number[][]
}

export interface MoveRules {
  /** Allow 8-way movement. Diagonal steps cost √2 × the entered cell's weight. */
  diagonal: boolean
  /** When false, a diagonal step is blocked if either orthogonal neighbour it squeezes past is a wall. */
  cutCorners: boolean
}

export function openGrid(width: number, height: number): Grid {
  return {
    width,
    height,
    wall: Array.from({ length: height }, () => Array<boolean>(width).fill(false)),
    weight: Array.from({ length: height }, () => Array<number>(width).fill(1)),
  }
}

export function passable(g: Grid, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < g.width && y < g.height && !g.wall[y][x]
}

export const sameCell = (a: Cell, b: Cell): boolean => a[0] === b[0] && a[1] === b[1]

const ORTHO: ReadonlyArray<readonly [number, number]> = [[1, 0], [0, 1], [-1, 0], [0, -1]]
const DIAG: ReadonlyArray<readonly [number, number]> = [[1, 1], [-1, 1], [-1, -1], [1, -1]]

/** `[x, y, isDiagonal]` for every passable neighbour under the given rules. */
export type Neighbor = readonly [x: number, y: number, diagonal: boolean]

export function neighbors(g: Grid, x: number, y: number, rules?: Partial<MoveRules>): Neighbor[] {
  const out: Neighbor[] = []
  for (const [dx, dy] of ORTHO) {
    if (passable(g, x + dx, y + dy)) out.push([x + dx, y + dy, false])
  }
  if (rules?.diagonal) {
    for (const [dx, dy] of DIAG) {
      if (!passable(g, x + dx, y + dy)) continue
      if (!rules.cutCorners && (!passable(g, x + dx, y) || !passable(g, x, y + dy))) continue
      out.push([x + dx, y + dy, true])
    }
  }
  return out
}

/** Number of cells reachable from `start` (inclusive) — a plain flood fill. */
export function reachableCellCount(g: Grid, start: Cell, rules?: Partial<MoveRules>): number {
  const seen = new Uint8Array(g.width * g.height)
  const stack: Cell[] = [start]
  seen[start[1] * g.width + start[0]] = 1
  let count = 0
  while (stack.length) {
    const [x, y] = stack.pop()!
    count++
    for (const [nx, ny] of neighbors(g, x, y, rules)) {
      const i = ny * g.width + nx
      if (!seen[i]) {
        seen[i] = 1
        stack.push([nx, ny])
      }
    }
  }
  return count
}
