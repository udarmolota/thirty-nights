import { describe, expect, it } from 'vitest'
import { buildBase, MAP_H, MAP_W } from '../src/sim/base'
import { completeOp, isOpen } from '../src/sim/sections'
import { GameState } from '../src/sim/state'
import { simStep } from '../src/sim/tick'
import { PREP_DAYS } from '../src/sim/time'

function siegeState(night: number): GameState {
  const state = new GameState(1, MAP_W, MAP_H)
  buildBase(state)
  // Seal the perimeter first: every fence section intact.
  for (const s of state.sections) {
    if (s.kind === 'fence' && isOpen(s)) {
      s.op = s.state === 'missing' ? 'build' : 'repair'
      completeOp(s)
    }
  }
  state.res.food = 200
  state.res.wood = 500
  // 23:50 of the evening before the attack window of the given night.
  state.totalMinutes = (PREP_DAYS + night - 1) * 1440 - 10
  state.lastMorningDay = state.day
  return state
}

function attackHours(state: GameState): void {
  for (let i = 0; i < 6 * 4 + 1; i++) simStep(state)
}

describe('the siege', () => {
  it('a quiet night leaves the fence alone', () => {
    const state = siegeState(5)
    attackHours(state)
    expect(state.night.log.fenceHoles).toBe(0)
    expect(state.events.some((e) => e.type === 'nightFalls' && e.kind === 'quiet')).toBe(true)
  })

  it('an assault breaks the weakest fence section and moves into the yard', () => {
    const state = siegeState(3)
    attackHours(state)
    expect(state.night.log.fenceHoles).toBeGreaterThanOrEqual(1)
    expect(state.events.some((e) => e.type === 'fenceHole')).toBe(true)
    expect(state.events.some((e) => e.type === 'yardBreach')).toBe(true)
    expect(state.sections.some((s) => s.kind === 'fence' && s.state === 'hole')).toBe(true)
  })

  it('a late assault reaches the building through a window; sleepers elsewhere are safe', () => {
    const state = siegeState(30)
    attackHours(state)
    expect(state.night.log.wallHoles).toBeGreaterThanOrEqual(1)
    const broken = state.sections.find((s) => s.kind !== 'fence' && isOpen(s))!
    expect(broken.kind).toBe('window')
    expect(state.events.some((e) => e.type === 'peopleAttacked')).toBe(true)
    // The people sleep in the office; the first window to go is in the hall.
    expect(state.people.every((p) => p.health > 50)).toBe(true)
  })

  it('a hole punched on the last step of the night still lets them in that night', () => {
    const state = siegeState(3)
    // 03:40 of the assault night: one more step of attack, then the window closes.
    state.totalMinutes += 3 * 60 + 50
    state.lastMorningDay = state.day
    simStep(state) // 03:50 - announces the night, first hit
    expect(state.night.phase).toBe('fence')
    // Make the target a hair from breaking, then the last step lands.
    const target = state.sections.find((s) => s.id === state.night.targetId)!
    target.hp = 0.1
    target.buffer = 0
    state.totalMinutes -= 10 // replay the last step at 03:50 with the weakened target
    simStep(state)
    expect(state.night.phase).toBe('yard')
    expect(state.night.log.breached).toBe(true)
    expect(state.events.some((e) => e.type === 'fenceHole')).toBe(true)
    expect(state.events.some((e) => e.type === 'yardBreach')).toBe(true)
    // The window closed: no further harm, and the log stays for the morning report.
    simStep(state)
    expect(state.night.phase).toBe('none')
    expect(state.night.log.breached).toBe(true)
  })

  it('the shout comes first: the yard hurts only from the step after the breach', () => {
    const state = siegeState(3)
    // Open one fence section and put Ivan in the yard, awake.
    const fence = state.sections.find((s) => s.kind === 'fence')!
    fence.hp = 0
    fence.state = 'hole'
    const ivan = state.people[0]!
    ivan.pos = { c: state.yardAnchor.c, r: state.yardAnchor.r }
    ivan.job = { kind: 'saw', spot: state.sawhorse }
    state.totalMinutes += 10 // 00:00
    simStep(state)
    expect(state.night.phase).toBe('yard')
    expect(ivan.wounded).toBe(false)
    simStep(state)
    expect(ivan.wounded).toBe(true)
  })

  it('reinforcement buys a night', () => {
    const state = siegeState(3)
    for (const s of state.sections) {
      if (s.kind === 'fence') {
        s.op = 'reinforce'
        completeOp(s)
      }
    }
    attackHours(state)
    expect(state.night.log.fenceHoles).toBe(0)
  })
})
