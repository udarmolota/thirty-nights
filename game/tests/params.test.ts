import { describe, expect, it } from 'vitest'
import { DEFAULT_SEED, parseParams } from '../src/core/params'

describe('start parameters', () => {
  it('defaults: seed, Russian, no clock jump, no stock overrides', () => {
    const p = parseParams('')
    expect(p.seed).toBe(DEFAULT_SEED)
    expect(p.lang).toBe('ru')
    expect(p.startMinutes).toBeNull()
    expect(p.stocks).toEqual({})
  })

  it('day and hour jump the clock; day alone means 08:00', () => {
    expect(parseParams('?day=14').startMinutes).toBe(13 * 1440 + 8 * 60)
    expect(parseParams('?day=16&hour=23').startMinutes).toBe(15 * 1440 + 23 * 60)
    expect(parseParams('?day=0').startMinutes).toBeNull()
  })

  it('stocks: only the keys given, only sane numbers', () => {
    expect(parseParams('?food=100&wood=300').stocks).toEqual({ food: 100, wood: 300 })
    expect(parseParams('?meds=abc&boards=-2&wood=0').stocks).toEqual({ wood: 0 })
  })
})
