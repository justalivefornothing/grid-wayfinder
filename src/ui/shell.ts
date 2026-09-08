import type { Algorithm } from '../core/search'

export interface ShellOptions {
  algorithms: readonly Algorithm[]
  labels: Record<Algorithm, string>
  sizes: ReadonlyArray<readonly [number, number]>
}

export interface ShellRefs {
  stage: HTMLElement
  tools: HTMLInputElement[]
  algo: HTMLSelectElement
  compare: HTMLSelectElement
  heuristic: HTMLSelectElement
  diagonal: HTMLInputElement
  cut: HTMLInputElement
  play: HTMLButtonElement
  step: HTMLButtonElement
  reset: HTMLButtonElement
  speed: HTMLInputElement
  speedOut: HTMLOutputElement
  size: HTMLSelectElement
  mazeBacktracker: HTMLButtonElement
  mazePrim: HTMLButtonElement
  clear: HTMLButtonElement
  share: HTMLButtonElement
  toast: HTMLElement
}

const BRUSHES: ReadonlyArray<[value: string, label: string, key: string]> = [
  ['wall', 'Ridge', '1'],
  ['mud', 'Mud', '2'],
  ['erase', 'Erase', '3'],
  ['start', 'Start', '4'],
  ['goal', 'Goal', '5'],
]

export function buildShell(root: HTMLElement, o: ShellOptions): ShellRefs {
  const algoOptions = o.algorithms.map((a) => `<option value="${a}">${o.labels[a]}</option>`).join('')
  root.innerHTML = `
  <header class="masthead">
    <div>
      <h1>Trailblaze Grid</h1>
      <p class="tagline">Paint ridges and mud, then watch four searches flood the map.</p>
    </div>
    <button type="button" class="btn" id="share">Copy share link</button>
  </header>

  <div class="workbench">
    <aside class="controls" aria-label="Controls">
      <section class="group">
        <h2>Brush</h2>
        <div class="seg" role="radiogroup" aria-label="Brush">
          ${BRUSHES.map(
            ([v, l, k]) => `
          <label class="seg-item">
            <input type="radio" name="tool" value="${v}" />
            <span title="Key ${k}"><i class="swatch swatch-${v}" aria-hidden="true"></i>${l}</span>
          </label>`,
          ).join('')}
        </div>
        <p class="hint">Drag to paint. Right-drag erases. Grab the start disc or goal target to move it — even mid-search.</p>
      </section>

      <section class="group">
        <h2>Search</h2>
        <label class="field">Algorithm<select id="algo">${algoOptions}</select></label>
        <label class="field">Compare with<select id="compare"><option value="">Nothing — single view</option>${algoOptions}</select></label>
        <label class="field">Heuristic<select id="heuristic">
          <option value="manhattan">Manhattan</option>
          <option value="euclidean">Euclidean</option>
          <option value="chebyshev">Chebyshev</option>
        </select></label>
        <label class="check"><input type="checkbox" id="diagonal" /> Diagonal moves <kbd>D</kbd></label>
        <label class="check"><input type="checkbox" id="cut" /> Allow corner cutting</label>
      </section>

      <section class="group">
        <h2>Playback</h2>
        <div class="row">
          <button type="button" class="btn btn-primary" id="play" aria-pressed="false">Play</button>
          <button type="button" class="btn" id="step">Step</button>
          <button type="button" class="btn" id="reset">Reset</button>
        </div>
        <label class="field range">Speed <output id="speedOut" for="speed"></output>
          <input type="range" id="speed" min="0" max="100" step="1" />
        </label>
      </section>

      <section class="group">
        <h2>Map</h2>
        <label class="field">Size<select id="size">
          ${o.sizes.map(([w, h]) => `<option value="${w}x${h}">${w} × ${h}</option>`).join('')}
        </select></label>
        <div class="row">
          <button type="button" class="btn" id="mazeBacktracker">Backtracker maze</button>
          <button type="button" class="btn" id="mazePrim">Prim maze</button>
        </div>
        <button type="button" class="btn" id="clear">Clear map</button>
      </section>

      <section class="group legend">
        <h2>Legend</h2>
        <ul>
          <li><i class="swatch swatch-wall"></i>Ridge — impassable</li>
          <li><i class="swatch swatch-mud"></i>Mud — costs 5 to enter</li>
          <li><i class="swatch swatch-frontier"></i>Frontier — queued</li>
          <li><i class="swatch swatch-visited"></i>Visited — darker with distance</li>
          <li><i class="swatch swatch-path"></i>Survey line — final path</li>
        </ul>
      </section>

      <p class="keys"><kbd>Space</kbd> play · <kbd>.</kbd> step · <kbd>R</kbd> reset · <kbd>1</kbd>–<kbd>5</kbd> brushes</p>
    </aside>

    <main class="stage" id="stage" aria-live="off"></main>
  </div>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>`

  const $ = <T extends HTMLElement>(sel: string): T => root.querySelector<T>(sel)!
  return {
    stage: $('#stage'),
    tools: [...root.querySelectorAll<HTMLInputElement>('input[name="tool"]')],
    algo: $('#algo'),
    compare: $('#compare'),
    heuristic: $('#heuristic'),
    diagonal: $('#diagonal'),
    cut: $('#cut'),
    play: $('#play'),
    step: $('#step'),
    reset: $('#reset'),
    speed: $('#speed'),
    speedOut: $('#speedOut'),
    size: $('#size'),
    mazeBacktracker: $('#mazeBacktracker'),
    mazePrim: $('#mazePrim'),
    clear: $('#clear'),
    share: $('#share'),
    toast: $('#toast'),
  }
}

export function panelTemplate(): HTMLElement {
  const el = document.createElement('section')
  el.className = 'panel'
  el.innerHTML = `
    <header class="panel-head">
      <h3 class="panel-title"></h3>
      <dl class="stats">
        <div><dt>Expanded</dt><dd data-stat="expanded">0</dd></div>
        <div><dt>Cost</dt><dd data-stat="cost">—</dd></div>
        <div><dt>Path</dt><dd data-stat="length">—</dd></div>
      </dl>
      <span class="status" data-status data-kind="idle">Ready</span>
    </header>`
  return el
}
