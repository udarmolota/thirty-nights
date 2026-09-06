/**
 * Room detection: flood fill over open tiles. Walls, openings and furniture
 * bound the fill (wallLike or doorLike). A region is a ROOM when it is made
 * of floor and never touches the map edge; the yard and the outside are
 * regions too, just not indoor ones.
 * Each room also records the boundary tiles around it, so the heat model can
 * sum what leaks through windows, doors and holes.
 */
import { structureDef } from './structures'
import { Terrain, type TileGrid } from './grid'

export interface Room {
  id: number
  /** Open tiles inside (furniture excluded). */
  tiles: number
  enclosed: boolean
  /** Floor under (most of) it: a real room, not the yard. */
  indoor: boolean
  /** Tile indices of the walls/openings/furniture around it (unique). */
  boundary: number[]
}

export interface RoomData {
  /** Region id per tile; -1 = boundary tile (wall, opening, furniture). */
  roomIdByTile: Int32Array
  rooms: Room[]
}

function isBoundary(grid: TileGrid, c: number, r: number): boolean {
  const def = structureDef(grid.structureAt(c, r))
  return def !== null && (def.wallLike || def.doorLike)
}

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const

export function computeRooms(grid: TileGrid): RoomData {
  const n = grid.w * grid.h
  const roomIdByTile = new Int32Array(n).fill(-1)
  const rooms: Room[] = []
  const queue: number[] = []

  for (let start = 0; start < n; start++) {
    if (roomIdByTile[start] !== -1) continue
    const sc = start % grid.w
    const sr = (start - sc) / grid.w
    if (isBoundary(grid, sc, sr)) continue

    const id = rooms.length
    let tiles = 0
    let floorTiles = 0
    let touchesEdge = false
    const boundary = new Set<number>()
    roomIdByTile[start] = id
    queue.length = 0
    queue.push(start)
    while (queue.length > 0) {
      const cur = queue.pop()!
      const c = cur % grid.w
      const r = (cur - c) / grid.w
      tiles++
      if (grid.terrainAt(c, r) === Terrain.Floor) floorTiles++
      if (c === 0 || r === 0 || c === grid.w - 1 || r === grid.h - 1) touchesEdge = true
      for (const [dc, dr] of DIRS) {
        const nc = c + dc
        const nr = r + dr
        if (!grid.inBounds(nc, nr)) continue
        const nIdx = nr * grid.w + nc
        if (isBoundary(grid, nc, nr)) {
          boundary.add(nIdx)
          continue
        }
        if (roomIdByTile[nIdx] !== -1) continue
        roomIdByTile[nIdx] = id
        queue.push(nIdx)
      }
    }
    rooms.push({
      id,
      tiles,
      enclosed: !touchesEdge,
      indoor: !touchesEdge && floorTiles * 2 >= tiles,
      boundary: [...boundary],
    })
  }
  return { roomIdByTile, rooms }
}
