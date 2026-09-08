/**
 * Save and load. One slot, written at every morning checkpoint (right after
 * the report, with the game paused), read by "Continue" on the start screen.
 * The whole simulation is plain data, so this is a straight copy out and in;
 * only the people are class instances and get rebuilt from their defs.
 */
import { TileGrid } from '../world'
import { Person } from './person'
import type { Section } from './sections'
import { GameState, type NightState, type Resources, type Stove } from './state'
import type { Cell } from '../world'
import balance from '../data/balance.json'
import type { House } from './village'

export const SAVE_KEY = 'thirty-nights.save.v1'

interface PersonData {
  id: string
  health: number
  woundDays: number
  pos: { c: number; r: number }
  prev: { c: number; r: number }
  path: Cell[] | null
  heading: number
  job: Person['job']
  budgetMin: number
  sleeping: boolean
  home: Cell
  away: Person['away']
}

export interface SaveData {
  version: 1
  seed: number
  rng: number
  w: number
  h: number
  terrain: number[]
  trees: number[]
  structure: number[]
  ext: number[]
  totalMinutes: number
  res: Resources
  people: PersonData[]
  sections: Section[]
  stoves: Stove[]
  beds: Cell[]
  sawhorse: Cell
  gateOutside: Cell
  yardAnchor: Cell
  houses: House[]
  night: Omit<NightState, 'yardVictims'> & { yardVictims: string[] }
  lastMorningDay: number
  hungryToday: boolean
  over: GameState['over']
  burningBoards: boolean
}

export function serialize(state: GameState): SaveData {
  const g = state.grid
  return {
    version: 1,
    seed: state.rng.seed,
    rng: state.rng.getState(),
    w: g.w,
    h: g.h,
    terrain: Array.from(g.terrain),
    trees: Array.from(g.trees),
    structure: Array.from(g.structure),
    ext: Array.from(g.ext),
    totalMinutes: state.totalMinutes,
    res: { ...state.res },
    people: state.people.map((p) => ({
      id: p.id,
      health: p.health,
      woundDays: p.woundDays,
      pos: { ...p.pos },
      prev: { ...p.prev },
      path: p.path ? p.path.map((c) => ({ ...c })) : null,
      heading: p.heading,
      job: p.job,
      budgetMin: p.budgetMin,
      sleeping: p.sleeping,
      home: { ...p.home },
      away: p.away,
    })),
    sections: state.sections,
    stoves: state.stoves,
    beds: state.beds,
    sawhorse: state.sawhorse,
    gateOutside: state.gateOutside,
    yardAnchor: state.yardAnchor,
    houses: state.houses,
    night: { ...state.night, yardVictims: [...state.night.yardVictims] },
    lastMorningDay: state.lastMorningDay,
    hungryToday: state.hungryToday,
    over: state.over,
    burningBoards: state.burningBoards,
  }
}

/** Rebuild a state from a save. Throws on a save this build cannot read. */
export function restore(data: SaveData): GameState {
  if (data.version !== 1) throw new Error(`unknown save version ${String(data.version)}`)
  const state = new GameState(data.seed, data.w, data.h)
  state.rng.setState(data.rng)
  const g: TileGrid = state.grid
  g.terrain.set(data.terrain)
  g.trees.set(data.trees)
  g.structure.set(data.structure)
  g.ext.set(data.ext)
  g.structureVersion++
  state.totalMinutes = data.totalMinutes
  state.res = { ...data.res }
  const budget = balance.calendar.workHoursPerDay * 60
  state.people = data.people.map((d) => {
    const def = balance.people.find((x) => x.id === d.id) ?? balance.people[0]!
    const p = new Person(def, d.home, budget)
    p.health = d.health
    p.woundDays = d.woundDays
    p.pos = { ...d.pos }
    p.prev = { ...d.prev }
    p.path = d.path
    p.heading = d.heading
    p.job = d.job
    p.budgetMin = d.budgetMin
    p.sleeping = d.sleeping
    p.away = d.away ?? null
    return p
  })
  state.sections = data.sections
  state.stoves = data.stoves
  state.beds = data.beds
  state.sawhorse = data.sawhorse
  state.gateOutside = data.gateOutside
  state.yardAnchor = data.yardAnchor
  state.houses = data.houses ?? []
  state.night = { ...data.night, yardVictims: new Set(data.night.yardVictims) }
  state.lastMorningDay = data.lastMorningDay
  state.hungryToday = data.hungryToday
  state.over = data.over
  state.burningBoards = data.burningBoards
  return state
}

/** A save survives a JSON round trip; this is what goes to storage. */
export function toJson(state: GameState): string {
  return JSON.stringify(serialize(state))
}

export function fromJson(json: string): GameState {
  return restore(JSON.parse(json) as SaveData)
}

// ---- storage (the browser's, which is also the app's on the phone) ------------

export function saveGame(state: GameState): boolean {
  try {
    localStorage.setItem(SAVE_KEY, toJson(state))
    return true
  } catch {
    return false
  }
}

export function loadGame(): GameState | null {
  try {
    const json = localStorage.getItem(SAVE_KEY)
    return json ? fromJson(json) : null
  } catch {
    return null
  }
}

/** The day of the saved morning, for the start screen (null = no save). */
export function savedDay(): number | null {
  try {
    const json = localStorage.getItem(SAVE_KEY)
    if (!json) return null
    const data = JSON.parse(json) as SaveData
    return Math.floor(data.totalMinutes / 1440) + 1
  } catch {
    return null
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY)
  } catch {
    // storage unavailable: nothing to clear
  }
}
