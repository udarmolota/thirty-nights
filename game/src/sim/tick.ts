/**
 * One simulation step = 10 game minutes. Order matters and is fixed:
 * clock -> morning -> stoves -> people -> heat -> siege -> defeat.
 */
import { burnStoves, checkDefeat, tickMorning } from './economy'
import { applyCold, computeTemps, type RoomTemps } from './heat'
import { tickPerson } from './jobs'
import { tickNight } from './night'
import type { GameState } from './state'
import { STEP_MIN } from './time'

export interface StepInfo {
  temps: RoomTemps
}

export function simStep(state: GameState): StepInfo {
  if (state.over !== 'none') {
    return { temps: computeTemps(state) }
  }
  state.totalMinutes += STEP_MIN
  tickMorning(state)
  burnStoves(state)
  for (const p of state.people) {
    if (p.health > 0) tickPerson(state, p)
  }
  const temps = computeTemps(state)
  applyCold(state, temps)
  tickNight(state)
  checkDefeat(state)
  return { temps }
}
