// The roguelite floor pick (docs/plans/2026-10-25-roguelite-mode-design.md, Floor end): one panel
// where the player picks the next floor's biome and a reward. Every card shows what it holds: the
// biome's name and a row of its enemies, the spell's scroll and writing, the heal, the exact potions. The cards take
// no pick for PICK_LOCK_MS after the panel opens (dimmed until then). Arrows or WASD (up and down
// between the rows) or Tab and Enter, the number keys, a tap or a click pick; play goes on as soon as both picks are made.
import { PICK_LOCK_MS, pickUnlocked } from '../run/pick'
import { potionTotal, RESERVED_WEAPONS, scrollPotions, type RewardOption } from '../run/rewards'
import type { PotionCount } from '../mr-open/mr-pickup'
import { el, panel } from './dom'
import { focusInRows } from './grid-nav'
import type { MenuPanel } from './overlay'

/** A sprite frame as a canvas (the scrolls' and potions' 'stand' and 'writing'); null when it is missing. */
export type SpriteArt = (sprite: string, anim: 'stand' | 'writing') => HTMLCanvasElement | null
/** A unit's icon (its standing frame) by its actor key; null when it has no sprite. */
export type UnitArt = (key: string) => HTMLCanvasElement | null

export interface PickArt {
  sprite: SpriteArt
  unit: UnitArt
}

/** A biome and the actor keys of the enemies its card shows (FloorTheme.showcase). */
export interface BiomeCard { name: string; showcase: readonly string[] }

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
  open(offer: PickOffer, art: PickArt, onPicked: OnPicked): void
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
export const wordsOf = (key: string): string => {
  const words = key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}
const potionName = (character: string): string => POTION_NAMES[character] ?? wordsOf(character)

/** Units whose keys do not read as their names, for the biome cards' labels. */
const UNIT_NAMES: Record<string, string> = {
  scWarrior: 'Scarlet warrior',
  scArcher: 'Scarlet archer',
  scMonk: 'Scarlet monk',
  scarletInGame: 'Scarlet',
  ochreInGame: 'Ochre',
  swordOrc: 'Orc warrior',
  bowOrc: 'Orc archer',
  mageOrc: 'Orc mage',
  kongFuChicken: 'Kung fu chicken',
  hydra1: 'Hydra',
  hydra3: 'Three-headed hydra',
}
const unitName = (key: string): string => UNIT_NAMES[key] ?? wordsOf(key)

/** A biome card's row of enemy icons, each named on hover; a name stands in for a missing sprite. */
function showcaseRow(keys: readonly string[], art: UnitArt): HTMLElement {
  const row = el('span', 'pick-units')
  for (const key of keys) {
    const icon = art(key) ?? el('span', 'pick-detail', unitName(key))
    icon.title = unitName(key)
    row.append(icon)
  }
  return row
}

/** A scroll reward's heading: a reserved melee weapon is a new weapon, the rest new spells. */
const scrollHeading = (scroll: string): string => (RESERVED_WEAPONS.includes(scroll) ? 'New weapon' : 'New spell')

const potionsLabel = (potions: readonly PotionCount[]): string => potions.map((p) => `${p.count} ${potionName(p.character)}`).join(', ')

/** What a reward card says, for its label and screen readers. */
function rewardLabel(r: RewardOption): string {
  switch (r.kind) {
    case 'spell': {
      const potions = scrollPotions(r.scroll)
      return `${scrollHeading(r.scroll)}: ${wordsOf(r.scroll)}${potions.length > 0 ? ` and ${potionsLabel(potions)}` : ''}`
    }
    case 'heal': return HEAL_LABEL
    case 'potions': return `${potionTotal(r.potions)} potions: ${potionsLabel(r.potions)}`
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
  let cards: HTMLButtonElement[] = []
  let rows: HTMLButtonElement[][] = []

  const setLocked = (locked: boolean) => {
    root.classList.toggle('locked', locked)
    for (const c of cards) c.setAttribute('aria-disabled', String(locked))
  }

  const open = (offer: PickOffer, art: PickArt, onPicked: OnPicked) => {
    window.clearTimeout(unlockTimer)
    heading.textContent = `On to floor ${offer.floorNumber}`
    const choosesBiome = offer.biomes.length > 1
    hint.textContent = choosesBiome ? 'Pick the next floor and a reward.' : 'Pick a reward.'
    let picked: { biome: number | null; reward: number | null } = { biome: choosesBiome ? null : 0, reward: null }
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
      const card = pickCard(choosesBiome ? ++numberKey : null, [el('span', 'pick-title', b.name), showcaseRow(b.showcase, art.unit)])
      card.setAttribute('aria-label', `${b.name}: ${b.showcase.map(unitName).join(', ')}`)
      if (choosesBiome) card.addEventListener('click', () => pick('biome', i, card))
      else markChosen(card)
      return card
    })
    const rewardCards = offer.rewards.map((r, i) => {
      const card = pickCard(++numberKey, rewardContent(r, art.sprite))
      card.setAttribute('aria-label', rewardLabel(r))
      card.addEventListener('click', () => pick('reward', i, card))
      return card
    })
    biomeGroup.list.replaceChildren(...biomeCards)
    rewardGroup.list.replaceChildren(...rewardCards)
    rows = [choosesBiome ? biomeCards : [], rewardCards]
    cards = rows.flat()
    openedAt = now()
    setLocked(true)
    unlockTimer = window.setTimeout(() => setLocked(false), PICK_LOCK_MS)
  }

  // the number keys pick the numbered cards; the arrows or WASD move up and down between the rows,
  // left and right within one (capture phase: ahead of the overlay's own arrow keys)
  document.addEventListener('keydown', (e) => {
    if (root.hidden) return
    const n = Number(e.key)
    if (!e.repeat && Number.isInteger(n) && n >= 1 && n <= cards.length) {
      e.preventDefault()
      cards[n - 1]!.click()
      return
    }
    focusInRows(rows, e)
  }, true)

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

/** What a reward card shows: the scroll and its writing (and its potions), the medikit, or each potion type with its count. */
function rewardContent(r: RewardOption, art: SpriteArt): HTMLElement[] {
  switch (r.kind) {
    case 'spell':
      return [el('span', 'pick-detail', scrollHeading(r.scroll)), scrollArt(r.scroll, art), ...scrollPotions(r.scroll).map((p) => potionRow(p, art))]
    case 'heal':
      return [el('span', 'pick-detail', 'Heal'), artRow(art(MEDIKIT_SPRITE, 'stand'), el('span', 'pick-title', HEAL_LABEL))]
    case 'potions':
      return [el('span', 'pick-detail', `${potionTotal(r.potions)} potions`), ...r.potions.map((p) => potionRow(p, art))]
  }
}

/** A potion type with its count and writing (its name when the writing art is missing). */
const potionRow = (p: PotionCount, art: SpriteArt): HTMLElement =>
  artRow(art(p.character, 'stand'), el('span', 'pick-count', `${p.count}×`), art(p.character, 'writing') ?? el('span', 'pick-title', potionName(p.character)))

/** A scroll and its writing (its name when the writing art is missing), as a spell card shows it. */
export const scrollArt = (scroll: string, art: SpriteArt): HTMLElement =>
  artRow(art(scroll, 'stand'), art(scroll, 'writing') ?? el('span', 'pick-title', wordsOf(scroll)))

function artRow(...items: (HTMLElement | null)[]): HTMLElement {
  const row = el('span', 'pick-art')
  for (const item of items) if (item) row.append(item)
  return row
}
