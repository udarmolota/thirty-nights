import { describe, expect, it } from 'vitest'
import { buildBase, MAP_H, MAP_W } from '../src/sim/base'
import { assignSection, estimateJob } from '../src/sim/jobs'
import { GameState } from '../src/sim/state'
import { daylightLeft } from '../src/sim/time'
import balance from '../src/data/balance.json'

function fresh(): GameState {
  const state = new GameState(1, MAP_W, MAP_H)
  buildBase(state)
  state.totalMinutes = 11 * 60
  state.lastMorningDay = state.day
  return state
}

describe('job estimates', () => {
  it('chopping: a walk, then work until the light goes; the dark says so', () => {
    const state = fresh()
    const ivan = state.people[0]!
    const est = estimateJob(state, ivan, { kind: 'chop' })
    expect(est.result).toBe('ok')
    expect(est.walkMin).toBeGreaterThan(0)
    expect(est.walkMin + est.workMin).toBeLessThanOrEqual(daylightLeft(state.totalMinutes))
    expect(est.wood).toBeGreaterThan(50)
    state.totalMinutes = 20 * 60
    expect(estimateJob(state, ivan, { kind: 'chop' }).result).toBe('dark')
  })

  it('sawing: bounded by the firewood on hand; the wounded work at half pace', () => {
    const state = fresh()
    const ivan = state.people[0]!
    state.res.wood = 12 // exactly two boards' worth
    const est = estimateJob(state, ivan, { kind: 'saw' })
    expect(est.result).toBe('ok')
    expect(est.boards).toBeCloseTo(2, 5)
    state.res.wood = 999
    const fit = estimateJob(state, ivan, { kind: 'saw' }).boards
    ivan.woundDays = 3
    expect(estimateJob(state, ivan, { kind: 'saw' }).boards).toBeCloseTo(fit * balance.wounds.workFactor, 5)
    state.res.wood = 0
    expect(estimateJob(state, ivan, { kind: 'saw' }).result).toBe('noWood')
  })

  it('sections: boards are quoted once and the time shrinks with progress', () => {
    const state = fresh()
    const ivan = state.people[0]!
    const hole = state.sections.find((s) => s.kind === 'fence' && s.state === 'hole')!
    const before = estimateJob(state, ivan, { kind: 'section', sectionId: hole.id, op: 'repair' })
    expect(before.result).toBe('ok')
    expect(before.boardsCost).toBe(balance.sections.repair.boards)
    expect(before.workMin).toBeCloseTo((balance.sections.repair.hours * 60) / ivan.work, 5)
    expect(before.enoughToday).toBe(true)
    expect(assignSection(state, ivan, hole.id, 'repair')).toBe('ok')
    hole.progress = 60
    const after = estimateJob(state, ivan, { kind: 'section', sectionId: hole.id, op: 'repair' })
    expect(after.boardsCost).toBe(0)
    expect(after.workMin).toBeLessThan(before.workMin)
    // A different operation on a started section is refused, as assigning would be.
    expect(estimateJob(state, ivan, { kind: 'section', sectionId: hole.id, op: 'reinforce' }).result).toBe('nothingToDo')
    state.res.boards = 0
    const other = state.sections.find((s) => s.kind === 'fence' && s.state === 'missing')!
    expect(estimateJob(state, ivan, { kind: 'section', sectionId: other.id, op: 'build' }).result).toBe('noBoards')
    ivan.budgetMin = 30
    expect(estimateJob(state, ivan, { kind: 'section', sectionId: hole.id, op: 'repair' }).enoughToday).toBe(false)
  })
})
