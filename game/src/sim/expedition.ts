/**
 * Expeditions to the village. A runner leaves by daylight, walks there by the
 * road, searches for an hour, walks back, and is simply absent meanwhile:
 * not on the map, not in the cold, not in the yard. The trip costs work hours
 * like any job. Coming back after dusk, or a bad roll on a dangerous house,
 * means a wound. Loot is limited by what the runner can carry: food first.
 */
import { emit } from './events'
import { wound } from './night'
import type { AssignResult } from './jobs'
import { cancelJob } from './jobs'
import type { Person } from './person'
import type { GameState } from './state'
import { daylightLeft, dayOf, daylightHours, isDaylight, MIN_PER_DAY } from './time'
import { isLooted, VILLAGE, type House, type Loot } from './village'

export interface ExpeditionEstimate {
  result: AssignResult
  /** Whole trip, minutes: there, an hour of search, back - at this runner's pace. */
  minutes: number
  returnAt: number
  /** Back before the light goes (the safe way home). */
  beforeDusk: boolean
  /** Minutes of light left at the moment of return (negative = after dark). */
  duskMargin: number
  /** What this runner would bring back, by the carry weight. */
  loot: Loot
}

export function tripMinutes(person: Person, house: House): number {
  return Math.round((2 * house.travelMin + VILLAGE.searchMinutes) / person.speed)
}

/** Food first, then boards; medicine weighs nothing. */
export function carryFrom(house: House, carry: number): Loot {
  const w = VILLAGE.weights
  const food = Math.min(house.loot.food, Math.floor(carry / w.food))
  let left = carry - food * w.food
  const boards = w.boards > 0 ? Math.min(house.loot.boards, Math.floor(left / w.boards)) : house.loot.boards
  left -= boards * w.boards
  return { food, boards, meds: house.loot.meds }
}

/** Minutes until the light goes on the day that `totalMinutes` falls in (negative after dusk). */
function lightLeftAt(totalMinutes: number): number {
  const d = daylightHours(dayOf(totalMinutes))
  if (d <= 0) return -1
  const end = (12 + d / 2) * 60
  return end - (totalMinutes % MIN_PER_DAY)
}

export function estimateExpedition(state: GameState, person: Person, house: House): ExpeditionEstimate {
  const minutes = tripMinutes(person, house)
  const returnAt = state.totalMinutes + minutes
  const duskMargin = lightLeftAt(returnAt)
  const none: ExpeditionEstimate = { result: 'ok', minutes, returnAt, beforeDusk: duskMargin > 0, duskMargin, loot: carryFrom(house, person.carry) }
  if (person.health <= 0 || person.away) return { ...none, result: 'tired' }
  if (isLooted(house)) return { ...none, result: 'nothingToDo' }
  if (!isDaylight(state.totalMinutes)) return { ...none, result: 'dark' }
  if (person.budgetMin < minutes) return { ...none, result: 'tired' }
  return none
}

export function sendExpedition(state: GameState, person: Person, houseId: string): AssignResult {
  const house = state.houses.find((h) => h.id === houseId)
  if (!house) return 'nothingToDo'
  const est = estimateExpedition(state, person, house)
  if (est.result !== 'ok') return est.result
  cancelJob(person)
  person.sleeping = false
  person.budgetMin -= est.minutes
  person.away = { houseId, returnAt: est.returnAt }
  emit(state, { type: 'expeditionLeft', personId: person.id, houseId, returnAt: est.returnAt })
  return 'ok'
}

/** Runners whose time is up come home with what they carry, and with whatever the road did to them. */
export function tickExpeditions(state: GameState): void {
  for (const p of state.people) {
    if (!p.away || p.health <= 0 || state.totalMinutes < p.away.returnAt) continue
    const house = state.houses.find((h) => h.id === p.away!.houseId)
    p.away = null
    p.pos = { ...p.home }
    p.prev = { ...p.home }
    p.trail = []
    if (!house) continue
    const loot = carryFrom(house, p.carry)
    house.loot = { food: house.loot.food - loot.food, boards: house.loot.boards - loot.boards, meds: house.loot.meds - loot.meds }
    house.visited = true
    state.res.food += loot.food
    state.res.boards += loot.boards
    state.res.meds += loot.meds
    const late = daylightLeft(state.totalMinutes) <= 0
    const unlucky = state.rng.next() < house.danger
    emit(state, { type: 'expeditionReturn', personId: p.id, houseId: house.id, loot, late, hurt: late || unlucky })
    if (late) wound(state, p.id, VILLAGE.lateWound)
    else if (unlucky) wound(state, p.id, VILLAGE.dangerWound)
  }
}
