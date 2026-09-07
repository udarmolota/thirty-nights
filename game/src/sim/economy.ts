/**
 * Stocks and the daily rhythm: stoves burn fuel every step, food is
 * deducted every morning at six, work budgets refill, and the morning
 * report goes out. Win and loss are decided here too.
 */
import { emit } from './events'
import type { GameState } from './state'
import { hourOf, nightOf, STEP_MIN, TOTAL_DAYS } from './time'
import balance from '../data/balance.json'

/** Lit stoves eat firewood; when it is gone they eat boards one for one; when both are gone they go out. */
export function burnStoves(state: GameState): void {
  const lit = state.stoves.filter((s) => s.lit).length
  if (lit === 0) return
  const EPS = 1e-9
  let need = (lit * balance.heat.stoveWoodPerHour * STEP_MIN) / 60
  const fromWood = Math.min(need, state.res.wood)
  state.res.wood -= fromWood
  need -= fromWood
  if (need <= EPS) {
    state.burningBoards = false
    return
  }
  const fromBoards = Math.min(need, state.res.boards)
  state.res.boards -= fromBoards
  need -= fromBoards
  if (need <= EPS) {
    if (!state.burningBoards) {
      state.burningBoards = true
      emit(state, { type: 'burningBoards' })
    }
    return
  }
  // Nothing left to burn: every stove goes dark.
  state.res.wood = 0
  state.res.boards = 0
  state.burningBoards = false
  state.stoves.forEach((s, i) => {
    if (s.lit) {
      s.lit = false
      emit(state, { type: 'stoveOut', stoveIndex: i })
    }
  })
}

/** Days of food left at the current headcount (for the HUD). */
export function foodDays(state: GameState): number {
  const alive = state.people.filter((p) => p.health > 0).length
  if (alive === 0) return 0
  return Math.floor(state.res.food / (alive * balance.food.perPersonPerDay))
}

/** At 06:00: eat, refill budgets, report the night, check the dawn. */
export function tickMorning(state: GameState): void {
  if (hourOf(state.totalMinutes) < 6 || state.lastMorningDay === state.day) return
  state.lastMorningDay = state.day
  const day = state.day
  if (day > TOTAL_DAYS) {
    state.over = 'won'
    emit(state, { type: 'dawn' })
    return
  }
  const alive = state.people.filter((p) => p.health > 0)
  const need = alive.length * balance.food.perPersonPerDay
  if (state.res.food >= need) {
    state.res.food -= need
    state.hungryToday = false
  } else {
    state.res.food = 0
    state.hungryToday = true
    for (const p of alive) p.health = Math.max(0, p.health - balance.food.hungerHealthPerDay)
  }
  for (const p of alive) {
    p.budgetMin = balance.calendar.workHoursPerDay * 60
    if (p.woundDays > 0) {
      p.woundDays--
      if (p.woundDays === 0) emit(state, { type: 'recovered', personId: p.id })
    }
  }
  // The UI reads the report from the event: the log is reset right here.
  const report = { ...state.night.log, wounded: [...state.night.log.wounded] }
  emit(state, { type: 'morning', day, night: nightOf(day), report })
  state.night.log = { fenceHoles: 0, wallHoles: 0, breached: false, wounded: [] }
  state.night.yardVictims.clear()
}

/** Everyone alive is out of work hours and idle: nothing more will happen today. */
export function everyoneDone(state: GameState): boolean {
  const alive = state.people.filter((p) => p.health > 0)
  return alive.length > 0 && alive.every((p) => p.budgetMin <= 0 && !p.isMoving && (p.job === null || p.job.kind === 'home'))
}

export function checkDefeat(state: GameState): void {
  if (state.over !== 'none') return
  if (state.people.every((p) => p.health <= 0)) {
    state.over = 'lost'
    const reason = state.hungryToday ? 'starved' : state.night.phase === 'people' ? 'killed' : 'frozen'
    emit(state, { type: 'gameOver', reason })
  }
}
