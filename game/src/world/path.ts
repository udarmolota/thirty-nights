/**
 * A* pathfinding on the tile grid. 8-directional with a no-corner-cutting
 * rule (a diagonal step requires both orthogonal neighbours to be walkable).
 * Cost of entering a tile = 1 / speedFactor, diagonals x sqrt(2).
 * Fully deterministic: ties resolve by insertion order in a binary heap.
 */
import type { TileGrid } from './grid'

export interface Cell {
  c: number
  r: number
}

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
]

/** Simple binary min-heap keyed by f-score; payload is the tile index. */
class MinHeap {
  private f: number[] = []
  private idx: number[] = []

  get size(): number {
    return this.f.length
  }

  push(f: number, idx: number): void {
    this.f.push(f)
    this.idx.push(idx)
    let i = this.f.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (this.f[p]! <= this.f[i]!) break
      this.swap(i, p)
      i = p
    }
  }

  pop(): number {
    const top = this.idx[0]!
    const lastF = this.f.pop()!
    const lastI = this.idx.pop()!
    if (this.f.length > 0) {
      this.f[0] = lastF
      this.idx[0] = lastI
      let i = 0
      for (;;) {
        const l = i * 2 + 1
        const r = l + 1
        let m = i
        if (l < this.f.length && this.f[l]! < this.f[m]!) m = l
        if (r < this.f.length && this.f[r]! < this.f[m]!) m = r
        if (m === i) break
        this.swap(i, m)
        i = m
      }
    }
    return top
  }

  private swap(a: number, b: number): void {
    ;[this.f[a], this.f[b]] = [this.f[b]!, this.f[a]!]
    ;[this.idx[a], this.idx[b]] = [this.idx[b]!, this.idx[a]!]
  }
}

function octile(dc: number, dr: number): number {
  const ac = Math.abs(dc)
  const ar = Math.abs(dr)
  return Math.max(ac, ar) + (Math.SQRT2 - 1) * Math.min(ac, ar)
}

/**
 * Find a path from (fc,fr) to (tc,tr). Returns waypoints EXCLUDING the start
 * tile and INCLUDING the target, or null if unreachable. Empty array = already there.
 */
export function findPath(grid: TileGrid, fc: number, fr: number, tc: number, tr: number): Cell[] | null {
  if (!grid.inBounds(fc, fr) || !grid.isWalkable(tc, tr)) return null
  if (fc === tc && fr === tr) return []

  const w = grid.w
  const n = w * grid.h
  const g = new Float64Array(n).fill(Infinity)
  const came = new Int32Array(n).fill(-1)
  const closed = new Uint8Array(n)
  const heap = new MinHeap()

  const start = fr * w + fc
  const goal = tr * w + tc
  g[start] = 0
  heap.push(octile(tc - fc, tr - fr), start)

  while (heap.size > 0) {
    const cur = heap.pop()
    if (cur === goal) break
    if (closed[cur]) continue
    closed[cur] = 1
    const cc = cur % w
    const cr = (cur - cc) / w

    for (const [dc, dr] of DIRS) {
      const nc = cc + dc
      const nr = cr + dr
      if (!grid.isWalkable(nc, nr)) continue
      // No corner cutting: diagonal moves need both orthogonal tiles open.
      if (dc !== 0 && dr !== 0 && (!grid.isWalkable(cc + dc, cr) || !grid.isWalkable(cc, cr + dr))) continue
      const nIdx = nr * w + nc
      if (closed[nIdx]) continue
      const stepCost = (dc !== 0 && dr !== 0 ? Math.SQRT2 : 1) / grid.speedFactor(nc, nr)
      const ng = g[cur]! + stepCost
      if (ng < g[nIdx]!) {
        g[nIdx] = ng
        came[nIdx] = cur
        heap.push(ng + octile(tc - nc, tr - nr), nIdx)
      }
    }
  }

  if (came[goal] === -1) return null

  const path: Cell[] = []
  let node = goal
  while (node !== start) {
    path.push({ c: node % w, r: Math.floor(node / w) })
    node = came[node]!
  }
  path.reverse()
  return path
}
