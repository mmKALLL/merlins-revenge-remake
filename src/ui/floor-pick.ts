// The roguelite floor pick (docs/plans/2026-10-25-roguelite-mode-design.md, Floor end): one panel
// where the player picks the next floor's biome and a reward. Every card shows what it holds: the
// biome's name and foes, the spell's scroll and writing, the heal, the exact potions. The cards take
// no pick for PICK_LOCK_MS after the panel opens (dimmed until then). Arrows or Tab and Enter, the
// number keys, a tap or a click pick; play goes on as soon as both picks are made.
import { PICK_LOCK_MS, pickUnlocked } from '../run/pick'
import { potionTotal, type RewardOption } from '../run/rewards'
import { el, panel } from './dom'
import type { MenuPanel } from './overlay'

/** A sprite frame as a canvas (the scrolls' and potions' 'stand' and 'writing'); null when it is missing. */
export type SpriteArt = (sprite: string, anim: 'stand' | 'writing') => HTMLCanvasElement | null

export interface BiomeCard { name: string; foes: string }

export interface PickOffer {
  /** the floor about to start, 1 = the first */
  floorNumber: number
  biomes: readonly BiomeCard[]
  rewards: readonly RewardOption[]
}

/** Biome and reward, as indices into the offer's lists. */
export type OnPicked = (biome: number, reward: number) => void

export interface FloorPick extends MenuPanel {
  /** Fills the panel with an offer (its art drawn by `art`) and starts its lock; the overlay shows it next. */
  open(offer: PickOffer, art: SpriteArt, onPicked: OnPicked): void
}

/** The potions' in-game names (their writing art), for the cards' labels. */
const POTION_NAMES: Record<string, string> = {
  manaCapacity: 'Max Blast',
  manaBurst: 'Quick Blast',
  manaFlow: 'Faster Charge',
  walkSpeed: 'Speed Up',
}
const MEDIKIT_SPRITE = 'medikit'
const HEAL_LABEL = 'Full heal + medikit'

/** A camelCase key as words: energyPulseSpell -> Energy pulse spell. */
const wordsOf = (key: string): string => {
  const words = key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}
const potionName = (character: string): string => POTION_NAMES[character] ?? wordsOf(character)

/** What a reward card says, for its label and screen readers. */
function rewardLabel(r: RewardOption): string {
  switch (r.kind) {
    case 'spell': return `New spell: ${wordsOf(r.scroll)}`
    case 'heal': return HEAL_LABEL
    case 'potions': return `${potionTotal(r.potions)} potions: ${r.potions.map((p) => `${p.count} ${potionName(p.character)}`).join(', ')}`
  }
}

export function floorPick(now: () => number = () => performance.now()): FloorPick {
  const { root, body } = panel('Floor cleared')
  root.classList.add('floor-pick')
  const heading = root.querySelector('h2')!
  const hint = el('p', 'hint')
  const biomeGroup = group('Next floor')
  const rewardGroup = group('Reward')
  body.append(hint, biomeGroup.root, rewardGroup.root)

  let openedAt = 0
  let unlockTimer: number | undefined
  let picked: { biome: number | null; reward: number | null } = { biome: null, reward: null }
  let cards: HTMLButtonElement[] = []

  const setLocked = (locked: boolean) => {
    root.classList.toggle('locked', locked)
    for (const c of cards) c.setAttribute('aria-disabled', String(locked))
  }

  const open = (offer: PickOffer, art: SpriteArt, onPicked: OnPicked) => {
    window.clearTimeout(unlockTimer)
    heading.textContent = `On to floor ${offer.floorNumber}`
    const choosesBiome = offer.biomes.length > 1
    hint.textContent = choosesBiome ? 'Pick the next floor and a reward.' : 'Pick a reward.'
    picked = { biome: choosesBiome ? null : 0, reward: null }
    let done = false
    let numberKey = 0
    const pick = (kind: 'biome' | 'reward', index: number, card: HTMLButtonElement) => {
      if (done || !pickUnlocked(openedAt, now())) return
      picked = { ...picked, [kind]: index }
      for (const c of (kind === 'biome' ? biomeGroup : rewardGroup).list.children) c.setAttribute('aria-pressed', String(c === card))
      if (picked.biome === null || picked.reward === null) return
      done = true
      onPicked(picked.biome, picked.reward)
    }
    const biomeCards = offer.biomes.map((b, i) => {
      const card = pickCard(choosesBiome ? ++numberKey : null, [el('span', 'pick-title', b.name), el('span', 'pick-detail', b.foes)])
      card.setAttribute('aria-label', `${b.name}: ${b.foes}`)
      if (choosesBiome) card.addEventListener('click', () => pick('biome', i, card))
      else markChosen(card)
      return card
    })
    const rewardCards = offer.rewards.map((r, i) => {
      const card = pickCard(++numberKey, rewardContent(r, art))
      card.setAttribute('aria-label', rewardLabel(r))
      card.addEventListener('click', () => pick('reward', i, card))
      return card
    })
    biomeGroup.list.replaceChildren(...biomeCards)
    rewardGroup.list.replaceChildren(...rewardCards)
    cards = [...(choosesBiome ? biomeCards : []), ...rewardCards]
    openedAt = now()
    setLocked(true)
    unlockTimer = window.setTimeout(() => setLocked(false), PICK_LOCK_MS)
  }

  // the number keys pick the numbered cards; left and right step between the cards
  document.addEventListener('keydown', (e) => {
    if (root.hidden || e.repeat) return
    const n = Number(e.key)
    if (Number.isInteger(n) && n >= 1 && n <= cards.length) {
      e.preventDefault()
      cards[n - 1]!.click()
      return
    }
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const at = cards.indexOf(document.activeElement as HTMLButtonElement)
    const step = e.key === 'ArrowRight' ? 1 : -1
    cards[at < 0 ? 0 : (at + step + cards.length) % cards.length]?.focus()
  })

  return { root, open }
}

/** A titled row of cards. */
function group(title: string): { root: HTMLElement; list: HTMLElement } {
  const root = el('div', 'pick-group')
  const list = el('div', 'pick-cards')
  list.setAttribute('role', 'group')
  list.setAttribute('aria-label', title)
  root.append(el('h3', '', title), list)
  return { root, list }
}

/** A card button; `numberKey` is the number key that picks it (none for the only choice). */
function pickCard(numberKey: number | null, content: HTMLElement[]): HTMLButtonElement {
  const card = el('button', 'pick-card')
  card.type = 'button'
  card.setAttribute('aria-pressed', 'false')
  if (numberKey !== null) card.append(el('span', 'pick-key', String(numberKey)))
  card.append(...content)
  return card
}

/** The only biome: shown as chosen, and no pick to make. */
function markChosen(card: HTMLButtonElement): void {
  card.setAttribute('aria-pressed', 'true')
  card.disabled = true
  card.classList.add('only')
}

/** What a reward card shows: the scroll and its writing, the medikit, or each potion type with its count. */
function rewardContent(r: RewardOption, art: SpriteArt): HTMLElement[] {
  switch (r.kind) {
    case 'spell':
      return [el('span', 'pick-detail', 'New spell'), artRow(art(r.scroll, 'stand'), art(r.scroll, 'writing') ?? el('span', 'pick-title', wordsOf(r.scroll)))]
    case 'heal':
      return [el('span', 'pick-detail', 'Heal'), artRow(art(MEDIKIT_SPRITE, 'stand'), el('span', 'pick-title', HEAL_LABEL))]
    case 'potions':
      return [
        el('span', 'pick-detail', `${potionTotal(r.potions)} potions`),
        ...r.potions.map((p) => artRow(art(p.character, 'stand'), el('span', 'pick-count', `${p.count}×`), art(p.character, 'writing') ?? el('span', 'pick-title', potionName(p.character)))),
      ]
  }
}

function artRow(...items: (HTMLElement | null)[]): HTMLElement {
  const row = el('span', 'pick-art')
  for (const item of items) if (item) row.append(item)
  return row
}
