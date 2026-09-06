/**
 * Touch/mouse input.
 * - one-finger drag pans, two-finger pinch zooms (and pans with the midpoint)
 * - wheel zooms at the cursor
 * - SHORT tap  -> onTap   (inspect / select / deselect)
 * - LONG press (mobile) or RIGHT click (desktop) -> onOrder (issue commands)
 * The split keeps accidental taps from sending colonists across the map.
 */
import { Camera } from '../render/camera'

const TAP_MAX_DRIFT_PX = 8
const LONG_PRESS_MS = 450

interface PointerState {
  x: number
  y: number
}

export interface TileRect {
  c0: number
  r0: number
  c1: number
  r1: number
}

/** Optional designation-tool hooks: while a tool is active, a one-finger drag
 *  paints a tile rectangle instead of panning (two fingers still pan/zoom). */
export interface ToolHooks {
  isToolActive: () => boolean
  onToolPreview: (rect: TileRect | null) => void
  onToolCommit: (rect: TileRect) => void
}

export class InputController {
  private readonly pointers = new Map<number, PointerState>()
  private totalDrift = 0
  private everMultiTouch = false
  private prevPinchDist = 0
  private prevMid = { x: 0, y: 0 }
  private longPressTimer: number | null = null
  private longPressFired = false
  private toolStart: { c: number; r: number } | null = null

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: Camera,
    /** Short tap: integer tile coords + precise float world coords. */
    private readonly onTap: (c: number, r: number, fc: number, fr: number) => void,
    /** Deliberate order gesture: long press (touch) or right click (mouse). */
    private readonly onOrder: (c: number, r: number, fc: number, fr: number) => void,
    private readonly tool: ToolHooks | null = null,
  ) {
    canvas.addEventListener('pointerdown', this.onDown)
    canvas.addEventListener('pointermove', this.onMove)
    canvas.addEventListener('pointerup', this.onUp)
    canvas.addEventListener('pointercancel', this.onUp)
    canvas.addEventListener('wheel', this.onWheel, { passive: false })
    canvas.addEventListener('contextmenu', (e) => e.preventDefault())
  }

  private pos(e: PointerEvent): PointerState {
    const rect = this.canvas.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  private emitAt(p: PointerState, cb: (c: number, r: number, fc: number, fr: number) => void): void {
    const w = this.camera.screenToWorld(p.x, p.y)
    cb(Math.floor(w.c), Math.floor(w.r), w.c, w.r)
  }

  private cancelLongPress(): void {
    if (this.longPressTimer !== null) {
      clearTimeout(this.longPressTimer)
      this.longPressTimer = null
    }
  }

  private tileAt(p: PointerState): { c: number; r: number } {
    const w = this.camera.screenToWorld(p.x, p.y)
    return { c: Math.floor(w.c), r: Math.floor(w.r) }
  }

  private toolRect(p: PointerState): TileRect {
    const cur = this.tileAt(p)
    return { c0: this.toolStart!.c, r0: this.toolStart!.r, c1: cur.c, r1: cur.r }
  }

  private readonly onDown = (e: PointerEvent): void => {
    // Desktop right-click = immediate order; it never pans or taps.
    if (e.button === 2) {
      this.emitAt(this.pos(e), this.onOrder)
      return
    }
    this.canvas.setPointerCapture(e.pointerId)
    this.pointers.set(e.pointerId, this.pos(e))
    if (this.pointers.size === 1) {
      this.totalDrift = 0
      this.everMultiTouch = false
      this.longPressFired = false
      this.cancelLongPress()
      if (this.tool?.isToolActive()) {
        // Tool mode: this finger draws a designation rectangle.
        const p = this.pos(e)
        this.toolStart = this.tileAt(p)
        this.tool.onToolPreview(this.toolRect(p))
        return
      }
      this.longPressTimer = window.setTimeout(() => {
        this.longPressTimer = null
        // Still a calm single-finger hold? Then it's an order gesture.
        if (this.pointers.size === 1 && !this.everMultiTouch && this.totalDrift <= TAP_MAX_DRIFT_PX) {
          this.longPressFired = true
          const p = [...this.pointers.values()][0]!
          this.emitAt(p, this.onOrder)
        }
      }, LONG_PRESS_MS)
    } else {
      this.everMultiTouch = true
      this.cancelLongPress()
      if (this.toolStart) {
        // Second finger cancels the rect and switches to pan/zoom.
        this.toolStart = null
        this.tool?.onToolPreview(null)
      }
      this.initPinch()
    }
  }

  private readonly onMove = (e: PointerEvent): void => {
    const prev = this.pointers.get(e.pointerId)
    if (!prev) return
    const cur = this.pos(e)

    if (this.pointers.size === 1) {
      const dx = cur.x - prev.x
      const dy = cur.y - prev.y
      this.totalDrift += Math.abs(dx) + Math.abs(dy)
      if (this.toolStart) {
        this.pointers.set(e.pointerId, cur)
        this.tool?.onToolPreview(this.toolRect(cur))
        return
      }
      if (this.totalDrift > TAP_MAX_DRIFT_PX) {
        this.cancelLongPress()
        if (!this.longPressFired) this.camera.panBy(dx, dy)
      }
      this.pointers.set(e.pointerId, cur)
      return
    }

    this.pointers.set(e.pointerId, cur)
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()]
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y)
      const mid = { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 }
      if (this.prevPinchDist > 0) {
        this.camera.zoomAt(dist / this.prevPinchDist, mid.x, mid.y)
        this.camera.panBy(mid.x - this.prevMid.x, mid.y - this.prevMid.y)
      }
      this.prevPinchDist = dist
      this.prevMid = mid
    }
  }

  private readonly onUp = (e: PointerEvent): void => {
    const last = this.pointers.get(e.pointerId)
    this.pointers.delete(e.pointerId)
    this.prevPinchDist = 0
    this.cancelLongPress()

    if (this.toolStart && last && this.pointers.size === 0) {
      const rect = this.toolRect(last)
      this.toolStart = null
      this.tool?.onToolPreview(null)
      this.tool?.onToolCommit(rect)
      return
    }

    const isTap =
      this.pointers.size === 0 &&
      !this.everMultiTouch &&
      !this.longPressFired &&
      this.totalDrift <= TAP_MAX_DRIFT_PX &&
      last
    if (isTap) this.emitAt(last, this.onTap)
    if (this.pointers.size === 0) this.longPressFired = false
  }

  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault()
    this.cancelLongPress()
    const rect = this.canvas.getBoundingClientRect()
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
    this.camera.zoomAt(factor, e.clientX - rect.left, e.clientY - rect.top)
  }

  private initPinch(): void {
    if (this.pointers.size !== 2) return
    const [a, b] = [...this.pointers.values()]
    this.prevPinchDist = Math.hypot(a!.x - b!.x, a!.y - b!.y)
    this.prevMid = { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 }
  }
}
