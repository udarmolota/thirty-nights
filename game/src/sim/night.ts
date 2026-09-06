/**
 * The siege. Enemies are not entities - they are pressure that flows to the
 * weakest point, in phases: the fence, then the yard, then the building's
 * weakest wall or window, then the people in the room behind it. Every
 * phase change is an event the UI turns into a pause and a shout.
 */
import { emit } from './events'
import { goHome } from './jobs'
import { damage, isOpen, strength, type Section } from './sections'
import { applyToGrid } from './sections'
import type { GameState } from './state'
import { dayOf, isAttackHour, nightAttackers, nightKind, nightOf, STEP_MIN } from './time'
import balance from '../data/balance.json'

const N = balance.night
const W = balance.wounds

function weakest(sections: Section[]): Section | null {
  let best: Section | null = null
  for (const s of sections) {
    if (best === null || strength(s) < strength(best) || (strength(s) === strength(best) && s.id < best.id)) best = s
  }
  return best
}

function wound(state: GameState, personId: string, amount: number): void {
  const p = state.person(personId)
  if (!p || p.health <= 0) return
  p.health = Math.max(0, p.health - amount)
  if (!p.wounded) {
    p.woundDays = W.days
    goHome(state, p)
    state.night.log.wounded.push(p.id)
    emit(state, { type: 'wounded', personId: p.id })
  }
}

export function tickNight(state: GameState): void {
  const night = state.night
  const day = dayOf(state.totalMinutes)
  const n = nightOf(day)

  if (!isAttackHour(state.totalMinutes)) {
    if (night.phase !== 'none') {
      night.phase = 'none'
      night.targetId = -1
      night.breachId = -1
    }
    night.announced = false
    return
  }
  if (n === 0) return

  if (!night.announced) {
    night.announced = true
    night.night = n
    night.attackers = nightAttackers(n)
    night.phase = night.attackers > 0 ? 'fence' : 'none'
    night.targetId = -1
    emit(state, { type: 'nightFalls', night: n, kind: nightKind(n), attackers: night.attackers })
  }
  if (night.attackers <= 0) return

  const dmg = (night.attackers * N.damagePerAttackerHour * STEP_MIN) / 60
  const fences = state.sections.filter((s) => s.kind === 'fence')
  const walls = state.sections.filter((s) => s.kind !== 'fence')

  // Phase 1: the fence. Any opening lets them straight into the yard.
  if (night.phase === 'fence') {
    if (fences.some(isOpen)) {
      night.phase = 'yard'
      night.log.breached = true
      emit(state, { type: 'yardBreach', night: n })
    } else {
      let target = night.targetId >= 0 ? state.section(night.targetId) : undefined
      if (!target || target.kind !== 'fence' || isOpen(target)) target = weakest(fences.filter((s) => !isOpen(s))) ?? undefined
      if (!target) return
      night.targetId = target.id
      if (damage(target, dmg)) {
        applyToGrid(state.grid, target)
        night.log.fenceHoles++
        night.targetId = -1
        emit(state, { type: 'fenceHole', sectionId: target.id })
      } else {
        applyToGrid(state.grid, target)
      }
      return
    }
  }

  // From here on they are in the yard: anyone working out there gets hurt
  // once per night.
  for (const p of state.people) {
    if (p.health <= 0 || night.yardVictims.has(p.id)) continue
    const room = state.roomAt(Math.round(p.pos.c), Math.round(p.pos.r))
    if (room === state.yardRoomId && !p.sleeping) {
      night.yardVictims.add(p.id)
      wound(state, p.id, N.breachWound)
    }
  }

  // Phase 2: the building's weakest wall or window.
  if (night.phase === 'yard') {
    const open = walls.find(isOpen)
    if (open) {
      night.phase = 'people'
      night.breachId = open.id
      emit(state, { type: 'peopleAttacked', sectionId: open.id })
    } else {
      let target = night.targetId >= 0 ? state.section(night.targetId) : undefined
      if (!target || target.kind === 'fence' || isOpen(target)) target = weakest(walls.filter((s) => !isOpen(s))) ?? undefined
      if (!target) return
      night.targetId = target.id
      if (damage(target, dmg)) {
        applyToGrid(state.grid, target)
        night.log.wallHoles++
        night.targetId = -1
        emit(state, { type: 'wallHole', sectionId: target.id })
      } else {
        applyToGrid(state.grid, target)
      }
      return
    }
  }

  // Phase 3: people in the room behind the breach. A repaired wall sends
  // them back out (or on to the next open one). The room is looked up every
  // step: region ids change whenever the perimeter does.
  if (night.phase === 'people') {
    let breach = night.breachId >= 0 ? state.section(night.breachId) : undefined
    if (!breach || breach.kind === 'fence' || !isOpen(breach)) breach = walls.find(isOpen)
    if (!breach) {
      night.phase = 'yard'
      night.breachId = -1
      return
    }
    night.breachId = breach.id
    const roomId = state.roomBehind(breach)
    for (const p of state.people) {
      if (p.health <= 0) continue
      const room = state.roomAt(Math.round(p.pos.c), Math.round(p.pos.r))
      if (room < 0 || room !== roomId) continue
      wound(state, p.id, p.wounded ? (N.damagePerAttackerHour * STEP_MIN) / 60 : N.breachWound)
    }
  }
}
