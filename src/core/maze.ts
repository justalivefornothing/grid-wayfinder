import { type Cell, type Grid, openGrid } from './grid'

export type MazeKind = 'backtracker' | 'prim'

/** Small, fast, seedable PRNG (mulberry32). Returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Perfect maze on a grid: passages live on even coordinates, walls between
 * them on odd ones. Odd `width`/`height` use the whole grid; even ones leave
 * the last row/column solid. Start at `[0, 0]`; the far corner is `mazeExit`.
 */
export function seededMaze(width: number, height: number, seed: number, kind: MazeKind = 'backtracker'): Grid {
  const grid = openGrid(width, height)
  for (const row of grid.wall) row.fill(true)

  const cw = Math.ceil(width / 2)
  const ch = Math.ceil(height / 2)
  const rand = mulberry32(seed)
  const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)]
  const carve = (x: number, y: number) => {
    grid.wall[y][x] = false
  }
  /** Link maze cell (i,j) to (ni,nj): open both cells and the wall between. */
  const link = (i: number, j: number, ni: number, nj: number) => {
    carve(2 * ni, 2 * nj)
    carve(i + ni, j + nj)
  }
  const around = (i: number, j: number): Cell[] => {
    const out: Cell[] = []
    if (i + 1 < cw) out.push([i + 1, j])
    if (i > 0) out.push([i - 1, j])
    if (j + 1 < ch) out.push([i, j + 1])
    if (j > 0) out.push([i, j - 1])
    return out
  }

  const inMaze = new Uint8Array(cw * ch)
  const mark = (i: number, j: number) => {
    inMaze[j * cw + i] = 1
  }
  const isIn = (c: Cell) => inMaze[c[1] * cw + c[0]] === 1

  carve(0, 0)
  mark(0, 0)

  if (kind === 'backtracker') {
    // Depth-first carving: long winding corridors with few branches.
    const stack: Cell[] = [[0, 0]]
    while (stack.length) {
      const [i, j] = stack[stack.length - 1]
      const options = around(i, j).filter((c) => !isIn(c))
      if (options.length === 0) {
        stack.pop()
        continue
      }
      const [ni, nj] = pick(options)
      mark(ni, nj)
      link(i, j, ni, nj)
      stack.push([ni, nj])
    }
  } else {
    // Randomized Prim: grow from a random frontier cell — short, bushy dead ends.
    const inFrontier = new Uint8Array(cw * ch)
    const frontier: Cell[] = []
    const expose = (i: number, j: number) => {
      for (const c of around(i, j)) {
        const k = c[1] * cw + c[0]
        if (!inMaze[k] && !inFrontier[k]) {
          inFrontier[k] = 1
          frontier.push(c)
        }
      }
    }
    expose(0, 0)
    while (frontier.length) {
      const k = Math.floor(rand() * frontier.length)
      const [i, j] = frontier[k]
      frontier[k] = frontier[frontier.length - 1]
      frontier.pop()
      const [pi, pj] = pick(around(i, j).filter(isIn))
      mark(i, j)
      link(pi, pj, i, j)
      expose(i, j)
    }
  }
  return grid
}

/** The far corner passage of a maze built by `seededMaze`. */
export function mazeExit(width: number, height: number): Cell {
  return [2 * (Math.ceil(width / 2) - 1), 2 * (Math.ceil(height / 2) - 1)]
}
