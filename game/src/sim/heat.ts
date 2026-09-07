/**
 * Heat by room. A stove gives +24 C and heats ~100 tiles at full strength;
 * a bigger room gets proportionally less, a smaller one up to 1.5x more. Windows, doors to the cold, holes
 * and boarded windows leak. Below 0 C the people sleeping there lose health.
 */
import { structureDef, StructureType, type Room } from '../world'
import type { GameState } from './state'
import { STEP_MIN } from './time'
import balance from '../data/balance.json'

const H = balance.heat

export interface RoomTemps {
  /** roomId -> temperature; rooms that are not indoor read as outside. */
  temps: Map<number, number>
  /** roomId -> lit stoves inside. */
  stoves: Map<number, number>
}

const ADJ = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const

/** The room a stove warms: the open tile in front of it. */
export function stoveRoom(state: GameState, index: number): number {
  const s = state.stoves[index]!
  return state.roomAt(s.front.c, s.front.r)
}

export function computeTemps(state: GameState): RoomTemps {
  const data = state.rooms()
  const stoves = new Map<number, number>()
  state.stoves.forEach((s, i) => {
    if (!s.lit) return
    const id = stoveRoom(state, i)
    if (id >= 0) stoves.set(id, (stoves.get(id) ?? 0) + 1)
  })
  const g = state.grid

  const heatOf = (room: Room): number => {
    const lit = stoves.get(room.id) ?? 0
    // Full strength up to stoveArea tiles; a smaller room gets more, up to stoveBoost times.
    return lit * H.stoveHeat * Math.min(H.stoveBoost, H.stoveArea / Math.max(1, room.tiles))
  }
  // A window or a hole is one opening however many tiles its section spans:
  // leaks are counted per section, not per tile.
  const sectionByTile = new Map<number, number>()
  for (const s of state.sections) for (const t of s.tiles) sectionByTile.set(g.idx(t.c, t.r), s.id)
  /** Sum the leaks around a room; `doorLeaks` decides for each door tile. */
  const leaksOf = (room: Room, doorLeaks: (c: number, r: number) => boolean): number => {
    let leak = 0
    const counted = new Set<number>()
    for (const idx of room.boundary) {
      const c = idx % g.w
      const r = (idx - c) / g.w
      const type = g.structureAt(c, r)
      const def = structureDef(type)
      if (!def || def.leak === 0) continue
      if ((type === StructureType.Door || type === StructureType.Gate) && !doorLeaks(c, r)) continue
      const section = sectionByTile.get(idx)
      if (section !== undefined) {
        if (counted.has(section)) continue
        counted.add(section)
      }
      leak += def.leak
    }
    return leak
  }
  const pass = (doorLeaks: (room: Room) => (c: number, r: number) => boolean): Map<number, number> => {
    const temps = new Map<number, number>()
    for (const room of data.rooms) {
      // Leaks eat the stove's heat; an unheated room is as cold as outside, not colder.
      temps.set(room.id, room.indoor ? H.outside + Math.max(0, heatOf(room) - leaksOf(room, doorLeaks(room))) : H.outside)
    }
    return temps
  }

  // Two passes, no circularity: first every door leaks; then a door leaks
  // only toward a side that came out colder in the first pass. A door to a
  // room that is just as warm loses nothing - and a lit stove in a room that
  // stays freezing does not count as warmth.
  const first = pass(() => () => true)
  const temps = pass((room) => (c, r) => {
    const mine = first.get(room.id) ?? H.outside
    for (const [dc, dr] of ADJ) {
      const other = state.roomAt(c + dc, r + dr)
      if (other < 0 || other === room.id) continue
      if ((first.get(other) ?? H.outside) < mine) return true
    }
    return false
  })
  return { temps, stoves }
}

/** Temperature where a person stands (outside when not in a room). */
export function tempAt(state: GameState, temps: RoomTemps, c: number, r: number): number {
  const id = state.roomAt(Math.round(c), Math.round(r))
  if (id < 0) return H.outside
  return temps.temps.get(id) ?? H.outside
}

/** Room of the beds - what the HUD shows as "the base" temperature. */
export function bedroomTemp(state: GameState, temps: RoomTemps): number {
  const bed = state.beds[0]
  if (!bed) return H.outside
  for (const [dc, dr] of ADJ) {
    const id = state.roomAt(bed.c + dc, bed.r + dr)
    if (id >= 0 && state.rooms().rooms[id]!.indoor) return temps.temps.get(id) ?? H.outside
  }
  return H.outside
}

/** Cold bites the sleeping and the idle; the working keep warm by moving. */
export function applyCold(state: GameState, temps: RoomTemps): void {
  for (const p of state.people) {
    if (p.health <= 0) continue
    const resting = p.sleeping || (p.job === null && !p.isMoving)
    if (!resting) continue
    const t = tempAt(state, temps, p.pos.c, p.pos.r)
    if (t >= H.minTemp) continue
    p.health = Math.max(0, p.health - ((H.minTemp - t) * H.coldHealthPerDegreeDay * STEP_MIN) / 1440)
  }
}
