/**
 * Sections: the unit of defence. A fence section is a run of tiles along the
 * perimeter, a wall section a run of the building's outer wall; windows are
 * their own one-tile sections. A section has a state, hit points and a
 * reinforcement buffer, and it writes its state back into the grid as tile
 * structures so movement, rooms and rendering all read one truth.
 */
import { StructureType, type TileGrid } from '../world'
import type { Cell } from '../world/path'
import balance from '../data/balance.json'

export type SectionKind = 'fence' | 'wall' | 'window'
export type SectionState = 'intact' | 'damaged' | 'hole' | 'reinforced' | 'missing'
export type SectionOp = 'repair' | 'reinforce' | 'build' | 'board'

export interface Section {
  id: number
  kind: SectionKind
  tiles: Cell[]
  /** Along which axis the run lies (for the sprite). */
  orientation: 'h' | 'v'
  state: SectionState
  hp: number
  buffer: number
  /** Work in progress on this section: which operation and minutes done. */
  op: SectionOp | null
  progress: number
  /** The tile just inside this wall/window; the room behind it is looked up
   *  from here whenever needed, so rebuilt perimeters never leave stale ids
   *  (null for fence sections). */
  inside: Cell | null
  /** A window that has been boarded up (window sections only). */
  boarded: boolean
}

const S = balance.sections

export function maxHp(section: Section): number {
  if (section.kind === 'window') return section.boarded ? S.hp : S.windowHp
  return S.hp
}

export function makeSection(
  id: number,
  kind: SectionKind,
  tiles: Cell[],
  orientation: 'h' | 'v',
  state: SectionState = 'intact',
): Section {
  const section: Section = { id, kind, tiles, orientation, state, hp: 0, buffer: 0, op: null, progress: 0, inside: null, boarded: false }
  section.hp = state === 'hole' || state === 'missing' ? 0 : maxHp(section)
  if (state === 'reinforced') section.buffer = S.reinforceBuffer
  return section
}

/** Which structure the section's tiles should carry in the current state. */
export function tileStructure(section: Section): StructureType {
  const open = section.state === 'hole' || section.state === 'missing'
  switch (section.kind) {
    case 'fence':
      return open ? StructureType.FenceHole : StructureType.Fence
    case 'wall':
      return open ? StructureType.WallHole : StructureType.LogWall
    case 'window':
      if (open) return StructureType.WallHole
      return section.boarded ? StructureType.BoardedWindow : StructureType.Window
  }
}

export function applyToGrid(grid: TileGrid, section: Section): void {
  const type = tileStructure(section)
  for (const t of section.tiles) {
    if (grid.structureAt(t.c, t.r) !== type) grid.setStructure(t.c, t.r, type)
  }
}

/** Is there an opening enemies can walk through? */
export function isOpen(section: Section): boolean {
  return section.state === 'hole' || section.state === 'missing'
}

/** Effective strength for target picking: buffer soaks first. */
export function strength(section: Section): number {
  return section.hp + section.buffer
}

/**
 * Night damage: the buffer soaks first, then hit points. Returns true when
 * the section just became a hole this call.
 */
export function damage(section: Section, amount: number): boolean {
  if (isOpen(section)) return false
  const soaked = Math.min(section.buffer, amount)
  section.buffer -= soaked
  amount -= soaked
  if (amount <= 0) {
    if (section.buffer <= 0 && section.state === 'reinforced') section.state = 'intact'
    return false
  }
  section.hp = Math.max(0, section.hp - amount)
  if (section.hp <= 0) {
    section.state = 'hole'
    section.buffer = 0
    section.op = null
    section.progress = 0
    return true
  }
  if (section.hp < S.damagedBelow) section.state = 'damaged'
  return false
}

/** Cost of an operation in boards and work minutes. */
export function opCost(op: SectionOp): { boards: number; minutes: number } {
  const c = op === 'repair' ? S.repair : op === 'reinforce' ? S.reinforce : op === 'build' ? S.build : S.boardWindow
  return { boards: c.boards, minutes: c.hours * 60 }
}

/** Which operations make sense right now, in the order the UI shows them. */
export function availableOps(section: Section): SectionOp[] {
  if (section.state === 'missing') return ['build']
  if (section.state === 'hole') return ['repair']
  const ops: SectionOp[] = []
  if (section.state === 'damaged') ops.push('repair')
  if (section.kind === 'window' && !section.boarded) ops.push('board')
  if (section.buffer < S.reinforceBuffer) ops.push('reinforce')
  return ops
}

/** Finish the operation in progress: the section changes state. */
export function completeOp(section: Section): void {
  switch (section.op) {
    case 'repair':
    case 'build':
      section.hp = maxHp(section)
      section.state = section.buffer > 0 ? 'reinforced' : 'intact'
      break
    case 'reinforce':
      section.buffer = S.reinforceBuffer
      if (section.hp >= S.damagedBelow) section.state = 'reinforced'
      break
    case 'board':
      section.boarded = true
      section.hp = maxHp(section)
      section.state = section.buffer > 0 ? 'reinforced' : 'intact'
      break
  }
  section.op = null
  section.progress = 0
}
