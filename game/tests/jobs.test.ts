import { describe, expect, it } from 'vitest'
import { buildBase, MAP_H, MAP_W } from '../src/sim/base'
import { assignChop, assignSaw, assignSection, assignSplit, cancelJob } from '../src/sim/jobs'
import { applyToGrid, completeOp, isOpen } from '../src/sim/sections'
import { GameState } from '../src/sim/state'
import { simStep } from '../src/sim/tick'
import balance from '../src/data/balance.json'
import { PREP_DAYS } from '../src/sim/time'

function fresh(): GameState {
  const state = new GameState(1, MAP_W, MAP_H)
  buildBase(state)
  state.totalMinutes = 11 * 60 // day 1, late morning, full daylight
  return state
}

function run(state: GameState, steps: number): void {
  for (let i = 0; i < steps; i++) simStep(state)
}

describe('jobs', () => {
  it('chopping brings logs and fells trees, only by daylight', () => {
    const state = fresh()
    const ivan = state.people[0]!
    expect(assignChop(state, ivan)).toBe('ok')
    run(state, 24) // 4 hours
    expect(state.res.logs).toBeGreaterThan(3)
    const dark = fresh()
    dark.totalMinutes = 20 * 60
    expect(assignChop(dark, dark.people[0]!)).toBe('dark')
  })

  it('sawing turns logs into boards, splitting into fuel; no logs, no job', () => {
    const state = fresh()
    const ivan = state.people[0]!
    expect(assignSaw(state, ivan)).toBe('noLogs')
    state.res.logs = 4
    expect(assignSaw(state, ivan)).toBe('ok')
    run(state, 30)
    expect(state.res.boards).toBeGreaterThan(balance.start.boards)
    expect(state.res.logs).toBeLessThan(4)
    const marta = state.people[1]!
    state.res.logs = 3
    const fuel = state.res.fuel
    expect(assignSplit(state, marta)).toBe('ok')
    run(state, 12)
    expect(state.res.fuel).toBeGreaterThan(fuel - 2) // burning one stove meanwhile
  })

  it('repairing a hole costs boards once and finishes even if interrupted', () => {
    const state = fresh()
    const ivan = state.people[0]!
    const hole = state.sections.find((s) => s.kind === 'fence' && s.state === 'hole')!
    const boards = state.res.boards
    expect(assignSection(state, ivan, hole.id, 'repair')).toBe('ok')
    expect(state.res.boards).toBe(boards - balance.sections.repair.boards)
    // The walk across the yard takes a while at 5 tiles a step: wait for the first swing.
    for (let i = 0; i < 40 && hole.progress <= 0; i++) simStep(state)
    cancelJob(ivan)
    const progress = hole.progress
    expect(progress).toBeGreaterThan(0)
    // Resuming does not charge again.
    expect(assignSection(state, ivan, hole.id, 'repair')).toBe('ok')
    expect(state.res.boards).toBe(boards - balance.sections.repair.boards)
    run(state, 40)
    expect(hole.state).toBe('intact')
    expect(state.grid.isWalkable(hole.tiles[0]!.c, hole.tiles[0]!.r)).toBe(false)
  })

  it('work goes on through the attack hours: night is not bedtime inside the fence', () => {
    const state = fresh()
    // A sealed perimeter, so the enemies stay at the fence and the yard is safe for now.
    for (const s of state.sections) {
      if (s.kind === 'fence' && isOpen(s)) {
        s.op = s.state === 'missing' ? 'build' : 'repair'
        completeOp(s)
        applyToGrid(state.grid, s)
      }
    }
    // 00:30 of night 3, an assault night; the worker still has the whole budget.
    state.totalMinutes = (PREP_DAYS + 3 - 1) * 1440 + 30
    state.lastMorningDay = state.day
    const ivan = state.people[0]!
    const target = state.sections.find((s) => s.kind === 'fence' && s.state === 'intact')!
    expect(assignSection(state, ivan, target.id, 'reinforce')).toBe('ok')
    for (let i = 0; i < 40 && target.progress <= 0; i++) simStep(state)
    expect(target.progress).toBeGreaterThan(0)
    expect(ivan.job?.kind).toBe('section')
    expect(ivan.sleeping).toBe(false)
    expect(ivan.wounded).toBe(false)
    // Idle people, on the other hand, sleep at night.
    expect(state.people[1]!.sleeping).toBe(true)
  })

  it('the daily budget runs out and the worker goes home', () => {
    const state = fresh()
    state.totalMinutes = 8 * 60
    const ivan = state.people[0]!
    state.res.logs = 999
    expect(assignSaw(state, ivan)).toBe('ok')
    run(state, 6 * 13) // 13 hours
    expect(ivan.budgetMin).toBeLessThanOrEqual(0)
    expect(ivan.job === null || ivan.job.kind === 'home').toBe(true)
    expect(assignSaw(state, ivan)).toBe('tired')
  })
})
