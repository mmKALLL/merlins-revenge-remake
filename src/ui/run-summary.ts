// The roguelite run summary (docs/plans/2026-10-25-roguelite-mode-design.md, Run end): shown when a
// run ends in a death or the win, with the floors reached, the score, the time, the spells collected
// (and the wizards found, if any) and the biomes visited, then the statistics, and New run and Main menu. Like the floor pick, its
// buttons take no press for PICK_LOCK_MS after it opens, so a key still held from play skips nothing.
import type { RogueliteStats } from '../data/roguelite-stats'
import { PICK_LOCK_MS, pickUnlocked } from '../run/pick'
import { ROGUELITE_FLOOR_COUNT } from '../run/run'
import { button, el, menuList, panel } from './dom'
import { focusInRows } from './grid-nav'
import { scrollArt, scrollName, unitRow, type PickArt, type SpriteArt } from './floor-pick'
import type { MenuPanel } from './overlay'
import { statsPanel } from './roguelite-stats-view'

export interface RunSummary {
  won: boolean
  /** the floors reached, 1 = only the first */
  floorsReached: number
  /** the run's total; null when the run has no score (its world mode was switched) */
  score: number | null
  /** the best total of the roguelite map in the run's world mode */
  bestScore: number
  /** the run's time, m:ss */
  time: string
  /** the scrolls (actor keys) of the spells collected during the run */
  spells: readonly string[]
  /** the friendly wizards (actor keys) Merlin had at the run's end */
  wizards: readonly string[]
  /** the names of the biomes visited, floor by floor */
  biomes: readonly string[]
  /** the statistics with this run counted */
  stats: RogueliteStats
}

export interface RunSummaryActions {
  newRun: () => void
  mainMenu: () => void
}

export interface RunSummaryPanel extends MenuPanel {
  /** Fills the panel (the spells and wizards drawn by `art`) and starts its lock; the overlay shows it next. */
  open(summary: RunSummary, art: PickArt): void
}

export function runSummary(actions: RunSummaryActions, now: () => number = () => performance.now()): RunSummaryPanel {
  const { root, body } = panel('Run over')
  root.classList.add('run-summary')
  const heading = root.querySelector('h2')!
  const outcome = el('p', 'hint')
  const facts = el('dl', 'summary-facts')
  const spells = el('div', 'summary-spells')
  const wizardsHeading = el('h3', '', 'Wizards')
  const wizards = el('div', 'summary-wizards')
  const stats = el('div')
  let openedAt = 0
  let unlockTimer: number | undefined
  // the buttons do nothing while the panel is locked
  const unlocked = () => pickUnlocked(openedAt, now())
  const newRun = button('New run', () => { if (unlocked()) actions.newRun() }, 'primary')
  const mainMenu = button('Main menu', () => { if (unlocked()) actions.mainMenu() })
  const setLocked = (locked: boolean) => {
    root.classList.toggle('locked', locked)
    for (const b of [newRun, mainMenu]) b.setAttribute('aria-disabled', String(locked))
  }
  // W and S step between the buttons like the arrows (capture phase: ahead of the overlay's arrow keys)
  document.addEventListener('keydown', (e) => {
    if (!root.hidden) focusInRows([[newRun], [mainMenu]], e)
  }, true)
  body.append(outcome, facts, el('h3', '', 'Spells collected'), spells, wizardsHeading, wizards, el('h3', '', 'Statistics'), stats, menuList(newRun, mainMenu))

  const open = (s: RunSummary, art: PickArt) => {
    window.clearTimeout(unlockTimer)
    heading.textContent = s.won ? 'Victory!' : 'Run over'
    outcome.textContent = s.won ? 'Merlin climbed out of the last floor.' : `Merlin fell on floor ${s.floorsReached}.`
    facts.replaceChildren(
      ...fact('Floors reached', `${s.floorsReached} of ${ROGUELITE_FLOOR_COUNT}`),
      ...fact('Score', s.score === null ? 'none (camera switched)' : `${s.score} (best ${s.bestScore})`),
      ...fact('Time', s.time),
      ...fact('Route', s.biomes.join(' → ')),
    )
    spells.replaceChildren(...(s.spells.length === 0 ? [el('span', 'hint', 'None')] : s.spells.map((scroll) => spellCard(scroll, art.sprite))))
    wizardsHeading.hidden = wizards.hidden = s.wizards.length === 0
    wizards.replaceChildren(unitRow(s.wizards, art.unit))
    stats.replaceChildren(statsPanel(s.stats))
    openedAt = now()
    setLocked(true)
    unlockTimer = window.setTimeout(() => setLocked(false), PICK_LOCK_MS)
  }
  return { root, open }
}

function fact(name: string, value: string): HTMLElement[] {
  return [el('dt', '', name), el('dd', '', value)]
}

/** A collected spell: its scroll and writing, as on the pick screen's spell card. */
function spellCard(scroll: string, art: SpriteArt): HTMLElement {
  const card = el('span', 'summary-spell')
  card.title = scrollName(scroll)
  card.append(scrollArt(scroll, art))
  return card
}
