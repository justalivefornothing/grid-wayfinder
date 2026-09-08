import type { Cell, Grid } from '../core/grid'
import { manhattan } from '../core/heuristics'
import type { SearchStep } from '../core/search'

/** Margins reserved for the monospace coordinate labels. */
const ML = 28
const MT = 20

const INK = '30, 62, 122'
const RULE = 'rgba(107, 74, 43, 0.22)'
const FRAME = 'rgba(107, 74, 43, 0.6)'
const RIDGE = '#6b4a2b'
const RIDGE_HATCH = 'rgba(243, 234, 214, 0.42)'
const MUD = 'rgba(112, 118, 60, 0.55)'
const MUD_DOT = 'rgba(70, 76, 30, 0.45)'
const SURVEY = '#b8322e'
const LABEL = '#7a6a55'
const BENCHMARK = '#1f2a33'
const PAPER = '#f3ead6'

const Layer = { None: 0, Frontier: 1, Visited: 2 } as const

/**
 * One map plate: three stacked canvases.
 *  - base:  terrain (walls, mud, grid rules, coordinate labels) — dirty-cell diffed
 *  - ink:   frontier + visited tint                              — dirty-cell diffed
 *  - marks: path, start and goal                                  — redrawn whole (it is tiny)
 */
export class GridView {
  readonly el: HTMLDivElement
  private readonly base: HTMLCanvasElement
  private readonly ink: HTMLCanvasElement
  private readonly marks: HTMLCanvasElement
  private readonly bctx: CanvasRenderingContext2D
  private readonly ictx: CanvasRenderingContext2D
  private readonly mctx: CanvasRenderingContext2D

  private grid: Grid
  private start: Cell
  private goal: Cell
  private path: Cell[] | null = null
  private cell = 16
  private gScale = 1

  private layer: Uint8Array
  private gval: Float32Array
  private readonly dirtyBase = new Set<number>()
  private readonly dirtyInk = new Set<number>()
  private allBase = true
  private allInk = true
  private marksDirty = true

  constructor(grid: Grid, start: Cell, goal: Cell) {
    this.el = document.createElement('div')
    this.el.className = 'plate'
    this.base = document.createElement('canvas')
    this.ink = document.createElement('canvas')
    this.marks = document.createElement('canvas')
    for (const c of [this.base, this.ink, this.marks]) this.el.appendChild(c)
    this.bctx = this.base.getContext('2d')!
    this.ictx = this.ink.getContext('2d')!
    this.mctx = this.marks.getContext('2d')!
    this.grid = grid
    this.start = start
    this.goal = goal
    this.layer = new Uint8Array(grid.width * grid.height)
    this.gval = new Float32Array(grid.width * grid.height)
    this.setMarkers(start, goal)
  }

  get cellSize(): number {
    return this.cell
  }

  setGrid(grid: Grid): void {
    this.grid = grid
    this.layer = new Uint8Array(grid.width * grid.height)
    this.gval = new Float32Array(grid.width * grid.height)
    this.allBase = this.allInk = this.marksDirty = true
  }

  setMarkers(start: Cell, goal: Cell): void {
    this.start = start
    this.goal = goal
    const { width: w, height: h } = this.grid
    const corners: Cell[] = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]
    this.gScale = Math.max(1, ...corners.map((c) => manhattan(start, c)))
    this.marksDirty = true
  }

  setPath(path: Cell[] | null): void {
    this.path = path
    this.marksDirty = true
  }

  /** Mark a terrain cell as changed. */
  touch(x: number, y: number): void {
    this.dirtyBase.add(y * this.grid.width + x)
  }

  invalidate(): void {
    this.allBase = this.allInk = this.marksDirty = true
  }

  clearInk(): void {
    this.layer.fill(Layer.None)
    this.allInk = true
  }

  applyStep(step: SearchStep): void {
    const w = this.grid.width
    for (const [x, y] of step.discovered) {
      const i = y * w + x
      if (this.layer[i] === Layer.None) {
        this.layer[i] = Layer.Frontier
        this.dirtyInk.add(i)
      }
    }
    const i = step.cell[1] * w + step.cell[0]
    this.layer[i] = Layer.Visited
    this.gval[i] = step.g
    this.dirtyInk.add(i)
  }

  /** Pick a cell size that fits the available box and resize all three canvases. */
  fit(availW: number, availH: number): void {
    const { width, height } = this.grid
    const size = Math.floor(Math.min((availW - ML - 1) / width, (availH - MT - 1) / height))
    this.cell = Math.max(5, Math.min(36, size))
    const cssW = ML + this.cell * width + 1
    const cssH = MT + this.cell * height + 1
    const dpr = Math.min(3, window.devicePixelRatio || 1)
    for (const [c, ctx] of [[this.base, this.bctx], [this.ink, this.ictx], [this.marks, this.mctx]] as const) {
      c.width = Math.round(cssW * dpr)
      c.height = Math.round(cssH * dpr)
      c.style.width = `${cssW}px`
      c.style.height = `${cssH}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    this.invalidate()
  }

  /** Translate a pointer position into a grid cell, or null when off the map. */
  cellAt(clientX: number, clientY: number): Cell | null {
    const r = this.base.getBoundingClientRect()
    const x = Math.floor((clientX - r.left - ML) / this.cell)
    const y = Math.floor((clientY - r.top - MT) / this.cell)
    return x >= 0 && y >= 0 && x < this.grid.width && y < this.grid.height ? [x, y] : null
  }

  /** Paint everything that changed since the last flush. */
  flush(): void {
    const { width, height } = this.grid
    if (this.allBase) {
      this.drawBaseAll()
      this.allBase = false
      this.dirtyBase.clear()
    } else if (this.dirtyBase.size) {
      for (const i of this.dirtyBase) this.drawBaseCell(i % width, Math.floor(i / width))
      this.dirtyBase.clear()
    }
    if (this.allInk) {
      this.ictx.clearRect(0, 0, this.ink.width, this.ink.height)
      for (let i = 0; i < width * height; i++) if (this.layer[i]) this.drawInkCell(i % width, Math.floor(i / width))
      this.allInk = false
      this.dirtyInk.clear()
    } else if (this.dirtyInk.size) {
      for (const i of this.dirtyInk) this.drawInkCell(i % width, Math.floor(i / width))
      this.dirtyInk.clear()
    }
    if (this.marksDirty) {
      this.drawMarks()
      this.marksDirty = false
    }
  }

  // ---- base layer -------------------------------------------------------

  private drawBaseAll(): void {
    const ctx = this.bctx
    const { width, height } = this.grid
    const c = this.cell
    ctx.clearRect(0, 0, this.base.width, this.base.height)
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) this.drawBaseCell(x, y)

    // outer frame (right and bottom rules belong to no cell)
    ctx.strokeStyle = FRAME
    ctx.lineWidth = 1
    ctx.strokeRect(ML + 0.5, MT + 0.5, c * width, c * height)

    // coordinate labels + ticks
    const every = c >= 12 ? 5 : 10
    ctx.fillStyle = LABEL
    ctx.strokeStyle = FRAME
    ctx.font = `${c >= 10 ? 10 : 9}px 'IBM Plex Mono', ui-monospace, monospace`
    ctx.textBaseline = 'middle'
    for (let x = 0; x < width; x++) {
      const px = ML + x * c + c / 2
      const major = x % every === 0
      ctx.beginPath()
      ctx.moveTo(px + 0.5, MT - (major ? 6 : 3))
      ctx.lineTo(px + 0.5, MT)
      ctx.stroke()
      if (major) {
        ctx.textAlign = 'center'
        ctx.fillText(String(x), px, MT - 12)
      }
    }
    for (let y = 0; y < height; y++) {
      const py = MT + y * c + c / 2
      const major = y % every === 0
      ctx.beginPath()
      ctx.moveTo(ML - (major ? 6 : 3), py + 0.5)
      ctx.lineTo(ML, py + 0.5)
      ctx.stroke()
      if (major) {
        ctx.textAlign = 'right'
        ctx.fillText(String(y), ML - 9, py)
      }
    }
  }

  private drawBaseCell(x: number, y: number): void {
    const ctx = this.bctx
    const c = this.cell
    const px = ML + x * c
    const py = MT + y * c
    ctx.clearRect(px, py, c, c)

    if (this.grid.wall[y][x]) {
      ctx.fillStyle = RIDGE
      ctx.fillRect(px, py, c, c)
      // diagonal hatching that lines up across neighbouring ridge cells
      const s = c / (c >= 12 ? 4 : 2)
      ctx.strokeStyle = RIDGE_HATCH
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let k = s; k < 2 * c; k += s) {
        if (k <= c) {
          ctx.moveTo(px + k, py)
          ctx.lineTo(px, py + k)
        } else {
          ctx.moveTo(px + c, py + k - c)
          ctx.lineTo(px + k - c, py + c)
        }
      }
      ctx.stroke()
    } else if (this.grid.weight[y][x] > 1) {
      ctx.fillStyle = MUD
      ctx.fillRect(px, py, c, c)
      // deterministic stipple so the wash reads as marsh, not flat colour
      let h = (x * 73856093) ^ (y * 19349663)
      ctx.fillStyle = MUD_DOT
      for (let k = 0; k < 3; k++) {
        h = (h * 1103515245 + 12345) & 0x7fffffff
        const dx = 0.2 + 0.6 * ((h >> 8) & 255) / 255
        const dy = 0.2 + 0.6 * ((h >> 16) & 255) / 255
        ctx.beginPath()
        ctx.arc(px + dx * c, py + dy * c, Math.max(0.8, c * 0.06), 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // top and left rules; the neighbour to the right/below draws the others
    ctx.strokeStyle = RULE
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(px + 0.5, py)
    ctx.lineTo(px + 0.5, py + c)
    ctx.moveTo(px, py + 0.5)
    ctx.lineTo(px + c, py + 0.5)
    ctx.stroke()
  }

  // ---- ink layer --------------------------------------------------------

  private drawInkCell(x: number, y: number): void {
    const ctx = this.ictx
    const c = this.cell
    const px = ML + x * c
    const py = MT + y * c
    const i = y * this.grid.width + x
    ctx.clearRect(px, py, c, c)
    const kind = this.layer[i]
    if (kind === Layer.Frontier) {
      ctx.fillStyle = `rgba(${INK}, 0.10)`
      ctx.fillRect(px, py, c, c)
      ctx.strokeStyle = `rgba(${INK}, 0.7)`
      ctx.lineWidth = 1.5
      ctx.strokeRect(px + 2, py + 2, c - 4, c - 4)
    } else if (kind === Layer.Visited) {
      const t = Math.min(1, this.gval[i] / this.gScale)
      ctx.fillStyle = `rgba(${INK}, ${(0.13 + 0.52 * t).toFixed(3)})`
      ctx.fillRect(px, py, c, c)
    }
  }

  // ---- marks layer ------------------------------------------------------

  private drawMarks(): void {
    const ctx = this.mctx
    const c = this.cell
    const center = ([x, y]: Cell): [number, number] => [ML + x * c + c / 2, MT + y * c + c / 2]
    ctx.clearRect(0, 0, this.marks.width, this.marks.height)

    if (this.path && this.path.length > 1) {
      ctx.save()
      ctx.strokeStyle = SURVEY
      ctx.lineWidth = Math.max(2, c * 0.16)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.setLineDash([c * 0.45, c * 0.32])
      ctx.beginPath()
      this.path.forEach((cell, k) => {
        const [px, py] = center(cell)
        if (k === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      })
      ctx.stroke()
      ctx.restore()
    }

    // start: a benchmark disc
    const [sx, sy] = center(this.start)
    const r = Math.max(3.5, c * 0.32)
    ctx.fillStyle = BENCHMARK
    ctx.beginPath()
    ctx.arc(sx, sy, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = PAPER
    ctx.beginPath()
    ctx.arc(sx, sy, r * 0.38, 0, Math.PI * 2)
    ctx.fill()

    // goal: a surveyor's target
    const [gx, gy] = center(this.goal)
    ctx.strokeStyle = SURVEY
    ctx.lineWidth = Math.max(1.5, c * 0.12)
    ctx.beginPath()
    ctx.arc(gx, gy, r * 0.85, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(gx - r * 1.3, gy)
    ctx.lineTo(gx + r * 1.3, gy)
    ctx.moveTo(gx, gy - r * 1.3)
    ctx.lineTo(gx, gy + r * 1.3)
    ctx.stroke()
    ctx.fillStyle = SURVEY
    ctx.beginPath()
    ctx.arc(gx, gy, Math.max(1.2, r * 0.22), 0, Math.PI * 2)
    ctx.fill()
  }
}
