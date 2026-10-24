// The roguelite statistics as shown on the run summary and under the title screen's Roguelite
// button (docs/plans/2026-10-25-roguelite-mode-design.md, Statistics): the runs, wins and win
// ratio, the streaks, and a small bar chart of the floors the runs died on, with the wins beside them.
import { winRatio, type RogueliteStats } from '../data/roguelite-stats'
import { ROGUELITE_FLOOR_COUNT } from '../run/run'
import { el } from './dom'

const PERCENT = 100
/** The tallest bar of the floors chart (px). */
const BAR_MAX_PX = 48

/** Runs that died on each floor, one count for every floor of a run. */
const floorCounts = (stats: RogueliteStats): number[] =>
  Array.from({ length: ROGUELITE_FLOOR_COUNT }, (_, i) => stats.floorsReached[i] ?? 0)

/** The chart's columns: each floor's deaths, then the wins (owner: a win is not counted on the last floor). */
const chartColumns = (stats: RogueliteStats): { label: string; count: number; title: string }[] => [
  ...floorCounts(stats).map((n, i) => ({ label: `F${i + 1}`, count: n, title: `${n} ${n === 1 ? 'run' : 'runs'} ended on floor ${i + 1}` })),
  { label: 'Win', count: stats.wins, title: `${stats.wins} ${stats.wins === 1 ? 'win' : 'wins'}` },
]

/** The runs, wins and win ratio in one short line. */
export function runsLine(stats: RogueliteStats): string {
  if (stats.runs === 0) return 'No runs finished yet'
  return `Runs ${stats.runs} · Wins ${stats.wins} (${Math.round(winRatio(stats) * PERCENT)}%)`
}

/** The totals in two short lines: the runs, wins and ratio; the streak and the best. */
function statsLines(stats: RogueliteStats): string[] {
  if (stats.runs === 0) return [stats.streak > 0 ? `Win streak ${stats.streak}` : runsLine(stats)]
  return [runsLine(stats), `Win streak ${stats.streak} · best ${stats.bestStreak}`]
}

/**
 * The furthest floor of each finished run: one bar per floor for the runs that died there, then one
 * for the wins, each with its count over it; the bars share one scale, the largest filling the height.
 */
export function floorsChart(stats: RogueliteStats): HTMLElement {
  const chart = el('div', 'floors-chart')
  chart.setAttribute('role', 'img')
  const columns = chartColumns(stats)
  const most = Math.max(1, ...columns.map((c) => c.count))
  chart.setAttribute('aria-label', `Furthest floor reached: ${columns.map((c) => `${c.label}, ${c.count}`).join('; ')}`)
  for (const c of columns) {
    const column = el('div', 'floors-column')
    column.title = c.title
    const bar = el('div', 'floors-bar')
    bar.style.height = `${Math.round((c.count / most) * BAR_MAX_PX)}px`
    column.append(el('span', 'floors-count', String(c.count)), bar, el('span', 'floors-label', c.label))
    chart.append(column)
  }
  return chart
}

/** The totals over the floors chart. */
export function statsPanel(stats: RogueliteStats): HTMLElement {
  const root = el('div', 'roguelite-stats')
  root.append(el('p', 'hint', statsLines(stats).join(' · ')))
  if (stats.runs > 0) root.append(el('span', 'hint', 'Furthest floor reached'), floorsChart(stats))
  return root
}
