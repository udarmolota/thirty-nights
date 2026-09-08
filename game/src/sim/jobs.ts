/**
 * Work. The player assigns, nobody picks jobs on their own. A job is either
 * continuous (chop, saw: work until the input, the daylight or the day's
 * budget runs out) or an operation on a section (repair, reinforce,
 * build, board a window) whose progress lives ON THE SECTION - stop halfway,
 * come back tomorrow, someone else can finish it.
 */
import { findPath, StructureType, type Cell } from '../world'
import { emit } from './events'
import type { Person } from './person'
import { completeOp, isOpen, opCost, type Section, type SectionOp } from './sections'
import type { GameState } from './state'
import { daylightLeft, hourOf, isDaylight, STEP_MIN } from './time'
import balance from '../data/balance.json'

export type Job =
  | { kind: 'chop'; spot: Cell; tree: Cell; swings: number }
  | { kind: 'saw'; spot: Cell }
  | { kind: 'section'; sectionId: number; spot: Cell }
  | { kind: 'home' }

export type AssignResult = 'ok' | 'noWood' | 'noBoards' | 'dark' | 'noPath' | 'nothingToDo' | 'noMeds' | 'tired'

const P = balance.production
/** Choppers never stand closer than this (Chebyshev tiles) to one another. */
const CHOP_SPACING = 2
/** After this many chopping steps a chopper drifts to a neighbouring tree. */
const CHOP_MOVE_EVERY = 2
/** How far (tiles) a drifting chopper looks for the next tree. */
const CHOP_DRIFT = 3
const W = balance.wounds
const WALK_PER_STEP = balance.walkTilesPerMinute * STEP_MIN

const ADJ = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const

function nearestStandTile(state: GameState, target: Cell, from: Cell): Cell | null {
  let best: Cell | null = null
  let bestD = Infinity
  for (const [dc, dr] of ADJ) {
    const c = target.c + dc
    const r = target.r + dr
    if (!state.grid.isWalkable(c, r)) continue
    const d = Math.abs(c - from.c) + Math.abs(r - from.r)
    if (d < bestD) {
      bestD = d
      best = { c, r }
    }
  }
  return best
}

/** Where the other choppers stand (or are heading), so nobody piles up. */
function chopSpotsTaken(state: GameState, except: Person): Cell[] {
  const taken: Cell[] = []
  for (const p of state.people) {
    if (p !== except && p.health > 0 && p.job?.kind === 'chop') taken.push(p.job.spot)
  }
  return taken
}

function tooClose(spot: Cell, taken: Cell[]): boolean {
  return taken.some((t) => Math.max(Math.abs(t.c - spot.c), Math.abs(t.r - spot.r)) < CHOP_SPACING)
}

export interface ChopSearch {
  /** Spots to keep CHOP_SPACING away from (the other choppers). */
  avoid?: Cell[]
  /** Only trees within this many tiles of `from` (Chebyshev). */
  maxDist?: number
  /** A tree not to pick again (the one we are leaving). */
  notTree?: Cell
}

/** The nearest standing tree (by default from the gate) and where to stand at it. */
export function findChopSpot(state: GameState, from: Cell, search: ChopSearch = {}): { spot: Cell; tree: Cell } | null {
  const g = state.grid
  const avoid = search.avoid ?? []
  let best: { spot: Cell; tree: Cell } | null = null
  let bestD = Infinity
  for (let r = 0; r < g.h; r++) {
    for (let c = 0; c < g.w; c++) {
      if (g.treesAt(c, r) === 0) continue
      if (search.notTree && search.notTree.c === c && search.notTree.r === r) continue
      if (search.maxDist !== undefined && Math.max(Math.abs(c - from.c), Math.abs(r - from.r)) > search.maxDist) continue
      const d = Math.abs(c - from.c) + Math.abs(r - from.r)
      if (d >= bestD) continue
      const stand = nearestStandTile(state, { c, r }, from)
      if (!stand || tooClose(stand, avoid)) continue
      bestD = d
      best = { spot: stand, tree: { c, r } }
    }
  }
  return best
}

function walkTo(state: GameState, person: Person, target: Cell): boolean {
  const path = findPath(state.grid, Math.round(person.pos.c), Math.round(person.pos.r), target.c, target.r)
  if (path === null) return false
  person.path = path.length > 0 ? path : null
  return true
}

export function cancelJob(person: Person): void {
  person.job = null
  person.path = null
}

export function assignChop(state: GameState, person: Person): AssignResult {
  if (person.budgetMin <= 0) return 'tired'
  if (!isDaylight(state.totalMinutes)) return 'dark'
  const found = findChopSpot(state, state.gateOutside, { avoid: chopSpotsTaken(state, person) })
  if (!found) return 'nothingToDo'
  if (!walkTo(state, person, found.spot)) return 'noPath'
  person.job = { kind: 'chop', spot: found.spot, tree: found.tree, swings: 0 }
  return 'ok'
}

export function assignSaw(state: GameState, person: Person): AssignResult {
  if (person.budgetMin <= 0) return 'tired'
  if (state.res.wood < P.woodPerBoard) return 'noWood'
  if (!walkTo(state, person, state.sawhorse)) return 'noPath'
  person.job = { kind: 'saw', spot: state.sawhorse }
  return 'ok'
}

/** Where to stand to work on a section: on the compound side (inside the fence / in the yard). */
function sectionStandTile(state: GameState, section: Section): Cell | null {
  const inside = { c: (state.grid.w / 2) | 0, r: (state.grid.h / 2) | 0 }
  let spot: Cell | null = null
  for (const t of section.tiles) {
    const s = nearestStandTile(state, t, inside)
    if (s && (spot === null || Math.abs(s.c - inside.c) + Math.abs(s.r - inside.r) < Math.abs(spot.c - inside.c) + Math.abs(spot.r - inside.r))) spot = s
  }
  return spot
}

/**
 * Start (or resume) an operation on a section. Boards are paid when the
 * operation starts and stay on the section if the work is interrupted.
 */
export function assignSection(state: GameState, person: Person, sectionId: number, op: SectionOp): AssignResult {
  if (person.budgetMin <= 0) return 'tired'
  const section = state.section(sectionId)
  if (!section) return 'nothingToDo'
  if (section.op !== null && section.op !== op) return 'nothingToDo' // finish what was started first
  const cost = opCost(op)
  if (section.op === null && state.res.boards < cost.boards) return 'noBoards'
  // Every check before any payment: an unreachable section must not eat the boards.
  const spot = sectionStandTile(state, section)
  if (!spot || !walkTo(state, person, spot)) return 'noPath'
  if (section.op === null) {
    state.res.boards -= cost.boards
    section.op = op
    section.progress = 0
  }
  person.job = { kind: 'section', sectionId, spot }
  return 'ok'
}

export function goHome(state: GameState, person: Person): void {
  person.job = { kind: 'home' }
  walkTo(state, person, person.home)
}

/** Spend one medicine on a wounded person: the wound heals in a day instead of three. */
export function treat(state: GameState, person: Person): AssignResult {
  // Nothing to gain once the wound is already down to a day: do not waste the medicine.
  if (!person.wounded || person.health <= 0 || person.woundDays <= W.daysWithMeds) return 'nothingToDo'
  if (state.res.meds < 1) return 'noMeds'
  state.res.meds -= 1
  person.woundDays = Math.min(person.woundDays, W.daysWithMeds)
  return 'ok'
}

function moveAlongPath(person: Person): void {
  const path = person.path
  if (!path) return
  let budget = WALK_PER_STEP
  person.trail = [{ ...person.pos }]
  while (budget > 0 && path.length > 0) {
    const wp = path[0]!
    const dc = wp.c - person.pos.c
    const dr = wp.r - person.pos.r
    const dist = Math.hypot(dc, dr)
    if (dist > 1e-6) person.heading = Math.atan2(dr, dc)
    if (dist <= budget) {
      person.pos = { c: wp.c, r: wp.r }
      path.shift()
      budget -= dist
    } else {
      person.pos = { c: person.pos.c + (dc / dist) * budget, r: person.pos.r + (dr / dist) * budget }
      budget = 0
    }
    person.trail.push({ ...person.pos })
  }
  if (path.length === 0) person.path = null
}

/** One 10-minute step of a person's day. */
export function tickPerson(state: GameState, person: Person): void {
  person.prev = { ...person.pos }
  person.trail = []
  const hour = hourOf(state.totalMinutes)
  const nightHours = hour >= 22 || hour < 6

  // Out of budget: stop working and walk home. Night is no reason by itself -
  // inside the perimeter work goes on at any hour (repairing the fence during
  // an assault is the whole point), only the daily hours are the limit.
  if (person.job && person.job.kind !== 'home' && person.budgetMin <= 0) goHome(state, person)
  // Daylight ended: the forest is off limits.
  if (person.job?.kind === 'chop' && !isDaylight(state.totalMinutes)) goHome(state, person)

  if (person.isMoving) {
    moveAlongPath(person)
    person.sleeping = false
    // Walking around the base is free of work hours: it only spends the minutes
    // of the day. Distance is a resource on expeditions, not in the yard.
    return
  }

  const job = person.job
  if (!job || job.kind === 'home') {
    person.sleeping = nightHours
    if (job?.kind === 'home') person.job = null
    return
  }
  person.sleeping = false
  const minutes = STEP_MIN * person.work * (person.wounded ? W.workFactor : 1) // the wounded work at half pace
  person.budgetMin -= STEP_MIN

  switch (job.kind) {
    case 'chop': {
      if (state.grid.treesAt(job.tree.c, job.tree.r) === 0 || !person.isAtTile(job.spot.c, job.spot.r)) {
        // Tree gone (or we drifted): find the next one.
        const next = findChopSpot(state, state.gateOutside, { avoid: chopSpotsTaken(state, person) })
        if (!next || !walkTo(state, person, next.spot)) {
          goHome(state, person)
          return
        }
        person.job = { kind: 'chop', spot: next.spot, tree: next.tree, swings: 0 }
        return
      }
      // The forest is not a stock: chopping never fells trees, the limit is daylight and hands.
      state.res.wood += (P.chopWoodPerHour / 60) * minutes
      job.swings++
      // Every few swings drift to a neighbouring tree (a short hop, no path, no
      // lost work) so the choppers roam the edge instead of hacking one spruce.
      if (job.swings >= CHOP_MOVE_EVERY) {
        job.swings = 0
        const next = findChopSpot(state, job.spot, { avoid: chopSpotsTaken(state, person), maxDist: CHOP_DRIFT, notTree: job.tree })
        if (next) {
          person.heading = Math.atan2(next.spot.r - person.pos.r, next.spot.c - person.pos.c)
          person.pos = { c: next.spot.c, r: next.spot.r }
          job.spot = next.spot
          job.tree = next.tree
        }
      }
      // Never let the walk back end in the dark: leave when the light is nearly gone.
      if (daylightLeft(state.totalMinutes) <= STEP_MIN * 2) goHome(state, person)
      return
    }
    case 'saw': {
      if (state.res.wood <= 0) {
        goHome(state, person)
        return
      }
      // Firewood goes in, boards come out: woodPerBoard pieces per board.
      const wood = Math.min(state.res.wood, ((P.sawBoardsPerHour * P.woodPerBoard) / 60) * minutes)
      state.res.wood -= wood
      state.res.boards += wood / P.woodPerBoard
      return
    }
    case 'section': {
      const section = state.section(job.sectionId)
      if (!section || section.op === null) {
        goHome(state, person)
        return
      }
      section.progress += minutes
      if (section.progress >= opCost(section.op).minutes) {
        const wasOpen = isOpen(section)
        completeOp(section)
        for (const t of section.tiles) {
          const type = section.kind === 'fence' ? StructureType.Fence : section.kind === 'wall' ? StructureType.LogWall : section.boarded ? StructureType.BoardedWindow : StructureType.Window
          if (state.grid.structureAt(t.c, t.r) !== type) state.grid.setStructure(t.c, t.r, type)
        }
        if (wasOpen && state.night.phase !== 'none') state.night.targetId = -1 // the enemies re-pick
        emit(state, { type: 'jobDone', personId: person.id, job: 'section' })
        goHome(state, person)
      }
      return
    }
  }
}

// ---- planning: what would this person achieve, before committing --------------------

/** A job the player is considering; the sheet shows an estimate per person, then confirms. */
export type Plan = { kind: 'chop' } | { kind: 'saw' } | { kind: 'section'; sectionId: number; op: SectionOp }

export interface JobEstimate {
  /** 'ok', or why it could not start (the same reasons assigning would give). */
  result: AssignResult
  /** Minutes of walking before the work starts. */
  walkMin: number
  /** Minutes of work until the job ends: done, out of light, out of hours or out of input. */
  workMin: number
  /** Expected yield. */
  wood: number
  boards: number
  /** Boards to pay now (section ops; 0 when the work is already paid for). */
  boardsCost: number
  /** False when today's hours will not see the work through (it continues tomorrow). */
  enoughToday: boolean
}

function walkMinutes(state: GameState, person: Person, target: Cell): number | null {
  const path = findPath(state.grid, Math.round(person.pos.c), Math.round(person.pos.r), target.c, target.r)
  if (path === null) return null
  return Math.ceil(path.length / WALK_PER_STEP) * STEP_MIN
}

/** Mirror of the assign functions and tickPerson, without touching anything. */
export function estimateJob(state: GameState, person: Person, plan: Plan): JobEstimate {
  const none: JobEstimate = { result: 'ok', walkMin: 0, workMin: 0, wood: 0, boards: 0, boardsCost: 0, enoughToday: true }
  const fail = (result: AssignResult): JobEstimate => ({ ...none, result })
  if (person.health <= 0 || person.budgetMin <= 0) return fail('tired')
  const rate = person.work * (person.wounded ? W.workFactor : 1) // work minutes per real minute

  if (plan.kind === 'chop') {
    if (!isDaylight(state.totalMinutes)) return fail('dark')
    const found = findChopSpot(state, state.gateOutside, { avoid: chopSpotsTaken(state, person) })
    if (!found) return fail('nothingToDo')
    const walkMin = walkMinutes(state, person, found.spot)
    if (walkMin === null) return fail('noPath')
    // Chopping stops when the light is nearly gone or the day's hours are spent.
    const workMin = Math.max(0, Math.min(person.budgetMin, daylightLeft(state.totalMinutes) - walkMin - STEP_MIN * 2))
    return { ...none, walkMin, workMin, wood: (workMin / 60) * P.chopWoodPerHour * rate }
  }

  if (plan.kind === 'saw') {
    if (state.res.wood < P.woodPerBoard) return fail('noWood')
    const walkMin = walkMinutes(state, person, state.sawhorse)
    if (walkMin === null) return fail('noPath')
    const woodPerMin = ((P.sawBoardsPerHour * P.woodPerBoard) / 60) * rate
    const workMin = Math.max(0, Math.min(person.budgetMin, state.res.wood / woodPerMin))
    return { ...none, walkMin, workMin, boards: (workMin * woodPerMin) / P.woodPerBoard }
  }

  const section = state.section(plan.sectionId)
  if (!section) return fail('nothingToDo')
  if (section.op !== null && section.op !== plan.op) return fail('nothingToDo')
  const cost = opCost(plan.op)
  const boardsCost = section.op === null ? cost.boards : 0
  if (state.res.boards < boardsCost) return fail('noBoards')
  const spot = sectionStandTile(state, section)
  const walkMin = spot ? walkMinutes(state, person, spot) : null
  if (walkMin === null) return fail('noPath')
  const remaining = section.op === plan.op ? Math.max(0, cost.minutes - section.progress) : cost.minutes
  const workMin = remaining / rate
  return { ...none, walkMin, workMin, boardsCost, enoughToday: workMin <= person.budgetMin }
}
