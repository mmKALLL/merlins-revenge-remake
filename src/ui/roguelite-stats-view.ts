// The roguelite statistics as shown on the run summary and under the title screen's Roguelite
// button (docs/plans/2026-10-25-roguelite-mode-design.md, Statistics): the runs, wins and win
// ratio, the streaks, and a small bar chart of the floors the finished runs reached.
import { winRatio, type RogueliteStats } from '../data/roguelite-stats'
import { ROGUELITE_FLOOR_COUNT } from '../run/run'
import { el } from './dom'

const PERCENT = 100
/** The tallest bar of the floors chart (px). */
const BAR_MAX_PX = 48

/** Finished runs per furthest floor, one count for every floor of a run. */
const floorCounts = (stats: RogueliteStats): number[] =>
  Array.from({ length: ROGUELITE_FLOOR_COUNT }, (_, i) => stats.floorsReached[i] ?? 0)

/** The totals in two short lines: the runs, wins and ratio; the streak and the best. */
export function statsLines(stats: RogueliteStats): string[] {
  if (stats.runs === 0) return [stats.streak > 0 ? `Win streak ${stats.streak}` : 'No runs finished yet']
  const ratio = Math.round(winRatio(stats) * PERCENT)
  return [`Runs ${stats.runs} · Wins ${stats.wins} (${ratio}%)`, `Win streak ${stats.streak} · best ${stats.bestStreak}`]
}

/**
 * The furthest floor of each finished run, one bar per floor with its count over it; the bars share
 * one scale, the largest count filling the chart's height.
 */
export function floorsChart(stats: RogueliteStats): HTMLElement {
  const chart = el('div', 'floors-chart')
  chart.setAttribute('role', 'img')
  const counts = floorCounts(stats)
  const most = Math.max(1, ...counts)
  chart.setAttribute('aria-label', `Furthest floor reached: ${counts.map((n, i) => `floor ${i + 1}, ${n}`).join('; ')}`)
  counts.forEach((n, i) => {
    const column = el('div', 'floors-column')
    column.title = `${n} ${n === 1 ? 'run' : 'runs'} ended on floor ${i + 1}`
    const bar = el('div', 'floors-bar')
    bar.style.height = `${Math.round((n / most) * BAR_MAX_PX)}px`
    column.append(el('span', 'floors-count', String(n)), bar, el('span', 'floors-label', `F${i + 1}`))
    chart.append(column)
  })
  return chart
}

/** The finished runs by their furthest floor, as a compact line: Furthest: F1 2 · F2 0 · ... */
export const floorsLine = (stats: RogueliteStats): string =>
  `Furthest: ${floorCounts(stats).map((n, i) => `F${i + 1} ${n}`).join(' · ')}`

/** The totals over the floors chart. */
export function statsPanel(stats: RogueliteStats): HTMLElement {
  const root = el('div', 'roguelite-stats')
  root.append(el('p', 'hint', statsLines(stats).join(' · ')))
  if (stats.runs > 0) root.append(el('span', 'hint', 'Furthest floor reached'), floorsChart(stats))
  return root
}
