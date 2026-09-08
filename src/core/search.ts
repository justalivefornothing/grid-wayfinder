import { type Cell, type Grid, type MoveRules, neighbors } from './grid'
import { MinHeap } from './heap'
import { type Heuristic, manhattan, zero } from './heuristics'

export type Algorithm = 'bfs' | 'dijkstra' | 'greedy' | 'astar'

export const ALGORITHMS: readonly Algorithm[] = ['bfs', 'dijkstra', 'greedy', 'astar']
export const ALGORITHM_LABEL: Record<Algorithm, string> = {
  bfs: 'BFS',
  dijkstra: 'Dijkstra',
  greedy: 'Greedy best-first',
  astar: 'A*',
}
export const usesHeuristic = (a: Algorithm): boolean => a === 'astar' || a === 'greedy'

export interface SearchOptions extends Partial<MoveRules> {
  heuristic?: Heuristic
}

/** One expansion: the cell popped from the frontier plus the neighbours it opened or improved. */
export interface SearchStep {
  readonly cell: Cell
  readonly g: number
  readonly discovered: readonly Cell[]
  readonly expanded: number
}

export interface SearchResult {
  /** Start-to-goal inclusive, or null when the goal is unreachable. */
  readonly path: Cell[] | null
  /** Weighted cost of `path` (Infinity when there is none). */
  readonly cost: number
  /** Cells popped and settled — the work the algorithm did. */
  readonly expanded: number
}

interface Entry {
  idx: number
  g: number
  f: number
  seq: number
}

/**
 * The only thing that differs between the four algorithms: how a frontier
 * entry's priority is derived from its path cost `g`, heuristic `h`, and
 * insertion order `seq`.
 */
const PRIORITY: Record<Algorithm, (g: number, h: number, seq: number) => number> = {
  bfs: (_g, _h, seq) => seq, // FIFO
  dijkstra: (g) => g,
  greedy: (_g, h) => h,
  astar: (g, h) => g + h,
}

/** Lower f first; on ties prefer the deeper node (helps A*), then FIFO. */
const less = (a: Entry, b: Entry): boolean =>
  a.f !== b.f ? a.f < b.f : a.g !== b.g ? a.g > b.g : a.seq < b.seq

/**
 * Uniform best-first search. Yields one `SearchStep` per expansion and returns
 * the `SearchResult` when the goal is settled or the frontier empties.
 */
export function* search(
  grid: Grid,
  start: Cell,
  goal: Cell,
  algo: Algorithm,
  opts: SearchOptions = {},
): Generator<SearchStep, SearchResult, void> {
  const { width, height } = grid
  const n = width * height
  const h: Heuristic = usesHeuristic(algo) ? opts.heuristic ?? manhattan : zero
  const priority = PRIORITY[algo]
  const weighted = algo !== 'bfs' // BFS counts steps; the rest count terrain cost

  const g = new Float64Array(n).fill(Infinity)
  const parent = new Int32Array(n).fill(-1)
  const closed = new Uint8Array(n)
  const heap = new MinHeap<Entry>(less)

  const startIdx = start[1] * width + start[0]
  const goalIdx = goal[1] * width + goal[0]
  let seq = 0
  let expanded = 0

  g[startIdx] = 0
  heap.push({ idx: startIdx, g: 0, f: priority(0, h(start, goal), seq), seq: seq++ })

  while (heap.size > 0) {
    const cur = heap.pop()!
    if (closed[cur.idx]) continue // stale duplicate left behind by a cheaper relaxation
    closed[cur.idx] = 1
    expanded++
    const cx = cur.idx % width
    const cy = (cur.idx - cx) / width

    if (cur.idx === goalIdx) {
      yield { cell: [cx, cy], g: cur.g, discovered: [], expanded }
      const path = reconstruct(parent, goalIdx, width)
      return { path, cost: pathCost(grid, path), expanded }
    }

    const discovered: Cell[] = []
    for (const [nx, ny, diag] of neighbors(grid, cx, cy, opts)) {
      const nIdx = ny * width + nx
      if (closed[nIdx]) continue
      const step = weighted ? grid.weight[ny][nx] * (diag ? Math.SQRT2 : 1) : 1
      const ng = cur.g + step
      if (ng < g[nIdx]) {
        g[nIdx] = ng
        parent[nIdx] = cur.idx
        heap.push({ idx: nIdx, g: ng, f: priority(ng, h([nx, ny], goal), seq), seq: seq++ })
        discovered.push([nx, ny])
      }
    }
    yield { cell: [cx, cy], g: cur.g, discovered, expanded }
  }
  return { path: null, cost: Infinity, expanded }
}

function reconstruct(parent: Int32Array, goalIdx: number, width: number): Cell[] {
  const path: Cell[] = []
  for (let i = goalIdx; i !== -1; i = parent[i]) {
    const x = i % width
    path.push([x, (i - x) / width])
  }
  return path.reverse()
}

/** Weighted cost of walking `path`: entered cell's weight, ×√2 on diagonal steps. */
export function pathCost(grid: Grid, path: readonly Cell[]): number {
  let cost = 0
  for (let i = 1; i < path.length; i++) {
    const [x, y] = path[i]
    const [px, py] = path[i - 1]
    cost += grid.weight[y][x] * (x !== px && y !== py ? Math.SQRT2 : 1)
  }
  return cost
}

/** Drain the generator and return the final result. */
export function runSearch(grid: Grid, start: Cell, goal: Cell, algo: Algorithm, opts?: SearchOptions): SearchResult {
  const gen = search(grid, start, goal, algo, opts)
  let r = gen.next()
  while (!r.done) r = gen.next()
  return r.value
}

export const bfs = (grid: Grid, start: Cell, goal: Cell, opts?: SearchOptions): SearchResult =>
  runSearch(grid, start, goal, 'bfs', opts)

export const dijkstra = (grid: Grid, start: Cell, goal: Cell, opts?: SearchOptions): SearchResult =>
  runSearch(grid, start, goal, 'dijkstra', opts)

export const greedy = (grid: Grid, start: Cell, goal: Cell, heuristic: Heuristic = manhattan, opts?: SearchOptions): SearchResult =>
  runSearch(grid, start, goal, 'greedy', { ...opts, heuristic })

export const astar = (grid: Grid, start: Cell, goal: Cell, heuristic: Heuristic = manhattan, opts?: SearchOptions): SearchResult =>
  runSearch(grid, start, goal, 'astar', { ...opts, heuristic })
