/**
 * Tile grid: terrain layer + tree layer + structure layer.
 * Pure simulation data - no DOM, no rendering concerns.
 * Tiles are small (a person is larger than a tile); a fence section or a
 * wall segment is a run of several tiles managed by sim/sections.
 */
import { structureDef, StructureType } from './structures'

export enum Terrain {
  Snow = 0,
  /** Plank floor: the inside of the building. Rooms are made of floor. */
  Floor = 1,
  /** Trodden snow: a little faster to walk. */
  Path = 2,
}

export class TileGrid {
  readonly w: number
  readonly h: number
  readonly terrain: Uint8Array
  /** 0 = clear, 1..3 = a small / medium / large spruce (trees block movement; chopping clears them). */
  readonly trees: Uint8Array
  readonly structure: Uint8Array
  /** 2-tile furniture: 0 = normal, 1 = extension of the LEFT cell, 2 = of the cell ABOVE. */
  readonly ext: Uint8Array
  /** Bumped on structure or tree changes - rooms and paths recompute lazily. */
  structureVersion = 0

  constructor(w: number, h: number) {
    this.w = w
    this.h = h
    this.terrain = new Uint8Array(w * h)
    this.trees = new Uint8Array(w * h)
    this.structure = new Uint8Array(w * h)
    this.ext = new Uint8Array(w * h)
  }

  idx(c: number, r: number): number {
    return r * this.w + c
  }

  inBounds(c: number, r: number): boolean {
    return c >= 0 && r >= 0 && c < this.w && r < this.h
  }

  terrainAt(c: number, r: number): Terrain {
    return this.terrain[this.idx(c, r)] as Terrain
  }

  setTerrain(c: number, r: number, t: Terrain): void {
    this.terrain[this.idx(c, r)] = t
  }

  treesAt(c: number, r: number): number {
    return this.trees[this.idx(c, r)]!
  }

  setTrees(c: number, r: number, present: number): void {
    this.trees[this.idx(c, r)] = present
    this.structureVersion++
  }

  structureAt(c: number, r: number): StructureType {
    return this.structure[this.idx(c, r)] as StructureType
  }

  setStructure(c: number, r: number, type: StructureType): void {
    const i = this.idx(c, r)
    // Overwriting any half of a 2-tile piece dissolves the whole piece first.
    if (this.structure[i] !== StructureType.None) {
      const a = this.anchorOf(c, r)
      const extCell = this.extCellOf(a.c, a.r)
      if (extCell) {
        const e = this.idx(extCell.c, extCell.r)
        this.structure[e] = StructureType.None
        this.ext[e] = 0
      }
      if (a.c !== c || a.r !== r) this.structure[this.idx(a.c, a.r)] = StructureType.None
    }
    this.ext[i] = 0
    this.structure[i] = type
    this.structureVersion++
  }

  /** Place a structure honouring its footprint (2-tile pieces span two cells). */
  placeStructure(c: number, r: number, type: StructureType, vertical = false): void {
    this.setStructure(c, r, type)
    if (structureDef(type)?.long) {
      const ec = vertical ? c : c + 1
      const er = vertical ? r + 1 : r
      const e = this.idx(ec, er)
      this.structure[e] = type
      this.ext[e] = vertical ? 2 : 1
    }
  }

  isExtension(c: number, r: number): boolean {
    return this.ext[this.idx(c, r)] !== 0
  }

  anchorOf(c: number, r: number): { c: number; r: number } {
    const e = this.ext[this.idx(c, r)]
    if (e === 1) return { c: c - 1, r }
    if (e === 2) return { c, r: r - 1 }
    return { c, r }
  }

  extCellOf(c: number, r: number): { c: number; r: number } | null {
    if (this.inBounds(c + 1, r) && this.ext[this.idx(c + 1, r)] === 1) return { c: c + 1, r }
    if (this.inBounds(c, r + 1) && this.ext[this.idx(c, r + 1)] === 2) return { c, r: r + 1 }
    return null
  }

  isWalkable(c: number, r: number): boolean {
    if (!this.inBounds(c, r)) return false
    if (this.trees[this.idx(c, r)]! > 0) return false
    return !(structureDef(this.structureAt(c, r))?.wallLike ?? false)
  }

  /** Movement speed multiplier: floors and paths are quick, deep snow slow. */
  speedFactor(c: number, r: number): number {
    if (!this.inBounds(c, r)) return 1
    const def = structureDef(this.structureAt(c, r))
    if (def) return def.speedFactor
    const t = this.terrainAt(c, r)
    if (t === Terrain.Floor) return 1.1
    if (t === Terrain.Path) return 1
    return 0.85
  }
}
