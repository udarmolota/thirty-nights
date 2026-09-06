import { describe, expect, it } from 'vitest'
import { buildBase, MAP_H, MAP_W } from '../src/sim/base'
import { assignSaw, treat } from '../src/sim/jobs'
import { GameState } from '../src/sim/state'
import { simStep } from '../src/sim/tick'
import balance from '../src/data/balance.json'

function fresh(): GameState {
  const state = new GameState(1, MAP_W, MAP_H)
  buildBase(state)
  state.totalMinutes = 11 * 60
  state.lastMorningDay = state.day
  state.res.wood = 200
  return state
}

function run(state: GameState, steps: number): void {
  for (let i = 0; i < steps; i++) simStep(state)
}

function boardsAfterSawing(wounded: boolean): number {
  const state = fresh()
  const ivan = state.people[0]!
  if (wounded) ivan.woundDays = balance.wounds.days
  expect(assignSaw(state, ivan)).toBe('ok')
  run(state, 18) // three hours, including the walk to the sawhorse
  return state.res.boards
}

describe('wounds', () => {
  it('a wounded worker can still be assigned and works at half pace', () => {
    const healthy = boardsAfterSawing(false) - balance.start.boards
    const wounded = boardsAfterSawing(true) - balance.start.boards
    expect(wounded).toBeGreaterThan(0)
    expect(wounded).toBeCloseTo(healthy * balance.wounds.workFactor, 1)
  })

  it('a wound heals by itself after three mornings', () => {
    const state = fresh()
    const ivan = state.people[0]!
    ivan.woundDays = balance.wounds.days
    const toMorning = (): void => {
      const before = state.lastMorningDay
      while (state.lastMorningDay === before) simStep(state) // until 06:00 of the next day
    }
    toMorning() // day 2
    expect(ivan.wounded).toBe(true)
    toMorning() // day 3
    expect(ivan.woundDays).toBe(1)
    toMorning() // day 4
    expect(ivan.wounded).toBe(false)
    expect(state.events.some((e) => e.type === 'recovered' && e.personId === 'ivan')).toBe(true)
  })

  it('medicine cuts a wound to a day; none wasted, none when the shelf is empty', () => {
    const state = fresh()
    const ivan = state.people[0]!
    const marta = state.people[1]!
    expect(treat(state, ivan)).toBe('nothingToDo') // not wounded
    ivan.woundDays = balance.wounds.days
    marta.woundDays = balance.wounds.days
    state.res.meds = 1
    expect(treat(state, ivan)).toBe('ok')
    expect(ivan.woundDays).toBe(balance.wounds.daysWithMeds)
    expect(state.res.meds).toBe(0)
    expect(treat(state, ivan)).toBe('nothingToDo') // already down to a day
    expect(treat(state, marta)).toBe('noMeds')
  })

  it('the morning report carries a snapshot of the night, then the log resets', () => {
    const state = fresh()
    state.night.log.fenceHoles = 2
    state.night.log.breached = true
    state.night.log.wounded.push('ivan')
    state.totalMinutes = 1440 + 5 * 60 + 50 // 05:50 of day 2
    state.lastMorningDay = 1
    state.events.length = 0
    simStep(state)
    const morning = state.events.find((e) => e.type === 'morning')
    expect(morning && morning.type === 'morning' ? morning.report : null).toEqual({ fenceHoles: 2, wallHoles: 0, breached: true, wounded: ['ivan'] })
    expect(state.night.log).toEqual({ fenceHoles: 0, wallHoles: 0, breached: false, wounded: [] })
  })
})
