import { describe, expect, it } from 'vitest'
import {
  darkness,
  dayOf,
  daylightHours,
  daylightLeft,
  hourOf,
  isAttackHour,
  isDaylight,
  nightAttackers,
  nightKind,
  nightOf,
  PREP_DAYS,
} from '../src/sim/time'

const at = (day: number, hour: number): number => (day - 1) * 1440 + hour * 60

describe('clock', () => {
  it('daylight shrinks from 8 h to 1 h over the summer and is gone after', () => {
    expect(daylightHours(1)).toBe(8)
    expect(daylightHours(PREP_DAYS)).toBe(1)
    expect(daylightHours(PREP_DAYS + 1)).toBe(0)
    expect(daylightHours(7)).toBeLessThan(daylightHours(6))
  })

  it('the daylight window is centred on noon', () => {
    expect(isDaylight(at(1, 8))).toBe(true)
    expect(isDaylight(at(1, 15.9))).toBe(true)
    expect(isDaylight(at(1, 16))).toBe(false)
    expect(isDaylight(at(1, 7.9))).toBe(false)
    expect(daylightLeft(at(1, 12))).toBe(240)
    expect(daylightLeft(at(20, 12))).toBe(0)
    expect(darkness(at(1, 12))).toBe(0)
    expect(darkness(at(20, 12))).toBe(1)
  })

  it('day and hour math', () => {
    expect(dayOf(at(3, 5))).toBe(3)
    expect(hourOf(at(3, 5.5))).toBe(5.5)
    expect(nightOf(PREP_DAYS)).toBe(0)
    expect(nightOf(PREP_DAYS + 4)).toBe(4)
  })

  it('assault every third night, a probe after it, then quiet', () => {
    expect(nightKind(3)).toBe('assault')
    expect(nightKind(4)).toBe('probe')
    expect(nightKind(5)).toBe('quiet')
    expect(nightAttackers(3)).toBe(3)
    expect(nightAttackers(30)).toBe(12)
    expect(nightAttackers(4)).toBe(1)
    expect(nightAttackers(5)).toBe(0)
    expect(nightAttackers(0)).toBe(0)
  })

  it('attack hours exist only during the siege', () => {
    expect(isAttackHour(at(PREP_DAYS + 1, 1))).toBe(true)
    expect(isAttackHour(at(PREP_DAYS + 1, 5))).toBe(false)
    expect(isAttackHour(at(3, 1))).toBe(false)
  })
})
