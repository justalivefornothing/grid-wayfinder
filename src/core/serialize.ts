import { type Cell, type Grid, MUD_COST, openGrid } from './grid'
import type { HeuristicName } from './heuristics'
import { ALGORITHMS, type Algorithm } from './search'

/** Everything needed to reproduce what the user sees. */
export interface Scene {
  grid: Grid
  start: Cell
  goal: Cell
  algo: Algorithm
  compare: Algorithm | null
  heuristic: HeuristicName
  diagonal: boolean
  cutCorners: boolean
}

export const MAX_WIDTH = 60
export const MAX_HEIGHT = 40

const HEURISTIC_NAMES: readonly HeuristicName[] = ['manhattan', 'euclidean', 'chebyshev']
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

/** 2 bits per cell (0 open · 1 wall · 2 mud), four cells per byte, base64url. */
export function packCells(grid: Grid): string {
  const n = grid.width * grid.height
  const bytes = new Uint8Array(Math.ceil(n / 4))
  for (let i = 0; i < n; i++) {
    const x = i % grid.width
    const y = (i - x) / grid.width
    const code = grid.wall[y][x] ? 1 : grid.weight[y][x] > 1 ? 2 : 0
    bytes[i >> 2] |= code << ((i & 3) * 2)
  }
  return toBase64Url(bytes)
}

export function unpackCells(packed: string, width: number, height: number): Grid {
  const grid = openGrid(width, height)
  const bytes = fromBase64Url(packed)
  const n = width * height
  if (bytes.length !== Math.ceil(n / 4)) throw new Error('cell data does not match grid size')
  for (let i = 0; i < n; i++) {
    const code = (bytes[i >> 2] >> ((i & 3) * 2)) & 3
    const x = i % width
    const y = (i - x) / width
    if (code === 1) grid.wall[y][x] = true
    else if (code === 2) grid.weight[y][x] = MUD_COST
  }
  return grid
}

function toBase64Url(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63]
    if (i + 1 < bytes.length) out += B64[(n >> 6) & 63]
    if (i + 2 < bytes.length) out += B64[n & 63]
  }
  return out
}

function fromBase64Url(s: string): Uint8Array {
  const out: number[] = []
  for (let i = 0; i < s.length; i += 4) {
    const c = [0, 1, 2, 3].map((k) => (i + k < s.length ? B64.indexOf(s[i + k]) : 0))
    if (c.some((v) => v < 0)) throw new Error('invalid base64url')
    const n = (c[0] << 18) | (c[1] << 12) | (c[2] << 6) | c[3]
    out.push((n >> 16) & 255)
    if (i + 2 < s.length) out.push((n >> 8) & 255)
    if (i + 3 < s.length) out.push(n & 255)
  }
  return Uint8Array.from(out)
}

/** Scene → URL-hash body (without the leading `#`). */
export function encodeScene(s: Scene): string {
  const p = new URLSearchParams()
  p.set('w', String(s.grid.width))
  p.set('h', String(s.grid.height))
  p.set('s', `${s.start[0]}.${s.start[1]}`)
  p.set('g', `${s.goal[0]}.${s.goal[1]}`)
  p.set('a', s.algo)
  if (s.compare) p.set('vs', s.compare)
  p.set('hz', s.heuristic)
  if (s.diagonal) p.set('d', s.cutCorners ? '2' : '1')
  p.set('m', packCells(s.grid))
  return p.toString()
}

/** URL-hash body → Scene, or null if anything is malformed. */
export function decodeScene(hash: string): Scene | null {
  try {
    const p = new URLSearchParams(hash.replace(/^#/, ''))
    const w = int(p.get('w'), 2, MAX_WIDTH)
    const h = int(p.get('h'), 2, MAX_HEIGHT)
    const start = cell(p.get('s'), w, h)
    const goal = cell(p.get('g'), w, h)
    const algo = oneOf(p.get('a'), ALGORITHMS) ?? 'astar'
    const compare = oneOf(p.get('vs'), ALGORITHMS)
    const heuristic = oneOf(p.get('hz'), HEURISTIC_NAMES) ?? 'manhattan'
    const d = p.get('d') ?? '0'
    const grid = unpackCells(p.get('m') ?? '', w, h)
    return { grid, start, goal, algo, compare, heuristic, diagonal: d !== '0', cutCorners: d === '2' }
  } catch {
    return null
  }
}

function int(v: string | null, min: number, max: number): number {
  const n = Number(v)
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`bad int ${v}`)
  return n
}

function cell(v: string | null, w: number, h: number): Cell {
  const [x, y] = (v ?? '').split('.')
  return [int(x, 0, w - 1), int(y, 0, h - 1)]
}

function oneOf<T extends string>(v: string | null, values: readonly T[]): T | null {
  return values.includes(v as T) ? (v as T) : null
}
