import { describe, expect, it } from 'vitest'
import { buildBase, MAP_H, MAP_W } from '../src/sim/base'
import { carryFrom, estimateExpedition, sendExpedition, tripMinutes } from '../src/sim/expedition'
import { GameState } from '../src/sim/state'
import { simStep } from '../src/sim/tick'
import { isLooted } from '../src/sim/village'
import village from '../src/data/village.json'

function fresh(): GameState {
  const state = new GameState(3, MAP_W, MAP_H)
  buildBase(state)
  state.totalMinutes = 9 * 60 // day 1, light 08:00-16:00
  state.lastMorningDay = state.day
  return state
}

describe('expeditions', () => {
  it('the village has its houses and three homes hide a survivor', () => {
    const state = fresh()
    expect(state.houses).toHaveLength(village.houses.length)
    expect(state.houses.filter((h) => h.type === 'house' && h.survivor)).toHaveLength(village.survivorHouses)
    expect(state.houses.find((h) => h.type === 'clinic')!.survivor).toBe(true)
  })

  it('the trip is there, an hour of search and back, at the pace of the runner', () => {
    const state = fresh()
    const [ivan, marta] = state.people
    const near = state.houses.find((h) => h.id === 'r1')!
    expect(tripMinutes(ivan!, near)).toBe(2 * 30 + 60)
    expect(tripMinutes(marta!, near)).toBe(Math.round(120 / 1.3))
    const est = estimateExpedition(state, ivan!, near)
    expect(est.result).toBe('ok')
    expect(est.returnAt).toBe(state.totalMinutes + 120)
    expect(est.beforeDusk).toBe(true)
    // The clinic is three hours away: Ivan would be back at 16:00 + - after the light.
    const clinic = state.houses.find((h) => h.id === 'clinic')!
    expect(estimateExpedition(state, ivan!, clinic).beforeDusk).toBe(false)
    state.totalMinutes = 20 * 60
    expect(estimateExpedition(state, ivan!, near).result).toBe('dark')
  })

  it('carries food first, then boards, and medicine for free', () => {
    const house = { loot: { food: 6, boards: 4, meds: 2 } } as Parameters<typeof carryFrom>[0]
    expect(carryFrom(house, 7)).toEqual({ food: 6, boards: 0, meds: 2 })
    expect(carryFrom(house, 10)).toEqual({ food: 6, boards: 2, meds: 2 })
    expect(carryFrom(house, 30)).toEqual({ food: 6, boards: 4, meds: 2 })
  })

  it('a runner is away for the trip, then home with the loot; the house empties', () => {
    const state = fresh()
    const ivan = state.people[0]!
    const near = state.houses.find((h) => h.id === 'r1')!
    near.danger = 0
    const budget = ivan.budgetMin
    const food = state.res.food
    expect(sendExpedition(state, ivan, near.id)).toBe('ok')
    expect(ivan.away?.houseId).toBe(near.id)
    expect(ivan.budgetMin).toBe(budget - 120)
    for (let i = 0; i < 11; i++) simStep(state)
    expect(ivan.away).not.toBeNull()
    simStep(state) // 120 minutes: back
    expect(ivan.away).toBeNull()
    expect(state.res.food).toBe(food + 6)
    expect(state.res.boards).toBeGreaterThan(12)
    expect(near.visited).toBe(true)
    expect(ivan.wounded).toBe(false)
    expect(state.events.some((e) => e.type === 'expeditionReturn' && e.personId === 'ivan' && !e.hurt)).toBe(true)
    // A second trip takes what is left, and the house is done.
    expect(sendExpedition(state, ivan, near.id)).toBe('ok')
    for (let i = 0; i < 12; i++) simStep(state)
    expect(isLooted(near)).toBe(true)
    expect(estimateExpedition(state, ivan, near).result).toBe('nothingToDo')
  })

  it('coming back after dark means a wound', () => {
    const state = fresh()
    const ivan = state.people[0]!
    const far = state.houses.find((h) => h.id === 'clinic')!
    far.danger = 0
    state.totalMinutes = 13 * 60 // back at 20:00, four hours after the light went
    expect(estimateExpedition(state, ivan, far).beforeDusk).toBe(false)
    expect(sendExpedition(state, ivan, far.id)).toBe('ok')
    for (let i = 0; i < 43; i++) simStep(state)
    expect(ivan.away).toBeNull()
    expect(ivan.wounded).toBe(true)
    expect(state.res.meds).toBe(2 + 6)
  })
})
