import { describe, expect, it } from 'vitest'
import { buildBase, MAP_H, MAP_W } from '../src/sim/base'
import { assignChop, assignSection } from '../src/sim/jobs'
import { fromJson, toJson } from '../src/sim/save'
import { GameState } from '../src/sim/state'
import { simStep } from '../src/sim/tick'

function fresh(): GameState {
  const state = new GameState(7, MAP_W, MAP_H)
  buildBase(state)
  state.totalMinutes = 11 * 60
  state.lastMorningDay = state.day
  return state
}

describe('save and load', () => {
  it('round-trips through JSON and the copy simulates identically', () => {
    const a = fresh()
    const hole = a.sections.find((s) => s.kind === 'fence' && s.state === 'hole')!
    expect(assignChop(a, a.people[0]!)).toBe('ok')
    expect(assignSection(a, a.people[1]!, hole.id, 'repair')).toBe('ok')
    for (let i = 0; i < 12; i++) simStep(a)
    a.people[0]!.woundDays = 2
    a.night.yardVictims.add('ivan')

    const b = fromJson(toJson(a))
    expect(b.totalMinutes).toBe(a.totalMinutes)
    expect(b.res).toEqual(a.res)
    expect(b.people.map((p) => [p.id, p.health, p.woundDays, p.budgetMin, p.job?.kind])).toEqual(a.people.map((p) => [p.id, p.health, p.woundDays, p.budgetMin, p.job?.kind]))
    expect(b.sections.find((s) => s.id === hole.id)!.progress).toBe(hole.progress)
    expect(b.night.yardVictims.has('ivan')).toBe(true)
    expect(b.rooms().rooms.length).toBe(a.rooms().rooms.length)
    expect(b.yardRoomId).toBe(a.yardRoomId)

    // Same future: both copies step in lockstep.
    for (let i = 0; i < 30; i++) {
      simStep(a)
      simStep(b)
    }
    expect(b.res).toEqual(a.res)
    expect(b.people.map((p) => [p.pos.c, p.pos.r, p.budgetMin])).toEqual(a.people.map((p) => [p.pos.c, p.pos.r, p.budgetMin]))
    expect(b.rng.getState()).toBe(a.rng.getState())
  })
})
