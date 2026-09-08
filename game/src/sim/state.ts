/**
 * The whole simulation in one object: the grid, the sections, the people,
 * the stocks, the clock. Pure data plus lazy caches; no DOM.
 */
import { Rng } from '../core/rng'
import { computeRooms, TileGrid, type Cell, type RoomData } from '../world'
import type { SimEvent } from './events'
import type { Person } from './person'
import type { Section } from './sections'
import type { House } from './village'
import { MIN_PER_DAY } from './time'
import balance from '../data/balance.json'

export interface Stove {
  c: number
  r: number
  lit: boolean
  /** The open tile in front of the stove (where the fire warms from). */
  front: Cell
}

/**
 * Firewood is the unit of heat: one piece keeps one stove going for an hour.
 * It is chopped in the forest and either burnt or sawn into boards; boards
 * burn too, one for one, when the firewood is gone - dear, but warm.
 */
export interface Resources {
  wood: number
  boards: number
  food: number
  meds: number
}

export type NightPhase = 'none' | 'fence' | 'yard' | 'building' | 'people'

/** Facts for the morning report. */
export interface NightReport {
  fenceHoles: number
  wallHoles: number
  breached: boolean
  wounded: string[]
}

export interface NightState {
  phase: NightPhase
  night: number
  attackers: number
  targetId: number
  /** The open wall/window section the enemies came in through (phase 'people'). */
  breachId: number
  announced: boolean
  /** Who has already been hurt in the yard tonight (once per person per night). */
  yardVictims: Set<string>
  log: NightReport
}

export class GameState {
  readonly grid: TileGrid
  readonly rng: Rng
  /** Day 1 starts at 08:00, the first hour of light. */
  totalMinutes = 8 * 60
  res: Resources = { ...balance.start }
  people: Person[] = []
  sections: Section[] = []
  stoves: Stove[] = []
  beds: Cell[] = []
  sawhorse: Cell = { c: 0, r: 0 }
  gateOutside: Cell = { c: 0, r: 0 }
  /** A tile that is always in the yard (just inside the gate): the yard's
   *  region id is looked up from it, because region ids are renumbered
   *  whenever the perimeter changes. */
  yardAnchor: Cell = { c: 0, r: 0 }
  /** The village beyond the fence, house by house. */
  houses: House[] = []
  events: SimEvent[] = []
  night: NightState = {
    phase: 'none',
    night: 0,
    attackers: 0,
    targetId: -1,
    breachId: -1,
    announced: false,
    yardVictims: new Set(),
    log: { fenceHoles: 0, wallHoles: 0, breached: false, wounded: [] },
  }
  lastMorningDay = 0
  hungryToday = false
  over: 'none' | 'won' | 'lost' = 'none'
  /** The stoves are eating boards because the firewood ran out (announced once). */
  burningBoards = false

  private roomsCache: RoomData | null = null
  private roomsVersion = -1

  constructor(seed: number, w: number, h: number) {
    this.rng = new Rng(seed)
    this.grid = new TileGrid(w, h)
  }

  get day(): number {
    return Math.floor(this.totalMinutes / MIN_PER_DAY) + 1
  }

  rooms(): RoomData {
    if (this.roomsCache === null || this.roomsVersion !== this.grid.structureVersion) {
      this.roomsCache = computeRooms(this.grid)
      this.roomsVersion = this.grid.structureVersion
    }
    return this.roomsCache
  }

  roomAt(c: number, r: number): number {
    if (!this.grid.inBounds(c, r)) return -1
    return this.rooms().roomIdByTile[this.grid.idx(c, r)]!
  }

  /** Region id of the yard (inside the fence, outside the building). */
  get yardRoomId(): number {
    return this.roomAt(this.yardAnchor.c, this.yardAnchor.r)
  }

  /** The indoor room behind a wall/window section right now (-1 if none). */
  roomBehind(section: Section): number {
    const rooms = this.rooms()
    const indoorAt = (c: number, r: number): number => {
      const id = this.roomAt(c, r)
      return id >= 0 && rooms.rooms[id]!.indoor ? id : -1
    }
    if (section.inside) {
      const id = indoorAt(section.inside.c, section.inside.r)
      if (id >= 0) return id
    }
    // The anchor tile got built over: any indoor room touching the section will do.
    for (const t of section.tiles) {
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const id = indoorAt(t.c + dc, t.r + dr)
        if (id >= 0) return id
      }
    }
    return -1
  }

  section(id: number): Section | undefined {
    return this.sections[id]
  }

  person(id: string): Person | undefined {
    return this.people.find((p) => p.id === id)
  }
}
