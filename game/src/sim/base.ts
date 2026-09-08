/**
 * The fixed map: a fenced compound in a spruce forest with one irregular
 * building - a big workshop hall with a row of windows, and an annex below
 * it holding the office (beds) and the storeroom. Nothing here is generated
 * except the forest edge; the layout is the level.
 */
import { StructureType, Terrain, type Cell } from '../world'
import { Person } from './person'
import { applyToGrid, makeSection, type Section, type SectionState } from './sections'
import { GameState } from './state'
import balance from '../data/balance.json'
import { buildVillage } from './village'

export const MAP_W = 64
export const MAP_H = 44

/** Fence rectangle (inclusive tile coords of the fence line itself). The yard is at least four tiles wide on every side of the building. */
export const FENCE = { x0: 10, y0: 6, x1: 53, y1: 37 }
/** The gate: three fence tiles on the east side. */
export const GATE = { c: 53, r0: 18, r1: 20 }

/** Building outline: the hall on top, the annex hanging below its left part. */
export const HALL = { x0: 22, y0: 11, x1: 43, y1: 24 } // walls inclusive
export const ANNEX = { x0: 22, y0: 24, x1: 39, y1: 32 } // shares the hall's south wall

interface Layout {
  windows: Cell[][] // each window = its run of tiles
  doors: Cell[]
  stoves: Array<{ c: number; r: number; front: Cell }>
  beds: Array<{ c: number; r: number; vertical: boolean }>
  sawhorse: Cell
  woodpile: Cell
  storage: Cell[]
  partition: Cell[]
  hallDoor: Cell
}

const LAYOUT: Layout = {
  windows: [
    [{ c: 26, r: 11 }, { c: 27, r: 11 }],
    [{ c: 31, r: 11 }, { c: 32, r: 11 }],
    [{ c: 36, r: 11 }, { c: 37, r: 11 }],
    [{ c: 22, r: 28 }, { c: 22, r: 29 }],
  ],
  doors: [
    { c: 27, r: 24 }, // hall <-> office
    { c: 35, r: 24 }, // hall <-> storeroom
  ],
  hallDoor: { c: 43, r: 18 },
  // Stoves stand in the middle of their rooms (they look right there and the
  // heat reads as even); the hall gets two. Index 1 is the office stove, lit
  // from the start - the code relies on that order.
  stoves: [
    { c: 29, r: 17, front: { c: 29, r: 18 } }, // hall, west half
    { c: 26, r: 28, front: { c: 26, r: 29 } }, // office, between the beds
    { c: 35, r: 28, front: { c: 35, r: 29 } }, // storeroom, middle
    { c: 37, r: 17, front: { c: 37, r: 18 } }, // hall, east half
  ],
  beds: [
    { c: 24, r: 27, vertical: true },
    { c: 28, r: 27, vertical: true },
  ],
  sawhorse: { c: 28, r: 20 },
  woodpile: { c: 37, r: 20 },
  storage: [{ c: 33, r: 27 }, { c: 35, r: 27 }, { c: 33, r: 30 }],
  partition: [], // the player builds these
}

function rect(x0: number, y0: number, x1: number, y1: number, cb: (c: number, r: number, edge: boolean) => void): void {
  for (let r = y0; r <= y1; r++) {
    for (let c = x0; c <= x1; c++) {
      cb(c, r, c === x0 || c === x1 || r === y0 || r === y1)
    }
  }
}

/** Split a straight run of tiles into sections of 5 or 6. */
function chunk(run: Cell[], size = 5): Cell[][] {
  const out: Cell[][] = []
  let i = 0
  while (i < run.length) {
    const left = run.length - i
    const take = left % size === 0 ? size : left < size * 2 && left > size ? Math.ceil(left / 2) : size
    out.push(run.slice(i, i + take))
    i += take
  }
  return out
}

export function buildBase(state: GameState): void {
  const g = state.grid
  // --- forest ring with a ragged inner edge ---------------------------------
  // Trees keep their distance so the crowns touch but never pile up. Three
  // passes: the large spruces first (none within two cells of another tree),
  // then medium ones (no tree in the 8 cells around), then small ones as
  // undergrowth in whatever cells are left (no orthogonal neighbour).
  // Sizes 1..3 = small / medium / large.
  const hasTreeWithin = (c: number, r: number, d: number): boolean => {
    if (d === 0) {
      // Only the cell itself and its four orthogonal neighbours.
      for (const [dc, dr] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        if (g.inBounds(c + dc, r + dr) && g.treesAt(c + dc, r + dr) > 0) return true
      }
      return false
    }
    for (let rr = r - d; rr <= r + d; rr++) {
      for (let cc = c - d; cc <= c + d; cc++) {
        if (g.inBounds(cc, rr) && g.treesAt(cc, rr) > 0) return true
      }
    }
    return false
  }
  const forest: boolean[] = []
  for (let r = 0; r < MAP_H; r++) {
    for (let c = 0; c < MAP_W; c++) {
      const dx = Math.min(c - FENCE.x0, FENCE.x1 - c)
      const dy = Math.min(r - FENCE.y0, FENCE.y1 - r)
      const dist = Math.min(dx, dy) // negative outside the fence
      const gap = 3 + Math.floor(state.rng.next() * 3) // clear snow between fence and trees
      forest.push(dist < -gap)
    }
  }
  const plant = (chance: number, spacing: number, pickSize: () => number): void => {
    for (let r = 0; r < MAP_H; r++) {
      for (let c = 0; c < MAP_W; c++) {
        if (!forest[r * MAP_W + c] || state.rng.next() > chance) continue
        if (hasTreeWithin(c, r, spacing)) continue
        g.setTrees(c, r, pickSize())
      }
    }
  }
  plant(0.2, 2, () => 3)
  plant(0.9, 1, () => 2)
  plant(0.9, 0, () => 1)
  // Keep the road out of the gate clear.
  for (let c = GATE.c + 1; c < MAP_W; c++) {
    for (let r = GATE.r0 - 1; r <= GATE.r1 + 1; r++) g.setTrees(c, r, 0)
  }
  state.gateOutside = { c: GATE.c + 2, r: GATE.r0 + 1 }

  // --- building: floor, outer walls, windows, doors --------------------------
  const outer = new Set<number>()
  rect(HALL.x0, HALL.y0, HALL.x1, HALL.y1, (c, r, edge) => {
    g.setTerrain(c, r, Terrain.Floor)
    if (edge) outer.add(g.idx(c, r))
  })
  rect(ANNEX.x0, ANNEX.y0, ANNEX.x1, ANNEX.y1, (c, r, edge) => {
    g.setTerrain(c, r, Terrain.Floor)
    if (edge) outer.add(g.idx(c, r))
  })
  // The hall's south wall inside the annex span is interior: keep it as a
  // partition line with doors (rooms are divided, the roof is shared).
  for (let c = ANNEX.x0 + 1; c < ANNEX.x1; c++) outer.delete(g.idx(c, HALL.y1))
  for (const i of outer) g.structure[i] = StructureType.LogWall
  for (let c = ANNEX.x0 + 1; c < ANNEX.x1; c++) g.structure[g.idx(c, HALL.y1)] = StructureType.Partition
  // Office / storeroom divider inside the annex.
  for (let r = ANNEX.y0 + 1; r < ANNEX.y1; r++) g.structure[g.idx(31, r)] = StructureType.Partition
  for (const d of LAYOUT.doors) g.structure[g.idx(d.c, d.r)] = StructureType.Door
  g.structure[g.idx(31, 29)] = StructureType.Door // office <-> storeroom
  g.structure[g.idx(LAYOUT.hallDoor.c, LAYOUT.hallDoor.r)] = StructureType.Door
  for (const w of LAYOUT.windows) for (const t of w) g.structure[g.idx(t.c, t.r)] = StructureType.Window
  g.structureVersion++

  // --- furniture ---------------------------------------------------------------
  for (const s of LAYOUT.stoves) {
    g.placeStructure(s.c, s.r, StructureType.Stove)
    state.stoves.push({ c: s.c, r: s.r, lit: false, front: s.front })
  }
  state.stoves[1]!.lit = true // the office stove burns from the start
  for (const b of LAYOUT.beds) {
    g.placeStructure(b.c, b.r, StructureType.Bed, b.vertical)
    state.beds.push({ c: b.c, r: b.r })
  }
  g.placeStructure(LAYOUT.sawhorse.c, LAYOUT.sawhorse.r, StructureType.Sawhorse)
  g.placeStructure(LAYOUT.woodpile.c, LAYOUT.woodpile.r, StructureType.Woodpile)
  for (const s of LAYOUT.storage) g.placeStructure(s.c, s.r, StructureType.Storage)
  state.sawhorse = { c: LAYOUT.sawhorse.c, r: LAYOUT.sawhorse.r + 1 }

  // --- trodden paths (cosmetic) ------------------------------------------------
  for (let c = LAYOUT.hallDoor.c + 1; c < GATE.c; c++) g.setTerrain(c, GATE.r0 + 1, Terrain.Path)
  for (let c = GATE.c + 1; c < MAP_W; c++) g.setTerrain(c, GATE.r0 + 1, Terrain.Path)

  // --- fence sections ----------------------------------------------------------
  const sections: Section[] = []
  const addRun = (run: Cell[], orientation: 'h' | 'v'): void => {
    for (const tiles of chunk(run)) sections.push(makeSection(sections.length, 'fence', tiles, orientation))
  }
  const top: Cell[] = []
  const bottom: Cell[] = []
  for (let c = FENCE.x0; c <= FENCE.x1; c++) {
    top.push({ c, r: FENCE.y0 })
    bottom.push({ c, r: FENCE.y1 })
  }
  const left: Cell[] = []
  const rightA: Cell[] = []
  const rightB: Cell[] = []
  for (let r = FENCE.y0 + 1; r < FENCE.y1; r++) {
    left.push({ c: FENCE.x0, r })
    if (r < GATE.r0) rightA.push({ c: FENCE.x1, r })
    else if (r > GATE.r1) rightB.push({ c: FENCE.x1, r })
  }
  addRun(top, 'h')
  addRun(bottom, 'h')
  addRun(left, 'v')
  addRun(rightA, 'v')
  addRun(rightB, 'v')
  for (let r = GATE.r0; r <= GATE.r1; r++) g.structure[g.idx(GATE.c, r)] = StructureType.Gate

  // Starting damage: two holes and four never-built sections.
  const startState: Array<[number, SectionState]> = [
    [3, 'missing'],
    [5, 'missing'],
    [11, 'missing'],
    [14, 'missing'],
    [19, 'hole'],
    [24, 'hole'],
  ]
  for (const [id, st] of startState) {
    const s = sections[id]
    if (!s) continue
    s.state = st
    s.hp = 0
  }

  // --- wall and window sections ------------------------------------------------
  const isWindow = (c: number, r: number): boolean => LAYOUT.windows.some((w) => w.some((t) => t.c === c && t.r === r))
  const isDoorTile = (c: number, r: number): boolean => g.structureAt(c, r) === StructureType.Door
  const wallRun = (cells: Cell[], orientation: 'h' | 'v'): void => {
    let run: Cell[] = []
    const flush = (): void => {
      if (run.length > 0) {
        for (const tiles of chunk(run, 4)) sections.push(makeSection(sections.length, 'wall', tiles, orientation))
      }
      run = []
    }
    for (const t of cells) {
      if (isWindow(t.c, t.r) || isDoorTile(t.c, t.r)) {
        flush()
        continue
      }
      // Corners belong to no section (they are never targeted).
      const corner =
        (t.c === HALL.x0 || t.c === HALL.x1 || t.c === ANNEX.x1) && (t.r === HALL.y0 || t.r === HALL.y1 || t.r === ANNEX.y1)
      if (corner) {
        flush()
        continue
      }
      run.push(t)
    }
    flush()
  }
  const north: Cell[] = []
  for (let c = HALL.x0; c <= HALL.x1; c++) north.push({ c, r: HALL.y0 })
  const east: Cell[] = []
  for (let r = HALL.y0; r <= HALL.y1; r++) east.push({ c: HALL.x1, r })
  const hallSouthOutside: Cell[] = []
  for (let c = ANNEX.x1; c <= HALL.x1; c++) hallSouthOutside.push({ c, r: HALL.y1 })
  const annexEast: Cell[] = []
  for (let r = HALL.y1; r <= ANNEX.y1; r++) annexEast.push({ c: ANNEX.x1, r })
  const south: Cell[] = []
  for (let c = ANNEX.x0; c <= ANNEX.x1; c++) south.push({ c, r: ANNEX.y1 })
  const west: Cell[] = []
  for (let r = HALL.y0; r <= ANNEX.y1; r++) west.push({ c: HALL.x0, r })
  wallRun(north, 'h')
  wallRun(east, 'v')
  wallRun(hallSouthOutside, 'h')
  wallRun(annexEast, 'v')
  wallRun(south, 'h')
  wallRun(west, 'v')
  for (const w of LAYOUT.windows) sections.push(makeSection(sections.length, 'window', w, w.length > 1 && w[0]!.r === w[1]!.r ? 'h' : 'v'))

  state.sections = sections
  for (const s of sections) applyToGrid(g, s)

  // Rooms exist now: remember the tile just inside every wall/window, so the
  // room behind it can be found again after any rebuild.
  const rooms = state.rooms()
  for (const s of sections) {
    if (s.kind === 'fence') continue
    for (const t of s.tiles) {
      for (const [dc, dr] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const id = state.roomAt(t.c + dc, t.r + dr)
        if (id >= 0 && rooms.rooms[id]!.indoor) s.inside = { c: t.c + dc, r: t.r + dr }
      }
    }
  }
  state.yardAnchor = { c: GATE.c - 1, r: GATE.r0 + 1 }

  buildVillage(state)

  // --- people: at home beside their beds ---------------------------------------
  const budget = balance.calendar.workHoursPerDay * 60
  state.people = balance.people.map((def, i) => {
    const bed = LAYOUT.beds[i] ?? LAYOUT.beds[0]!
    return new Person(def, { c: bed.c + 1, r: bed.r }, budget)
  })
}
