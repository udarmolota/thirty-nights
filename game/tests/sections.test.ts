import { describe, expect, it } from 'vitest'
import { availableOps, completeOp, damage, isOpen, makeSection, maxHp, strength } from '../src/sim/sections'
import balance from '../src/data/balance.json'

const tiles = [0, 1, 2, 3, 4].map((c) => ({ c, r: 0 }))

describe('sections', () => {
  it('a fresh section is intact at full strength', () => {
    const s = makeSection(0, 'fence', tiles, 'h')
    expect(s.hp).toBe(balance.sections.hp)
    expect(availableOps(s)).toEqual(['reinforce'])
  })

  it('damage marks it, then breaks it; the buffer soaks first', () => {
    const s = makeSection(0, 'fence', tiles, 'h', 'reinforced')
    expect(strength(s)).toBe(balance.sections.hp + balance.sections.reinforceBuffer)
    expect(damage(s, 4)).toBe(false)
    expect(s.buffer).toBe(1)
    expect(s.hp).toBe(balance.sections.hp)
    expect(damage(s, 5)).toBe(false)
    expect(s.state).toBe('damaged')
    expect(availableOps(s)).toContain('repair')
    expect(damage(s, 100)).toBe(true)
    expect(isOpen(s)).toBe(true)
    expect(availableOps(s)).toEqual(['repair'])
  })

  it('repair restores, reinforcing adds the buffer, boarding hardens a window', () => {
    const s = makeSection(1, 'wall', tiles.slice(0, 4), 'h', 'hole')
    s.op = 'repair'
    completeOp(s)
    expect(s.state).toBe('intact')
    expect(s.hp).toBe(maxHp(s))
    s.op = 'reinforce'
    completeOp(s)
    expect(s.state).toBe('reinforced')
    expect(s.buffer).toBe(balance.sections.reinforceBuffer)

    const w = makeSection(2, 'window', tiles.slice(0, 2), 'h')
    expect(maxHp(w)).toBe(balance.sections.windowHp)
    expect(availableOps(w)).toContain('board')
    w.op = 'board'
    completeOp(w)
    expect(w.boarded).toBe(true)
    expect(maxHp(w)).toBe(balance.sections.hp)
  })
})
