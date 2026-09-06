import { describe, expect, it } from 'vitest'
import { buildBase, MAP_H, MAP_W } from '../src/sim/base'
import { bedroomTemp, computeTemps, stoveRoom } from '../src/sim/heat'
import { GameState } from '../src/sim/state'
import { applyToGrid, completeOp, isOpen } from '../src/sim/sections'
import { findPath } from '../src/world'

function fresh(): GameState {
  const state = new GameState(1, MAP_W, MAP_H)
  buildBase(state)
  return state
}

describe('the base', () => {
  it('has three indoor rooms, a yard and stoves that warm real rooms', () => {
    const state = fresh()
    const rooms = state.rooms().rooms
    expect(rooms.filter((r) => r.indoor)).toHaveLength(3)
    expect(state.yardRoomId).toBeGreaterThanOrEqual(0)
    expect(rooms[state.yardRoomId]!.indoor).toBe(false)
    for (let i = 0; i < state.stoves.length; i++) {
      const id = stoveRoom(state, i)
      expect(id).toBeGreaterThanOrEqual(0)
      expect(rooms[id]!.indoor).toBe(true)
    }
  })

  it('starts with holes and missing fence sections, walls know their room', () => {
    const state = fresh()
    const fences = state.sections.filter((s) => s.kind === 'fence')
    expect(fences.filter((s) => s.state === 'missing')).toHaveLength(4)
    expect(fences.filter((s) => s.state === 'hole')).toHaveLength(2)
    const walls = state.sections.filter((s) => s.kind !== 'fence')
    expect(walls.length).toBeGreaterThan(8)
    expect(walls.every((s) => s.inside !== null && state.roomBehind(s) >= 0)).toBe(true)
    expect(state.sections.filter((s) => s.kind === 'window')).toHaveLength(4)
  })

  it('people live beside their beds and can reach the sawhorse and the gate', () => {
    const state = fresh()
    expect(state.people).toHaveLength(2)
    for (const p of state.people) {
      expect(state.grid.isWalkable(p.home.c, p.home.r)).toBe(true)
      expect(findPath(state.grid, p.home.c, p.home.r, state.sawhorse.c, state.sawhorse.r)).not.toBeNull()
      expect(findPath(state.grid, p.home.c, p.home.r, state.gateOutside.c, state.gateOutside.r)).not.toBeNull()
    }
  })

  it('room lookups survive sealing the fence (region ids get renumbered)', () => {
    const state = fresh()
    const outside = state.roomAt(0, 0)
    // With holes in the fence the yard and the outside are one region.
    expect(state.yardRoomId).toBe(outside)
    const hallWall = state.sections.find((s) => s.kind === 'wall')!
    const hallRoomBefore = state.roomBehind(hallWall)
    for (const s of state.sections) {
      if (s.kind === 'fence' && isOpen(s)) {
        s.op = s.state === 'missing' ? 'build' : 'repair'
        completeOp(s)
        applyToGrid(state.grid, s)
      }
    }
    // Now the yard is its own region, numbered after the outside...
    expect(state.yardRoomId).not.toBe(state.roomAt(0, 0))
    expect(state.rooms().rooms[state.yardRoomId]!.enclosed).toBe(true)
    expect(state.rooms().rooms[state.yardRoomId]!.indoor).toBe(false)
    // ...and the walls still resolve to indoor rooms even though every id moved.
    expect(state.roomBehind(hallWall)).not.toBe(hallRoomBefore)
    expect(state.rooms().rooms[state.roomBehind(hallWall)]!.indoor).toBe(true)
    for (const s of state.sections) if (s.kind !== 'fence') expect(state.roomBehind(s)).toBeGreaterThanOrEqual(0)
  })

  it('a door leaks by actual temperatures: a freezing hall with a lit stove is still cold', () => {
    const state = fresh()
    const office = bedroomTemp(state, computeTemps(state))
    state.stoves[0]!.lit = true // the hall stove: the hall stays at -22, so the office gains nothing
    expect(bedroomTemp(state, computeTemps(state))).toBe(office)
    state.stoves[0]!.lit = false
    state.stoves[2]!.lit = true // the storeroom warms up above the office: that door stops leaking
    expect(bedroomTemp(state, computeTemps(state))).toBe(office + 1)
  })

  it('an unheated room is as cold as outside, never colder', () => {
    const state = fresh()
    for (const s of state.stoves) s.lit = false
    const temps = computeTemps(state)
    for (const room of state.rooms().rooms) {
      if (room.indoor) expect(temps.temps.get(room.id)).toBe(-22)
    }
  })

  it('the lit office stove keeps the bedroom far warmer than the cold hall', () => {
    const state = fresh()
    const temps = computeTemps(state)
    const bedroom = bedroomTemp(state, temps)
    expect(bedroom).toBeGreaterThan(-6)
    expect(bedroom).toBeLessThanOrEqual(2)
    const hallRoom = stoveRoom(state, 0)
    expect(temps.temps.get(hallRoom)!).toBeLessThan(bedroom - 10)
    // Light the hall stove: the hall is big and full of windows, so one stove
    // barely (or not at all) lifts it above the outside - that is the point:
    // partition it or leave it cold.
    state.stoves[0]!.lit = true
    const warmer = computeTemps(state)
    expect(warmer.temps.get(hallRoom)!).toBeGreaterThanOrEqual(temps.temps.get(hallRoom)!)
    expect(warmer.temps.get(hallRoom)!).toBeLessThan(-10)
  })
})
