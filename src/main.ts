import '@fontsource/fraunces/600.css'
import '@fontsource/fraunces/400-italic.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import './style.css'

import { type Cell, MUD_COST, openGrid, sameCell } from './core/grid'
import { HEURISTICS, type HeuristicName } from './core/heuristics'
import { type MazeKind, mazeExit, seededMaze } from './core/maze'
import {
  ALGORITHM_LABEL,
  ALGORITHMS,
  type Algorithm,
  type SearchOptions,
  type SearchResult,
  type SearchStep,
  search,
  usesHeuristic,
} from './core/search'
import { decodeScene, encodeScene, type Scene } from './core/serialize'
import { GridView } from './ui/renderer'
import { buildShell, panelTemplate } from './ui/shell'

type Tool = 'wall' | 'mud' | 'erase' | 'start' | 'goal'
const TOOLS: readonly Tool[] = ['wall', 'mud', 'erase', 'start', 'goal']
const SIZES: ReadonlyArray<readonly [number, number]> = [[21, 13], [41, 25], [59, 39]]

interface Panel {
  algo: Algorithm
  view: GridView
  root: HTMLElement
  gen: Generator<SearchStep, SearchResult, void> | null
  count: number
  result: SearchResult | null
}

// ---- state -----------------------------------------------------------------

function defaultScene(): Scene {
  const grid = openGrid(41, 25)
  for (let y = 3; y <= 21; y++) grid.wall[y][20] = true
  for (let x = 25; x <= 34; x++) grid.wall[18][x] = true
  for (let y = 0; y < 25; y++) {
    for (let x = 0; x < 41; x++) {
      if (((x - 12) / 5) ** 2 + ((y - 6) / 3.2) ** 2 <= 1) grid.weight[y][x] = MUD_COST
    }
  }
  return {
    grid,
    start: [4, 12],
    goal: [36, 12],
    algo: 'astar',
    compare: 'dijkstra',
    heuristic: 'manhattan',
    diagonal: false,
    cutCorners: false,
  }
}

const scene: Scene = decodeScene(location.hash) ?? defaultScene()
let tool: Tool = 'wall'
let playing = false
let speed = 70
let stepBudget = 0
let lastTs = 0
let panels: Panel[] = []
let writtenHash = ''

const stepsPerSecond = () => 2 * 1.07 ** speed
const searchOpts = (): SearchOptions => ({
  heuristic: HEURISTICS[scene.heuristic],
  diagonal: scene.diagonal,
  cutCorners: scene.cutCorners,
})

// ---- DOM ------------------------------------------------------------------------

const ui = buildShell(document.querySelector<HTMLDivElement>('#app')!, { algorithms: ALGORITHMS, labels: ALGORITHM_LABEL, sizes: SIZES })

function makePanel(algo: Algorithm): Panel {
  const root = panelTemplate()
  const view = new GridView(scene.grid, scene.start, scene.goal)
  root.appendChild(view.el)
  bindPainting(view)
  return { algo, view, root, gen: null, count: 0, result: null }
}

function rebuildPanels(): void {
  ui.stage.replaceChildren()
  panels = [makePanel(scene.algo)]
  if (scene.compare) panels.push(makePanel(scene.compare))
  ui.stage.classList.toggle('split', panels.length === 2)
  for (const p of panels) ui.stage.appendChild(p.root)
  fitAll()
  restart(0)
}

function fitAll(): void {
  const availH = Math.max(220, Math.min(880, window.innerHeight - 150))
  for (const p of panels) {
    const cs = getComputedStyle(p.view.el)
    const availW = p.view.el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
    p.view.fit(availW, availH)
    p.view.flush()
  }
}

// ---- search lifecycle -----------------------------------------------------------

function restart(progress: number): void {
  for (const p of panels) {
    p.gen = search(scene.grid, scene.start, scene.goal, p.algo, searchOpts())
    p.count = 0
    p.result = null
    p.view.clearInk()
    p.view.setPath(null)
  }
  advance(progress)
}

function stepPanel(p: Panel): void {
  if (!p.gen || p.result) return
  const r = p.gen.next()
  if (r.done) {
    p.result = r.value
    p.view.setPath(r.value.path)
  } else {
    p.view.applyStep(r.value)
    p.count++
  }
}

function advance(n: number): void {
  for (const p of panels) for (let k = 0; k < n && !p.result; k++) stepPanel(p)
  for (const p of panels) p.view.flush()
  renderStats()
}

const allDone = () => panels.every((p) => p.result)
/** How far the current run has progressed, so an edited map can be replayed to the same point. */
const progressNow = () => (panels.some((p) => p.result) ? Infinity : Math.max(0, ...panels.map((p) => p.count)))

function setPlaying(v: boolean): void {
  if (v && allDone()) restart(0)
  playing = v
  ui.play.textContent = playing ? 'Pause' : 'Play'
  ui.play.setAttribute('aria-pressed', String(playing))
  if (playing) {
    lastTs = 0
    stepBudget = 0
    requestAnimationFrame(tick)
  }
  renderStats()
}

function tick(ts: number): void {
  if (!playing) return
  if (lastTs) stepBudget += ((ts - lastTs) / 1000) * stepsPerSecond()
  lastTs = ts
  const n = Math.floor(stepBudget)
  stepBudget -= n
  if (n > 0) advance(Math.min(n, 5000))
  if (allDone()) setPlaying(false)
  else requestAnimationFrame(tick)
}

function mapChanged(): void {
  restart(progressNow())
  scheduleHash()
}

// ---- stats ----------------------------------------------------------------------

function fmtCost(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(2)
}

function renderStats(): void {
  for (const p of panels) {
    const heur = usesHeuristic(p.algo) ? ` · ${scene.heuristic}` : ''
    p.root.querySelector('.panel-title')!.textContent = ALGORITHM_LABEL[p.algo] + heur
    const q = (k: string) => p.root.querySelector<HTMLElement>(`[data-stat="${k}"]`)!
    q('expanded').textContent = String(p.result?.expanded ?? p.count)
    q('cost').textContent = p.result?.path ? fmtCost(p.result.cost) : '—'
    q('length').textContent = p.result?.path ? `${p.result.path.length} cells` : '—'
    const status = p.root.querySelector<HTMLElement>('[data-status]')!
    const [text, kind] = p.result
      ? p.result.path ? ['Path found', 'ok'] : ['No path — goal is sealed off', 'fail']
      : p.count === 0 ? ['Ready — press Play', 'idle'] : playing ? ['Searching…', 'live'] : ['Paused', 'idle']
    status.textContent = text
    status.dataset.kind = kind
  }
}

// ---- painting -------------------------------------------------------------------

function paintCell([x, y]: Cell, t: Tool): boolean {
  const g = scene.grid
  const isMarker = sameCell([x, y], scene.start) || sameCell([x, y], scene.goal)
  switch (t) {
    case 'wall':
      if (isMarker || g.wall[y][x]) return false
      g.wall[y][x] = true
      g.weight[y][x] = 1
      break
    case 'mud':
      if (!g.wall[y][x] && g.weight[y][x] === MUD_COST) return false
      g.wall[y][x] = false
      g.weight[y][x] = MUD_COST
      break
    case 'erase':
      if (!g.wall[y][x] && g.weight[y][x] === 1) return false
      g.wall[y][x] = false
      g.weight[y][x] = 1
      break
    case 'start':
    case 'goal': {
      if (g.wall[y][x] || isMarker) return false
      if (t === 'start') scene.start = [x, y]
      else scene.goal = [x, y]
      for (const p of panels) p.view.setMarkers(scene.start, scene.goal)
      return true
    }
  }
  for (const p of panels) p.view.touch(x, y)
  return true
}

/** Paint every cell on the straight line between two cells so fast drags leave no gaps. */
function paintLine(from: Cell, to: Cell, t: Tool): boolean {
  let [x0, y0] = from
  const [x1, y1] = to
  const dx = Math.abs(x1 - x0)
  const dy = -Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx + dy
  let changed = false
  for (;;) {
    changed = paintCell([x0, y0], t) || changed
    if (x0 === x1 && y0 === y1) return changed
    const e2 = 2 * err
    if (e2 >= dy) {
      err += dy
      x0 += sx
    }
    if (e2 <= dx) {
      err += dx
      y0 += sy
    }
  }
}

function bindPainting(view: GridView): void {
  let active: Tool | null = null
  let last: Cell | null = null
  view.el.addEventListener('contextmenu', (e) => e.preventDefault())
  view.el.addEventListener('pointerdown', (e) => {
    const cell = view.cellAt(e.clientX, e.clientY)
    if (!cell) return
    e.preventDefault()
    view.el.setPointerCapture(e.pointerId)
    // grabbing a marker moves it regardless of the selected brush; right button always erases
    active = e.button === 2 ? 'erase' : sameCell(cell, scene.start) ? 'start' : sameCell(cell, scene.goal) ? 'goal' : tool
    last = cell
    if (paintCell(cell, active)) mapChanged()
  })
  view.el.addEventListener('pointermove', (e) => {
    if (!active || !last) return
    const cell = view.cellAt(e.clientX, e.clientY)
    if (!cell || sameCell(cell, last)) return
    const changed = active === 'start' || active === 'goal' ? paintCell(cell, active) : paintLine(last, cell, active)
    last = cell
    if (changed) mapChanged()
  })
  const end = () => {
    active = null
    last = null
  }
  view.el.addEventListener('pointerup', end)
  view.el.addEventListener('pointercancel', end)
}

// ---- map actions ------------------------------------------------------------------

function replaceGrid(grid: Scene['grid'], start: Cell, goal: Cell): void {
  scene.grid = grid
  scene.start = start
  scene.goal = goal
  for (const p of panels) {
    p.view.setGrid(grid)
    p.view.setMarkers(start, goal)
  }
  setPlaying(false)
  fitAll()
  restart(0)
  scheduleHash()
}

function generateMaze(kind: MazeKind): void {
  const { width, height } = scene.grid
  const seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0
  replaceGrid(seededMaze(width, height, seed, kind), [0, 0], mazeExit(width, height))
  toast(`${kind === 'prim' ? 'Randomized Prim' : 'Recursive backtracker'} maze · seed ${seed.toString(16)}`)
}

function resizeGrid(width: number, height: number): void {
  const mid = Math.floor(height / 2)
  replaceGrid(openGrid(width, height), [Math.min(2, width - 1), mid], [Math.max(0, width - 3), mid])
}

// ---- URL hash ---------------------------------------------------------------------

let hashTimer = 0
function scheduleHash(): void {
  clearTimeout(hashTimer)
  hashTimer = window.setTimeout(() => {
    writtenHash = '#' + encodeScene(scene)
    history.replaceState(null, '', writtenHash)
  }, 250)
}

window.addEventListener('hashchange', () => {
  if (location.hash === writtenHash) return
  const next = decodeScene(location.hash)
  if (!next) return
  Object.assign(scene, next)
  syncControls()
  setPlaying(false)
  rebuildPanels()
})

// ---- toast ------------------------------------------------------------------------

let toastTimer = 0
function toast(msg: string): void {
  ui.toast.textContent = msg
  ui.toast.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => ui.toast.classList.remove('show'), 2400)
}

// ---- controls ---------------------------------------------------------------------

function syncControls(): void {
  ui.algo.value = scene.algo
  ui.compare.value = scene.compare ?? ''
  ui.heuristic.value = scene.heuristic
  ui.heuristic.disabled = !usesHeuristic(scene.algo) && !(scene.compare && usesHeuristic(scene.compare))
  ui.diagonal.checked = scene.diagonal
  ui.cut.checked = scene.cutCorners
  ui.cut.disabled = !scene.diagonal
  ui.size.value = `${scene.grid.width}x${scene.grid.height}`
  ui.speed.value = String(speed)
  ui.speedOut.textContent = `${Math.round(stepsPerSecond())} steps/s`
  for (const r of ui.tools) r.checked = r.value === tool
}

ui.algo.addEventListener('change', () => {
  scene.algo = ui.algo.value as Algorithm
  syncControls()
  rebuildPanels()
  scheduleHash()
})
ui.compare.addEventListener('change', () => {
  scene.compare = (ui.compare.value || null) as Algorithm | null
  syncControls()
  rebuildPanels()
  scheduleHash()
})
ui.heuristic.addEventListener('change', () => {
  scene.heuristic = ui.heuristic.value as HeuristicName
  mapChanged()
})
ui.diagonal.addEventListener('change', () => {
  scene.diagonal = ui.diagonal.checked
  syncControls()
  mapChanged()
})
ui.cut.addEventListener('change', () => {
  scene.cutCorners = ui.cut.checked
  mapChanged()
})
ui.speed.addEventListener('input', () => {
  speed = Number(ui.speed.value)
  ui.speedOut.textContent = `${Math.round(stepsPerSecond())} steps/s`
})
for (const r of ui.tools) {
  r.addEventListener('change', () => {
    if (r.checked) tool = r.value as Tool
  })
}
ui.play.addEventListener('click', () => setPlaying(!playing))
ui.step.addEventListener('click', () => {
  setPlaying(false)
  if (allDone()) restart(0)
  advance(1)
})
ui.reset.addEventListener('click', () => {
  setPlaying(false)
  restart(0)
})
ui.size.addEventListener('change', () => {
  const [w, h] = ui.size.value.split('x').map(Number)
  resizeGrid(w, h)
})
ui.mazeBacktracker.addEventListener('click', () => generateMaze('backtracker'))
ui.mazePrim.addEventListener('click', () => generateMaze('prim'))
ui.clear.addEventListener('click', () => resizeGrid(scene.grid.width, scene.grid.height))
ui.share.addEventListener('click', async () => {
  writtenHash = '#' + encodeScene(scene)
  history.replaceState(null, '', writtenHash)
  try {
    await navigator.clipboard.writeText(location.href)
    toast('Link copied — the whole map is in the URL')
  } catch {
    toast('Could not reach the clipboard; copy the address bar instead')
  }
})

window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return
  const k = e.key.toLowerCase()
  const target = e.target instanceof HTMLElement ? e.target : null
  if (target?.closest('input, select, textarea')) return
  if (target?.closest('button') && (k === ' ' || k === 'enter')) return // let the focused button handle it
  if (k === ' ') setPlaying(!playing)
  else if (k === '.' || k === 'arrowright') ui.step.click()
  else if (k === 'r') ui.reset.click()
  else if (k === 'd') {
    ui.diagonal.checked = !ui.diagonal.checked
    ui.diagonal.dispatchEvent(new Event('change'))
  } else if (k >= '1' && k <= '5') {
    tool = TOOLS[Number(k) - 1]
    syncControls()
  } else return
  e.preventDefault()
})

let resizeTimer = 0
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer)
  resizeTimer = window.setTimeout(fitAll, 80)
})

// ---- boot -------------------------------------------------------------------------

syncControls()
rebuildPanels()
document.fonts?.ready.then(() => {
  for (const p of panels) p.view.invalidate()
  for (const p of panels) p.view.flush()
})
window.setTimeout(() => setPlaying(true), 350)
