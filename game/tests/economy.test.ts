import { describe, expect, it } from 'vitest'
import { buildBase, MAP_H, MAP_W } from '../src/sim/base'
import { everyoneDone } from '../src/sim/economy'
import { GameState } from '../src/sim/state'
import { simStep } from '../src/sim/tick'

function fresh(): GameState {
  const state = new GameState(1, MAP_W, MAP_H)
  buildBase(state)
  state.totalMinutes = 11 * 60
  state.lastMorningDay = state.day
  return state
}

describe('the end of the working day', () => {
  it('is reached when everyone alive is out of hours and idle', () => {
    const state = fresh()
    expect(everyoneDone(state)).toBe(false)
    for (const p of state.people) p.budgetMin = 0
    expect(everyoneDone(state)).toBe(true)
    state.people[0]!.job = { kind: 'saw', spot: state.sawhorse } // still at work: not done
    expect(everyoneDone(state)).toBe(false)
    state.people[0]!.job = { kind: 'home' }
    expect(everyoneDone(state)).toBe(true)
    state.people[0]!.health = 0 // the dead do not count, the living decide
    expect(everyoneDone(state)).toBe(true)
  })
})

describe('stoves and wood', () => {
  it('burn firewood first, then boards one for one, then go out', () => {
    const state = fresh()
    // One lit stove (the office), a sliver of firewood and two boards.
    state.res.wood = 0.5
    state.res.boards = 2
    simStep(state) // 10 minutes: 1/6 of a piece
    simStep(state)
    simStep(state) // firewood gone at the end of this step
    expect(state.res.wood).toBeCloseTo(0, 5)
    expect(state.res.boards).toBe(2)
    expect(state.burningBoards).toBe(false)
    simStep(state) // now the boards burn
    expect(state.res.boards).toBeLessThan(2)
    expect(state.burningBoards).toBe(true)
    expect(state.events.filter((e) => e.type === 'burningBoards')).toHaveLength(1)
    for (let i = 0; i < 20; i++) simStep(state) // more than two hours: boards gone
    expect(state.res.boards).toBe(0)
    expect(state.stoves.every((s) => !s.lit)).toBe(true)
    expect(state.events.some((e) => e.type === 'stoveOut')).toBe(true)
  })
})
