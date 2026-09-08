import { describe, expect, it } from 'vitest'
import { MUD_COST, openGrid, reachableCellCount } from '../src/core/grid'
import { MinHeap } from '../src/core/heap'
import { mazeExit, mulberry32, seededMaze } from '../src/core/maze'
import { decodeScene, encodeScene, packCells, type Scene, unpackCells } from '../src/core/serialize'

describe('MinHeap', () => {
  it('pops in ascending order', () => {
    const h = new MinHeap<number>((a, b) => a < b)
    const input = [5, 3, 9, 1, 7, 2, 8, 6, 4, 0]
    for (const v of input) h.push(v)
    const out: number[] = []
    while (h.size) out.push(h.pop()!)
    expect(out).toEqual([...input].sort((a, b) => a - b))
  })

  it('matches a sorted array under a random workload', () => {
    const rand = mulberry32(42)
    const h = new MinHeap<number>((a, b) => a < b)
    const mirror: number[] = []
    for (let i = 0; i < 2000; i++) {
      if (rand() < 0.6 || mirror.length === 0) {
        const v = Math.floor(rand() * 1000)
        h.push(v)
        mirror.push(v)
      } else {
        mirror.sort((a, b) => a - b)
        expect(h.pop()).toBe(mirror.shift())
      }
    }
    expect(h.size).toBe(mirror.length)
  })
})

describe('mazes', () => {
  it.each(['backtracker', 'prim'] as const)('%s: every passage is reachable and deterministic', (kind) => {
    const a = seededMaze(21, 21, 7, kind)
    const b = seededMaze(21, 21, 7, kind)
    expect(a.wall).toEqual(b.wall)
    let passages = 0
    for (const row of a.wall) for (const w of row) if (!w) passages++
    expect(passages).toBe(11 * 11 + (11 * 11 - 1)) // cells + one link per spanning-tree edge
    expect(reachableCellCount(a, [0, 0])).toBe(passages)
    expect(a.wall[20][20]).toBe(false)
    expect(mazeExit(21, 21)).toEqual([20, 20])
  })

  it('differs across seeds', () => {
    expect(seededMaze(21, 21, 1).wall).not.toEqual(seededMaze(21, 21, 2).wall)
  })
})

describe('serialize', () => {
  it('round-trips cell data', () => {
    const g = openGrid(13, 7)
    g.wall[2][3] = true
    g.wall[6][12] = true
    g.weight[0][0] = MUD_COST
    g.weight[5][9] = MUD_COST
    const back = unpackCells(packCells(g), 13, 7)
    expect(back.wall).toEqual(g.wall)
    expect(back.weight).toEqual(g.weight)
  })

  it('round-trips a whole scene through the hash format', () => {
    const grid = openGrid(41, 25)
    grid.wall[10][20] = true
    const scene: Scene = {
      grid,
      start: [1, 12],
      goal: [39, 12],
      algo: 'astar',
      compare: 'dijkstra',
      heuristic: 'chebyshev',
      diagonal: true,
      cutCorners: false,
    }
    const decoded = decodeScene('#' + encodeScene(scene))
    expect(decoded).toEqual(scene)
  })

  it('rejects malformed input instead of throwing', () => {
    expect(decodeScene('')).toBeNull()
    expect(decodeScene('w=999&h=2&s=0.0&g=1.1&m=AA')).toBeNull()
    expect(decodeScene('w=4&h=4&s=0.0&g=9.9&m=AAAA')).toBeNull()
    expect(decodeScene('w=4&h=4&s=0.0&g=3.3&m=!!')).toBeNull()
  })
})
