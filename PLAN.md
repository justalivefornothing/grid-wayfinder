# Trailblaze Grid — Plan

Paint walls and mud on a canvas grid, then watch BFS, Dijkstra, Greedy, and A*
flood outward and trace their paths.

## Goal

A small, polished pathfinding visualizer whose search core is written from
scratch (no libraries) and fully unit-tested in a DOM-free module. The UI is a
vintage topographic map: cream paper, hatched brown ridges for walls, olive
mud, ink-blue visited tint that deepens with g-cost, and a dashed red survey
line for the final path.

## Features

1. Canvas grid (up to 60x40) with paint tools: wall, mud (cost 5), eraser,
   start, goal. Drag to paint.
2. Four algorithms from scratch: BFS, Dijkstra (binary heap), Greedy best-first,
   A* with Manhattan / Euclidean / Chebyshev heuristics.
3. Animated frontier / visited / path layers with step-through and a speed
   slider; live counts of expanded nodes and path cost.
4. Maze generators: recursive backtracker and randomized Prim.
5. Diagonal movement toggle with a corner-cutting rule.
6. Compare mode: two algorithms run side by side on the same grid.
7. Grid state serialized to the URL hash for sharing / reload.

## Architecture

```
src/
  core/
    grid.ts        Grid type, openGrid, neighbors (4/8-way, corner rule)
    heap.ts        Hand-rolled binary min-heap
    heuristics.ts  manhattan / euclidean / chebyshev / zero
    search.ts      One generator-based search loop, parameterized by priority
    maze.ts        Seeded PRNG, recursive backtracker, randomized Prim
    serialize.ts   Grid <-> compact URL-hash string
  ui/
    renderer.ts    Canvas renderer with dirty-cell diffing
    controls.ts    Toolbar wiring, keyboard shortcuts
  main.ts          App state, animation loop, compare mode
  style.css        Topographic theme (custom properties, @fontsource)
```

Search is a generator yielding one snapshot per expansion (`{ cell, g, frontier }`),
so the UI can step, pause, and re-target without knowing anything about the
algorithm. BFS uses FIFO ordering, Dijkstra orders by g, Greedy by h, A* by
g + h — all through the same loop and the same heap.

## Milestones

- [ ] Plan, license, git init
- [ ] Vite vanilla-ts scaffold + vitest
- [ ] Core: heap, grid, heuristics, search generator, tests green
- [ ] Renderer + paint tools + animation controls
- [ ] Mazes, diagonals, compare mode, URL hash
- [ ] Build clean, smoke test, screenshot
- [ ] README, publish
