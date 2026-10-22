import { describe, expect, it } from 'vitest'
import { InputTracker, nextSpaceMode, SPACE_MODES, type SpaceMode } from './keyboard'

describe('InputTracker', () => {
  it('sums held direction keys into a move vector, opposite keys cancel', () => {
    const t = new InputTracker()
    t.keyDown('KeyW')
    t.keyDown('ArrowRight')
    expect(t.snapshot().move).toEqual({ x: 1, y: -1 })
    t.keyDown('KeyA')
    expect(t.snapshot().move).toEqual({ x: 0, y: -1 })
    t.keyUp('KeyW')
    expect(t.snapshot().move).toEqual({ x: 0, y: 0 })
  })

  it('maps E and left click to mouse aim, and Space by its mode', () => {
    const t = new InputTracker()
    t.setMouseButton(true)
    expect(t.snapshot()).toMatchObject({ chargeHeld: true, shootNearest: false, shootShort: false })
    t.setMouseButton(false)
    t.keyDown('KeyE')
    expect(t.snapshot()).toMatchObject({ chargeHeld: true, shootNearest: false, shootShort: false })
    t.keyUp('KeyE')
    const space = (mode: SpaceMode) => {
      t.setSpaceMode(mode)
      t.keyDown('Space')
      const { chargeHeld, shootNearest, shootShort } = t.snapshot()
      t.keyUp('Space')
      return { chargeHeld, shootNearest, shootShort }
    }
    expect(space('nearest')).toEqual({ chargeHeld: false, shootNearest: true, shootShort: false })
    expect(space('pushBack')).toEqual({ chargeHeld: false, shootNearest: false, shootShort: true })
    expect(space('mouse')).toEqual({ chargeHeld: true, shootNearest: false, shootShort: false })
  })

  it('F toggles the Space mode once per press between nearest and push-back, skipping mouse; and reports each change', () => {
    expect(SPACE_MODES.map(nextSpaceMode)).toEqual(['pushBack', 'nearest', 'nearest'])
    const heard: SpaceMode[] = []
    const t = new InputTracker('nearest', (m) => heard.push(m))
    t.keyDown('KeyF')
    t.keyDown('KeyF') // key repeat does not step again
    expect(t.spaceMode).toBe('pushBack')
    expect(t.snapshot()).toMatchObject({ chargeHeld: false, shootNearest: false, shootShort: false }) // F alone fires nothing
    t.keyUp('KeyF')
    t.keyDown('KeyF')
    expect(t.spaceMode).toBe('nearest')
    expect(heard).toEqual(['pushBack', 'nearest'])
    t.setSpaceMode('nearest') // no change, nothing to report
    expect(heard).toHaveLength(2)
  })

  it('releaseAll drops held keys and the mouse button', () => {
    const t = new InputTracker()
    t.keyDown('KeyW'); t.keyDown('Space'); t.setMouseButton(true)
    t.releaseAll()
    expect(t.snapshot()).toMatchObject({ move: { x: 0, y: 0 }, chargeHeld: false, shootNearest: false })
  })

  it('reports one camera toggle per C press (key repeat does not re-toggle)', () => {
    const t = new InputTracker()
    expect(t.takeCameraToggle()).toBe(false)
    t.keyDown('KeyC')
    t.keyDown('KeyC')
    expect(t.takeCameraToggle()).toBe(true)
    expect(t.takeCameraToggle()).toBe(false)
    t.keyUp('KeyC')
    t.keyDown('KeyC')
    expect(t.takeCameraToggle()).toBe(true)
  })

  it('carries the latest mouse world position', () => {
    const t = new InputTracker()
    expect(t.snapshot().mouseWorld).toBeNull()
    t.setMouseWorld({ x: 12, y: 34 })
    expect(t.snapshot().mouseWorld).toEqual({ x: 12, y: 34 })
  })

  it('reports each K and M press in one snapshot (key repeat does not re-trigger)', () => {
    const t = new InputTracker()
    expect(t.snapshot()).toMatchObject({ cheatKillAll: false, cheatHeal: false })
    t.keyDown('KeyK')
    t.keyDown('KeyK')
    t.keyDown('KeyM')
    expect(t.snapshot()).toMatchObject({ cheatKillAll: true, cheatHeal: true })
    expect(t.snapshot()).toMatchObject({ cheatKillAll: false, cheatHeal: false })
    t.keyUp('KeyK')
    t.keyDown('KeyK')
    expect(t.snapshot()).toMatchObject({ cheatKillAll: true, cheatHeal: false })
  })

  it('reports each spell key 1-9 once per press, and a palette pick without charging on that click', () => {
    const t = new InputTracker()
    t.keyDown('Digit3')
    t.keyDown('Digit3')
    expect(t.snapshot().selectSpell).toBe(3)
    expect(t.snapshot().selectSpell).toBeNull()
    t.pickWeapon('punch')
    t.setMouseButton(true)
    expect(t.snapshot()).toMatchObject({ selectWeapon: 'punch', chargeHeld: false })
    t.setMouseButton(false)
    t.setMouseButton(true)
    expect(t.snapshot()).toMatchObject({ selectWeapon: null, chargeHeld: true })
  })

  it('ignores keys and clicks while disabled (a menu is open) and forgets what was held', () => {
    const t = new InputTracker()
    t.keyDown('KeyD')
    t.keyDown('Space')
    t.setEnabled(false)
    t.keyDown('KeyW')
    t.setMouseButton(true)
    expect(t.snapshot()).toMatchObject({ move: { x: 0, y: 0 }, chargeHeld: false, shootNearest: false })
    t.setEnabled(true)
    t.keyDown('KeyW')
    expect(t.snapshot().move).toEqual({ x: 0, y: -1 })
  })
})
