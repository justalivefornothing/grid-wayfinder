import { describe, expect, it } from 'vitest'
import { type Cell, type Grid, MUD_COST, neighbors, openGrid, reachableCellCount } from '../src/core/grid'
import { chebyshev, euclidean, manhattan } from '../src/core/heuristics'
import { mazeExit, seededMaze } from '../src/core/maze'
import { astar, bfs, dijkstra, greedy, search } from '../src/core/search'

/** 7x7 open field with the goal at [5,5] boxed in by five walls. */
function gridWithGoalEnclosed(): Grid {
  const g = openGrid(7, 7)
  for (const [x, y] of [[4, 4], [5, 4], [6, 4], [4, 5], [4, 6]]) g.wall[y][x] = true
  return g
}

describe('bfs', () => {
  it('finds the 9-cell shortest path across an open 5x5 grid', () => {
    expect(bfs(openGrid(5, 5), [0, 0], [4, 4]).path?.length).toBe(9)
  })

  it('ignores terrain weight but reports the true cost of the path it found', () => {
    const g = openGrid(3, 1)
    g.weight[0][1] = MUD_COST
    const r = bfs(g, [0, 0], [2, 0])
    expect(r.path?.length).toBe(3)
    expect(r.cost).toBe(MUD_COST + 1)
  })
})

describe('dijkstra', () => {
  it('routes around a mud cell when that is cheaper', () => {
    const g = openGrid(3, 3)
    g.weight[1][1] = 5
    expect(dijkstra(g, [0, 0], [2, 2]).cost).toBe(4)
  })

  it('wades through mud when the detour is longer', () => {
    const g = openGrid(3, 3)
    for (const y of [0, 2]) g.wall[y][1] = true
    g.weight[1][1] = MUD_COST
    const r = dijkstra(g, [0, 1], [2, 1])
    expect(r.cost).toBe(MUD_COST + 1)
    expect(r.path).toEqual([[0, 1], [1, 1], [2, 1]])
  })
})

describe('heuristics', () => {
  it('manhattan', () => expect(manhattan([0, 0], [3, 4])).toBe(7))
  it('euclidean', () => expect(euclidean([0, 0], [3, 4])).toBe(5))
  it('chebyshev', () => expect(chebyshev([0, 0], [3, 4])).toBe(4))
})

describe('astar', () => {
  it('returns null and exhausts every reachable cell when the goal is enclosed', () => {
    const walled = gridWithGoalEnclosed()
    const start: Cell = [0, 0]
    const goal: Cell = [5, 5]
    expect(astar(walled, start, goal).path).toBeNull()
    expect(astar(walled, start, goal).expanded).toBe(reachableCellCount(walled, start))
  })

  it('does no more work than dijkstra on a seeded maze and matches its cost', () => {
    const m = seededMaze(21, 21, 7)
    const s: Cell = [0, 0]
    const t = mazeExit(21, 21)
    expect(astar(m, s, t, manhattan).expanded).toBeLessThanOrEqual(dijkstra(m, s, t).expanded)
    expect(astar(m, s, t).cost).toBe(dijkstra(m, s, t).cost)
  })

  it('expands far fewer cells than dijkstra on an open field', () => {
    const g = openGrid(30, 30)
    const a = astar(g, [15, 15], [28, 15])
    const d = dijkstra(g, [15, 15], [28, 15])
    expect(a.cost).toBe(13)
    expect(d.cost).toBe(13)
    expect(a.expanded * 3).toBeLessThan(d.expanded)
  })
})

describe('greedy', () => {
  it('reaches the goal but may pay more than dijkstra', () => {
    const g = openGrid(9, 5)
    for (let y = 0; y < 4; y++) g.wall[y][4] = true // wall with a gap at the bottom
    const r = greedy(g, [0, 0], [8, 0])
    expect(r.path?.at(-1)).toEqual([8, 0])
    expect(r.cost).toBeGreaterThanOrEqual(dijkstra(g, [0, 0], [8, 0]).cost)
  })
})

describe('diagonal movement', () => {
  it('costs √2 per diagonal step', () => {
    const r = dijkstra(openGrid(4, 4), [0, 0], [3, 3], { diagonal: true })
    expect(r.path?.length).toBe(4)
    expect(r.cost).toBeCloseTo(3 * Math.SQRT2)
  })

  it('refuses to cut corners unless allowed', () => {
    const g = openGrid(3, 3)
    g.wall[0][1] = true
    g.wall[1][0] = true
    expect(neighbors(g, 0, 0, { diagonal: true, cutCorners: false })).toEqual([])
    expect(neighbors(g, 0, 0, { diagonal: true, cutCorners: true })).toEqual([[1, 1, true]])
  })
})

describe('search generator', () => {
  it('yields one step per expansion and the start cell first', () => {
    const gen = search(openGrid(3, 3), [0, 0], [2, 2], 'bfs')
    const first = gen.next()
    expect(first.done).toBe(false)
    if (!first.done) {
      expect(first.value.cell).toEqual([0, 0])
      expect(first.value.discovered).toEqual([[1, 0], [0, 1]])
    }
    let steps = 1
    let r = gen.next()
    while (!r.done) {
      steps++
      r = gen.next()
    }
    expect(r.value.expanded).toBe(steps)
  })
})
