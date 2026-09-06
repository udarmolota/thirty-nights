/**
 * Everything that can stand on a tile: walls, openings, fence, furniture.
 * Two flags drive the whole world model:
 *   wallLike  - blocks movement AND bounds rooms (walls, fence, furniture);
 *   doorLike  - bounds rooms but lets people through (doors, gate, wall holes).
 * `leak` is the heat lost through this tile when it borders a heated room.
 */
export enum StructureType {
  None = 0,
  LogWall = 1,
  WallHole = 2,
  Window = 3,
  BoardedWindow = 4,
  Partition = 5,
  Door = 6,
  Fence = 7,
  FenceHole = 8,
  Gate = 9,
  Stove = 10,
  Bed = 11,
  Sawhorse = 12,
  Woodpile = 13,
  Storage = 14,
}

export interface StructureDef {
  key: string
  wallLike: boolean
  doorLike: boolean
  speedFactor: number
  /** Heat lost per tile when this bounds a heated room (0 for solid wall). */
  leak: number
  /** Occupies two tiles (anchor + extension), placed with an orientation. */
  long?: boolean
  /** Furniture is drawn by sprites/overlays and can be rearranged. */
  furniture?: boolean
}

const wall = (key: string, leak = 0): StructureDef => ({ key, wallLike: true, doorLike: false, speedFactor: 1, leak })
const opening = (key: string, leak: number, speed = 0.8): StructureDef => ({
  key,
  wallLike: false,
  doorLike: true,
  speedFactor: speed,
  leak,
})
const furniture = (key: string, long = false): StructureDef => ({
  key,
  wallLike: true,
  doorLike: false,
  speedFactor: 1,
  leak: 0,
  long,
  furniture: true,
})

export const STRUCTURE_DEFS: Record<Exclude<StructureType, StructureType.None>, StructureDef> = {
  [StructureType.LogWall]: wall('logWall'),
  [StructureType.WallHole]: opening('wallHole', 4, 0.7),
  [StructureType.Window]: wall('window', 2),
  [StructureType.BoardedWindow]: wall('boardedWindow', 1),
  [StructureType.Partition]: wall('partition'),
  [StructureType.Door]: opening('door', 1),
  [StructureType.Fence]: wall('fence'),
  [StructureType.FenceHole]: { key: 'fenceHole', wallLike: false, doorLike: false, speedFactor: 0.7, leak: 0 },
  [StructureType.Gate]: opening('gate', 0),
  [StructureType.Stove]: furniture('stove'),
  [StructureType.Bed]: furniture('bed', true),
  [StructureType.Sawhorse]: furniture('sawhorse', true),
  [StructureType.Woodpile]: furniture('woodpile', true),
  [StructureType.Storage]: furniture('storage'),
}

export function structureDef(type: StructureType): StructureDef | null {
  return type === StructureType.None ? null : STRUCTURE_DEFS[type]
}
