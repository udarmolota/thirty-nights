/**
 * Camera in tile-space: (x, y) is the world point (in tile units, float)
 * shown at the viewport centre. Rendering and input convert through it.
 */
export const TILE_PX = 16 // base tile size in CSS px at zoom 1 (tiles are small here)

const ZOOM_MIN = 0.5
const ZOOM_MAX = 4
const OVERSCROLL_TILES = 2

export class Camera {
  x: number
  y: number
  zoom = 1
  viewW = 1 // viewport size in CSS px
  viewH = 1

  constructor(
    readonly mapW: number,
    readonly mapH: number,
  ) {
    this.x = mapW / 2
    this.y = mapH / 2
  }

  /** Current tile size on screen, CSS px. */
  get ts(): number {
    return TILE_PX * this.zoom
  }

  setViewport(w: number, h: number): void {
    this.viewW = w
    this.viewH = h
    this.clamp()
  }

  screenToWorld(px: number, py: number): { c: number; r: number } {
    return {
      c: this.x + (px - this.viewW / 2) / this.ts,
      r: this.y + (py - this.viewH / 2) / this.ts,
    }
  }

  /** Screen position (CSS px) of a tile's top-left corner. */
  worldToScreen(c: number, r: number): { x: number; y: number } {
    return {
      x: this.viewW / 2 + (c - this.x) * this.ts,
      y: this.viewH / 2 + (r - this.y) * this.ts,
    }
  }

  panBy(dxPx: number, dyPx: number): void {
    this.x -= dxPx / this.ts
    this.y -= dyPx / this.ts
    this.clamp()
  }

  /** Zoom by factor keeping the world point under (px, py) fixed on screen. */
  zoomAt(factor: number, px: number, py: number): void {
    const anchor = this.screenToWorld(px, py)
    this.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, this.zoom * factor))
    this.x = anchor.c - (px - this.viewW / 2) / this.ts
    this.y = anchor.r - (py - this.viewH / 2) / this.ts
    this.clamp()
  }

  private clamp(): void {
    const halfW = this.viewW / this.ts / 2
    const halfH = this.viewH / this.ts / 2
    this.x = clampAxis(this.x, halfW, this.mapW)
    this.y = clampAxis(this.y, halfH, this.mapH)
  }
}

function clampAxis(v: number, half: number, mapSize: number): number {
  if (mapSize <= (half - OVERSCROLL_TILES) * 2) return mapSize / 2
  return Math.min(mapSize - half + OVERSCROLL_TILES, Math.max(half - OVERSCROLL_TILES, v))
}
