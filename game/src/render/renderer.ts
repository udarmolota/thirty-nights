/**
 * Canvas renderer: a flat top-down base, read at a glance. Ground and
 * building are drawn procedurally in the same flat style as the sprites;
 * fence sections, people, stoves and trees are sprites. Light, night and
 * threat are overlays - nothing is baked into the art.
 */
import type { Camera } from './camera'
import { SPRITE_PX_PER_TILE, type SpriteName, type Sprites } from './sprites'
import { StructureType, structureDef, Terrain } from '../world'
import type { GameState, Stove } from '../sim/state'
import type { RoomTemps } from '../sim/heat'
import type { Section } from '../sim/sections'
import { darkness } from '../sim/time'
import { stoveRoom } from '../sim/heat'
import { GATE } from '../sim/base'
import balance from '../data/balance.json'

/** A full day's work budget in minutes, for the hours bar. */
const WORK_MIN = balance.calendar.workHoursPerDay * 60

export interface Selection {
  kind: 'person' | 'section' | 'stove' | 'tree' | 'sawhorse' | null
  id: number | string
}

const SNOW = '#dfe7f2' // fallback while the snow texture is loading
/** The snow textures are authored at this many pixels per tile (512 px = 16 tiles). */
const SNOW_PX_PER_TILE = 32
/** Night darkening of everything above the ground, at full darkness. */
const NIGHT_TINT = 0.45
/** Plank floors: 512 px = 4 tiles, so a plank is about half a tile wide and objects read against it. */
const FLOOR_PX_PER_TILE = 128
const SNOW_PATH = '#cfd9e8'
/** Trodden path over the snow texture: a translucent darkening, so the texture shows through. */
const PATH_TINT = 'rgba(96, 118, 148, 0.22)'
const FLOOR = '#6e5a44'
const FLOOR_LINE = '#5d4a36'
const WALL = '#5d3b20'
const WALL_TOP = '#8a5a32'
const PARTITION = '#c9a97a'
const OUTLINE = '#1b1d2e'
const WINDOW = '#7fb3d5'
const DOOR = '#a3865c'
const SELECT = '#ffe08a'
const DANGER = '#ff2f4f'

const FENCE_SPRITE: Record<Section['state'], SpriteName> = {
  intact: 'fence_intact',
  damaged: 'fence_damaged',
  hole: 'fence_broken',
  reinforced: 'fence_reinforced',
  missing: 'fence_broken',
}

/** A window section's sprite: boarded shows the planks, an open one the hole, anything else the glass. */
function windowSprite(section: Section): SpriteName {
  if (section.state === 'hole' || section.state === 'missing') return 'window_broken'
  return section.boarded ? 'window_boarded' : 'window_intact'
}

const WALL_SPRITE: Record<Section['state'], SpriteName> = {
  intact: 'wall_intact', damaged: 'wall_damaged', hole: 'wall_broken',
  reinforced: 'wall_reinforced', missing: 'wall_broken',
}

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D
  private dpr = 1
  /** Repeating snow patterns (day and night), built once from the sprites; 16x16 tiles per repeat. */
  private snowPattern: CanvasPattern | null = null
  private snowNightPattern: CanvasPattern | null = null
  /** Plank floors by room kind (1 hall, 2 office, 3 storeroom); 8x8 tiles per repeat. */
  private floorPatterns: Array<CanvasPattern | null> = [null, null, null, null]
  /** Floor kind per tile (0 = not a floor), rebuilt when the structures change. */
  private floorKind: Uint8Array | null = null
  private floorVersion = -1

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: Camera,
    private readonly sprites: Sprites,
  ) {
    this.ctx = canvas.getContext('2d')!
  }

  resize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1)
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    this.canvas.width = Math.round(w * this.dpr)
    this.canvas.height = Math.round(h * this.dpr)
    this.camera.setViewport(w, h)
  }

  render(state: GameState, temps: RoomTemps, alpha: number, sel: Selection, nowMs: number): void {
    const { ctx, camera } = this
    const ts = camera.ts
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.fillStyle = '#141a2e'
    ctx.fillRect(0, 0, camera.viewW, camera.viewH)

    const grid = state.grid
    const tl = camera.screenToWorld(0, 0)
    const br = camera.screenToWorld(camera.viewW, camera.viewH)
    const c0 = Math.max(0, Math.floor(tl.c) - 2)
    const r0 = Math.max(0, Math.floor(tl.r) - 2)
    const c1 = Math.min(grid.w - 1, Math.ceil(br.c) + 2)
    const r1 = Math.min(grid.h - 1, Math.ceil(br.r) + 2)
    const origin = camera.worldToScreen(0, 0)
    const sx = (c: number): number => origin.x + c * ts
    const sy = (r: number): number => origin.y + r * ts

    // --- ground ---------------------------------------------------------------
    // Two paintings of the same snow, day and night, cross-faded by darkness:
    // a painted night keeps the drifts readable where a flat tint would not.
    const dark = darkness(state.totalMinutes)
    const snowImg = this.sprites.get('snow')
    const nightImg = this.sprites.get('snow_night')
    if (snowImg && this.snowPattern === null) this.snowPattern = ctx.createPattern(snowImg, 'repeat')
    if (nightImg && this.snowNightPattern === null) this.snowNightPattern = ctx.createPattern(nightImg, 'repeat')
    // The textures are 32 px per tile: scale them with the camera and pin them
    // to the map origin so they scroll with the world.
    const snowTransform = new DOMMatrix().translate(origin.x, origin.y).scale(ts / SNOW_PX_PER_TILE)
    if (this.snowPattern) {
      this.snowPattern.setTransform(snowTransform)
      ctx.fillStyle = this.snowPattern
    } else {
      ctx.fillStyle = SNOW
    }
    ctx.fillRect(sx(0), sy(0), grid.w * ts, grid.h * ts)
    if (dark > 0 && this.snowNightPattern) {
      this.snowNightPattern.setTransform(snowTransform)
      ctx.globalAlpha = dark
      ctx.fillStyle = this.snowNightPattern
      ctx.fillRect(sx(0), sy(0), grid.w * ts, grid.h * ts)
      ctx.globalAlpha = 1
    }
    const rooms = state.rooms()
    const floorKind = this.floorKinds(state)
    const floorTransform = new DOMMatrix().translate(origin.x, origin.y).scale(ts / FLOOR_PX_PER_TILE)
    const FLOOR_SPRITES: SpriteName[] = ['floor_hall', 'floor_hall', 'floor_office', 'floor_store']
    for (let k = 1; k <= 3; k++) {
      const img = this.sprites.get(FLOOR_SPRITES[k]!)
      if (img && this.floorPatterns[k] === null) this.floorPatterns[k] = ctx.createPattern(img, 'repeat')
      this.floorPatterns[k]?.setTransform(floorTransform)
    }
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const t = grid.terrainAt(c, r)
        if (t === Terrain.Path) {
          ctx.fillStyle = this.snowPattern ? PATH_TINT : SNOW_PATH
          ctx.fillRect(sx(c), sy(r), ts + 0.5, ts + 0.5)
        } else if (t === Terrain.Floor) {
          const pattern = floorKind ? this.floorPatterns[floorKind[grid.idx(c, r)]!] : null
          if (pattern) {
            ctx.fillStyle = pattern
            ctx.fillRect(sx(c), sy(r), ts + 0.5, ts + 0.5)
          } else {
            ctx.fillStyle = FLOOR
            ctx.fillRect(sx(c), sy(r), ts + 0.5, ts + 0.5)
            if (ts >= 8) {
              ctx.fillStyle = FLOOR_LINE
              ctx.fillRect(sx(c), sy(r) + ts - 1, ts + 0.5, 1)
            }
          }
        }
      }
    }

    // --- heat tint per indoor room ---------------------------------------------
    if (ts >= 4) {
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const id = rooms.roomIdByTile[grid.idx(c, r)]!
          if (id < 0 || !rooms.rooms[id]!.indoor) continue
          const temp = temps.temps.get(id) ?? -22
          if (temp >= 0) {
            ctx.fillStyle = `rgba(255, 176, 58, ${Math.min(0.28, 0.08 + temp / 80)})`
          } else {
            ctx.fillStyle = `rgba(79, 134, 176, ${Math.min(0.3, -temp / 70)})`
          }
          ctx.fillRect(sx(c), sy(r), ts + 0.5, ts + 0.5)
        }
      }
    }

    // --- structures: walls, openings, furniture ----------------------------------
    // Do not paint a solid procedural wall underneath transparent sprite gaps.
    const spriteWallTiles = new Set<number>()
    for (const section of state.sections) {
      const sprite = section.kind === 'wall' ? WALL_SPRITE[section.state] : section.kind === 'window' ? windowSprite(section) : null
      if (!sprite || !this.sprites.get(sprite)) continue
      for (const tile of section.tiles) spriteWallTiles.add(grid.idx(tile.c, tile.r))
    }
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const s = grid.structureAt(c, r)
        if (s === StructureType.None || grid.isExtension(c, r)) continue
        if (spriteWallTiles.has(grid.idx(c, r))) continue
        this.drawStructure(state, s, c, r, sx(c), sy(r), ts, nowMs)
      }
    }

    // --- fence sections (sprites) -------------------------------------------------
    for (const section of state.sections) {
      if (section.kind === 'wall') this.drawWall(section, sx, sy, ts)
      if (section.kind === 'window') this.drawWindow(section, sx, sy, ts)
      if (section.kind !== 'fence') continue
      this.drawFence(section, sx, sy, ts)
    }
    // Gate planks.
    ctx.fillStyle = DOOR
    ctx.fillRect(sx(GATE.c) + ts * 0.3, sy(GATE.r0), ts * 0.4, (GATE.r1 - GATE.r0 + 1) * ts)
    ctx.strokeStyle = OUTLINE
    ctx.lineWidth = 1
    ctx.strokeRect(sx(GATE.c) + ts * 0.3, sy(GATE.r0), ts * 0.4, (GATE.r1 - GATE.r0 + 1) * ts)

    // --- trees ---------------------------------------------------------------------
    // Tree layer value 1..3 = small / medium / large spruce, each its own
    // sprite; three shapes and sizes break the "tiled texture" look of
    // identical sprites on a regular grid.
    // Drawn small to large so the big crowns lie on top; every tree is nudged
    // off the grid by a fixed hash of its cell so the edge does not read as rows.
    const TREE_SIZE = [0, 1.5, 2.2, 3.0]
    const TREE_SPRITE = [null, this.sprites.get('spruce_small'), this.sprites.get('spruce'), this.sprites.get('spruce_large')]
    const jitter = (c: number, r: number, salt: number): number => {
      const n = Math.sin(c * 127.1 + r * 311.7 + salt * 74.7) * 43758.5453
      return (n - Math.floor(n) - 0.5) * 0.5 // -0.25..0.25 tile
    }
    for (let pass = 1; pass <= 3; pass++) {
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const tree = grid.treesAt(c, r)
          if (tree !== pass) continue
          const cx = sx(c) + ts * (0.5 + jitter(c, r, 1))
          const cy = sy(r) + ts * (0.5 + jitter(c, r, 2))
          const spruce = TREE_SPRITE[tree] ?? this.sprites.get('spruce')
          if (spruce && ts >= 6) {
            const size = ts * (TREE_SIZE[tree] ?? 2.2)
            const h = (size * spruce.naturalHeight) / spruce.naturalWidth
            ctx.drawImage(spruce, cx - size / 2, cy - h / 2, size, h)
          } else {
            ctx.fillStyle = '#1f4030'
            ctx.beginPath()
            ctx.arc(cx, cy, ts * 0.35 * (TREE_SIZE[tree] ?? 2.2), 0, Math.PI * 2)
            ctx.fill()
          }
        }
      }
    }

    // --- selection ------------------------------------------------------------------
    this.drawSelection(state, sel, sx, sy, ts, nowMs)

    // --- people -----------------------------------------------------------------------
    for (const p of state.people) {
      if (p.health <= 0) continue
      const pc = p.prev.c + (p.pos.c - p.prev.c) * alpha
      const pr = p.prev.r + (p.pos.r - p.prev.r) * alpha
      const x = sx(pc) + ts / 2
      const y = sy(pr) + ts / 2
      const img = this.sprites.get(p.sprite as SpriteName)
      const size = ts * 1.6
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(p.heading - Math.PI / 2) // the sprites face down (+y) when unrotated
      if (img) this.withShadow(ts, () => ctx.drawImage(img, -size / 2, -size / 2, size, size))
      else {
        ctx.fillStyle = p.id === 'ivan' ? '#4f86b0' : '#3f7a5a'
        ctx.beginPath()
        ctx.arc(0, 0, size / 2.4, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
      // Over the head: health (green) and work hours left today (white).
      if (ts >= 6) {
        const bw = ts * 1.2
        const bh = Math.max(2, ts * 0.11)
        const bx = x - bw / 2
        const by = y - size * 0.62
        ctx.fillStyle = 'rgba(8, 10, 22, 0.6)'
        ctx.fillRect(bx - 1, by - 1, bw + 2, bh * 2 + 3)
        ctx.fillStyle = '#6fcf97'
        ctx.fillRect(bx, by, (bw * Math.max(0, p.health)) / 100, bh)
        ctx.fillStyle = '#e8eef7'
        ctx.fillRect(bx, by + bh + 1, bw * Math.max(0, Math.min(1, p.budgetMin / WORK_MIN)), bh)
      }
      if (p.wounded) {
        ctx.fillStyle = DANGER
        ctx.beginPath()
        ctx.arc(x + size * 0.4, y - size * 0.4, Math.max(3, ts * 0.22), 0, Math.PI * 2)
        ctx.fill()
      }
      // Progress bar while working on a section.
      if (p.job?.kind === 'section' && !p.isMoving) {
        const section = state.section(p.job.sectionId)
        if (section?.op) {
          const total = { repair: 120, reinforce: 90, build: 180, board: 60 }[section.op]
          const frac = Math.min(1, section.progress / total)
          const w = ts * 2
          ctx.fillStyle = OUTLINE
          ctx.fillRect(x - w / 2, y - size * 0.75 - 4, w, 4)
          ctx.fillStyle = '#ffb03a'
          ctx.fillRect(x - w / 2, y - size * 0.75 - 4, w * frac, 4)
        }
      }
    }

    // --- night and light ---------------------------------------------------------------
    // The ground already wears its night painting; this tint is for everything
    // standing on it, so it is lighter than a tint that had to darken the snow too.
    if (dark > 0) {
      ctx.fillStyle = `rgba(20, 26, 46, ${NIGHT_TINT * dark})`
      ctx.fillRect(sx(0), sy(0), grid.w * ts, grid.h * ts)
      for (const stove of state.stoves) {
        if (!stove.lit) continue
        const x = sx(stove.front.c) + ts / 2
        const y = sy(stove.front.r) + ts / 2
        const rad = ts * (5 + 0.3 * Math.sin(nowMs / 170))
        const g = ctx.createRadialGradient(x, y, 0, x, y, rad)
        g.addColorStop(0, `rgba(255, 176, 58, ${0.45 * dark})`)
        g.addColorStop(1, 'rgba(255, 176, 58, 0)')
        ctx.fillStyle = g
        ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2)
      }
    }

    // --- the threat: eyes in the dark ------------------------------------------------------
    this.drawThreat(state, sx, sy, ts, nowMs)
  }

  private drawStructure(state: GameState, s: StructureType, c: number, r: number, x: number, y: number, ts: number, nowMs: number): void {
    const { ctx } = this
    switch (s) {
      case StructureType.LogWall: {
        ctx.fillStyle = WALL
        ctx.fillRect(x, y, ts + 0.5, ts + 0.5)
        ctx.fillStyle = WALL_TOP
        ctx.fillRect(x + 1, y + 1, ts - 2, Math.max(1, ts * 0.3))
        return
      }
      case StructureType.Partition: {
        const img = this.sprites.get('partition')
        if (img) {
          // One tile of a four-tile plank strip; consecutive tiles take consecutive
          // quarters, so any run - including ones the player builds - reads as one wall.
          const g = state.grid
          const joins = (cc: number, rr: number): boolean => {
            if (!g.inBounds(cc, rr)) return false
            const d = structureDef(g.structureAt(cc, rr))
            return d !== null && (d.wallLike || d.doorLike)
          }
          const alongX = joins(c - 1, r) || joins(c + 1, r)
          const quarter = img.naturalWidth / 4
          const sxOff = ((alongX ? c : r) % 4) * quarter
          ctx.save()
          ctx.translate(x + ts / 2, y + ts / 2)
          if (!alongX) ctx.rotate(Math.PI / 2)
          ctx.drawImage(img, sxOff, 0, quarter, img.naturalHeight, -ts / 2, -ts / 2, ts + 0.5, ts + 0.5)
          ctx.restore()
          return
        }
        ctx.fillStyle = PARTITION
        ctx.fillRect(x, y, ts + 0.5, ts + 0.5)
        ctx.strokeStyle = WALL
        ctx.lineWidth = 1
        ctx.strokeRect(x + 0.5, y + 0.5, ts - 1, ts - 1)
        return
      }
      case StructureType.WallHole: {
        ctx.fillStyle = '#2a2f4a'
        ctx.fillRect(x, y, ts + 0.5, ts + 0.5)
        ctx.strokeStyle = DANGER
        ctx.lineWidth = Math.max(1, ts * 0.12)
        ctx.strokeRect(x + 1, y + 1, ts - 2, ts - 2)
        return
      }
      case StructureType.Window: {
        ctx.fillStyle = WALL
        ctx.fillRect(x, y, ts + 0.5, ts + 0.5)
        ctx.fillStyle = WINDOW
        ctx.fillRect(x + ts * 0.15, y + ts * 0.3, ts * 0.7, ts * 0.4)
        return
      }
      case StructureType.BoardedWindow: {
        ctx.fillStyle = WALL
        ctx.fillRect(x, y, ts + 0.5, ts + 0.5)
        ctx.strokeStyle = PARTITION
        ctx.lineWidth = Math.max(1, ts * 0.18)
        ctx.beginPath()
        ctx.moveTo(x + 2, y + 2)
        ctx.lineTo(x + ts - 2, y + ts - 2)
        ctx.moveTo(x + ts - 2, y + 2)
        ctx.lineTo(x + 2, y + ts - 2)
        ctx.stroke()
        return
      }
      case StructureType.Door: {
        const img = this.sprites.get('door')
        if (img) {
          // The leaf with its two posts, a little wider than the tile so the
          // posts overlap the wall ends; turned to lie along the wall.
          const g = state.grid
          const wallLike = (cc: number, rr: number): boolean => g.inBounds(cc, rr) && (structureDef(g.structureAt(cc, rr))?.wallLike ?? false)
          const alongX = wallLike(c - 1, r) || wallLike(c + 1, r)
          const width = ts * 1.5
          const height = (width * img.naturalHeight) / img.naturalWidth
          ctx.save()
          ctx.translate(x + ts / 2, y + ts / 2)
          if (!alongX) ctx.rotate(Math.PI / 2)
          ctx.drawImage(img, -width / 2, -height / 2, width, height)
          ctx.restore()
          return
        }
        ctx.fillStyle = DOOR
        ctx.fillRect(x, y, ts + 0.5, ts + 0.5)
        ctx.strokeStyle = WALL
        ctx.lineWidth = 1
        ctx.strokeRect(x + 0.5, y + 0.5, ts - 1, ts - 1)
        return
      }
      case StructureType.Stove: {
        const stove = state.stoves.find((st) => st.c === c && st.r === r)
        this.drawStove(stove, x, y, ts, nowMs)
        return
      }
      case StructureType.Bed: {
        const vertical = state.grid.extCellOf(c, r)?.r === r + 1
        const w = vertical ? ts : ts * 2
        const h = vertical ? ts * 2 : ts
        const img = this.sprites.get('bed')
        if (img) {
          // The cot is drawn head-up on a 1x2 footprint; a horizontal bed turns it on its side.
          if (vertical) this.drawProp(img, x, y, ts, 1, 2, 1.1)
          else {
            ctx.save()
            ctx.translate(x + ts, y + ts / 2)
            ctx.rotate(-Math.PI / 2)
            this.drawProp(img, -ts / 2, -ts, ts, 1, 2, 1.1)
            ctx.restore()
          }
          return
        }
        ctx.fillStyle = '#55483a'
        ctx.fillRect(x + 1, y + 1, w - 2, h - 2)
        ctx.fillStyle = '#dfe7f2'
        if (vertical) ctx.fillRect(x + 3, y + 3, w - 6, ts * 0.45)
        else ctx.fillRect(x + 3, y + 3, ts * 0.45, h - 6)
        ctx.strokeStyle = OUTLINE
        ctx.lineWidth = 1
        ctx.strokeRect(x + 1, y + 1, w - 2, h - 2)
        return
      }
      case StructureType.Sawhorse: {
        const img = this.sprites.get('sawhorse')
        if (img) {
          this.drawProp(img, x, y, ts, 2, 1, 1.1)
          return
        }
        ctx.fillStyle = PARTITION
        ctx.fillRect(x + 2, y + ts * 0.3, ts * 2 - 4, ts * 0.4)
        ctx.strokeStyle = WALL
        ctx.lineWidth = Math.max(1, ts * 0.12)
        ctx.beginPath()
        ctx.moveTo(x + ts * 0.3, y + ts * 0.85)
        ctx.lineTo(x + ts * 0.6, y + ts * 0.15)
        ctx.moveTo(x + ts * 1.4, y + ts * 0.85)
        ctx.lineTo(x + ts * 1.7, y + ts * 0.15)
        ctx.stroke()
        return
      }
      case StructureType.Woodpile: {
        const img = this.sprites.get('woodpile')
        if (img) {
          this.drawProp(img, x, y, ts, 2, 1, 1.0)
          return
        }
        for (let i = 0; i < 5; i++) {
          const cx = x + ts * (0.35 + (i % 3) * 0.6) + (i >= 3 ? ts * 0.3 : 0)
          const cy = y + ts * (i >= 3 ? 0.35 : 0.7)
          ctx.fillStyle = '#8a5a32'
          ctx.beginPath()
          ctx.arc(cx, cy, ts * 0.28, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = PARTITION
          ctx.beginPath()
          ctx.arc(cx, cy, ts * 0.14, 0, Math.PI * 2)
          ctx.fill()
        }
        return
      }
      case StructureType.Storage: {
        const img = this.sprites.get('crate')
        if (img) {
          this.drawProp(img, x, y, ts, 1, 1, 1.35)
          return
        }
        ctx.fillStyle = '#a3865c'
        ctx.fillRect(x + 1, y + 1, ts - 2, ts - 2)
        ctx.strokeStyle = WALL
        ctx.lineWidth = 1
        ctx.strokeRect(x + 1, y + 1, ts - 2, ts - 2)
        ctx.beginPath()
        ctx.moveTo(x + 2, y + 2)
        ctx.lineTo(x + ts - 2, y + ts - 2)
        ctx.moveTo(x + ts - 2, y + 2)
        ctx.lineTo(x + 2, y + ts - 2)
        ctx.stroke()
        return
      }
      default:
        return
    }
  }

  /**
   * Which plank floor each tile wears: the room's own (by the stove that
   * heats it), and for tiles under furniture, doors and partitions the floor
   * of a neighbouring tile. Cached until the structures change.
   */
  private floorKinds(state: GameState): Uint8Array {
    const grid = state.grid
    if (this.floorKind && this.floorVersion === grid.structureVersion) return this.floorKind
    const rooms = state.rooms()
    const kindOfRoom = new Map<number, number>()
    for (let i = 0; i < state.stoves.length; i++) kindOfRoom.set(stoveRoom(state, i), i === 0 ? 1 : i === 1 ? 2 : 3)
    const kind = new Uint8Array(grid.w * grid.h)
    for (let r = 0; r < grid.h; r++) {
      for (let c = 0; c < grid.w; c++) {
        if (grid.terrainAt(c, r) !== Terrain.Floor) continue
        const room = rooms.roomIdByTile[grid.idx(c, r)]!
        kind[grid.idx(c, r)] = room >= 0 ? (kindOfRoom.get(room) ?? 1) : 0
      }
    }
    // Boundary tiles (furniture, doors, partitions) borrow a neighbour's floor; two passes reach corners.
    for (let pass = 0; pass < 2; pass++) {
      for (let r = 0; r < grid.h; r++) {
        for (let c = 0; c < grid.w; c++) {
          const i = grid.idx(c, r)
          if (grid.terrainAt(c, r) !== Terrain.Floor || kind[i] !== 0) continue
          for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            if (!grid.inBounds(c + dc, r + dr)) continue
            const k = kind[grid.idx(c + dc, r + dr)]!
            if (k > 0) {
              kind[i] = k
              break
            }
          }
        }
      }
    }
    for (let i = 0; i < kind.length; i++) if (kind[i] === 0 && grid.terrainAt(i % grid.w, (i - (i % grid.w)) / grid.w) === Terrain.Floor) kind[i] = 1
    this.floorKind = kind
    this.floorVersion = grid.structureVersion
    return kind
  }

  /** A sprite centred on a footprint of w x h tiles, scaled up by `grow` so it reads bigger than its tile. */
  private drawProp(img: HTMLImageElement, x: number, y: number, ts: number, w: number, h: number, grow: number): void {
    const width = ts * w * grow
    const height = (width * img.naturalHeight) / img.naturalWidth
    this.withShadow(ts, () => this.ctx.drawImage(img, x + (ts * w - width) / 2, y + (ts * h - height) / 2, width, height))
  }

  /** A soft contact shadow under a sprite, so objects separate from the floor. */
  private withShadow(ts: number, draw: () => void): void {
    const { ctx } = this
    ctx.save()
    ctx.shadowColor = 'rgba(8, 10, 22, 0.55)'
    ctx.shadowBlur = ts * 0.35
    ctx.shadowOffsetX = ts * 0.08
    ctx.shadowOffsetY = ts * 0.14
    draw()
    ctx.restore()
  }

  private drawStove(stove: Stove | undefined, x: number, y: number, ts: number, nowMs: number): void {
    const { ctx } = this
    const img = this.sprites.get('stove')
    // Drawn half again as big as its tile: a stove is a presence, not a floor tile.
    if (img) this.drawProp(img, x, y, ts, 1, 1, 1.5)
    else {
      ctx.fillStyle = '#474b58'
      ctx.fillRect(x + 1, y + 1, ts - 2, ts - 2)
    }
    if (stove?.lit) {
      // A lit stove glows on its top plate (the big ring of the sprite).
      const flick = 0.55 + 0.3 * Math.abs(Math.sin(nowMs / 130))
      ctx.fillStyle = `rgba(255, 176, 58, ${flick})`
      ctx.beginPath()
      ctx.arc(x + ts * 0.5, y + ts * 0.58, ts * 0.36, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  /** A two-tile window piece (frame, glass or planks or hole) lying along its wall, snowy sill outward. */
  private drawWindow(section: Section, sx: (c: number) => number, sy: (r: number) => number, ts: number): void {
    const img = this.sprites.get(windowSprite(section))
    if (!img || section.tiles.length === 0) return
    const first = section.tiles[0]!
    const horizontal = section.orientation === 'h'
    const length = section.tiles.length * ts
    const height = (length * img.naturalHeight) / img.naturalWidth
    const { ctx } = this
    ctx.save()
    ctx.translate(sx(first.c) + (horizontal ? length : ts) / 2, sy(first.r) + (horizontal ? ts : length) / 2)
    ctx.rotate(horizontal ? (section.inside && section.inside.r < first.r ? Math.PI : 0) : section.inside && section.inside.c > first.c ? -Math.PI / 2 : Math.PI / 2)
    // The sill sticks out above the wall band: keep the band on the tile, the sill outside.
    ctx.drawImage(img, -length / 2, ts / 2 - height, length, height)
    ctx.restore()
  }

  private drawWall(section: Section, sx: (c: number) => number, sy: (r: number) => number, ts: number): void {
    const img = this.sprites.get(WALL_SPRITE[section.state])
    if (!img || section.tiles.length === 0) return
    const first = section.tiles[0]!
    const horizontal = section.orientation === 'h'
    const length = section.tiles.length * ts
    const { ctx } = this
    ctx.save()
    ctx.translate(sx(first.c) + (horizontal ? length : ts) / 2,
      sy(first.r) + (horizontal ? ts : length) / 2)
    // The source's snowy edge is at the top; keep it on the exterior side.
    ctx.rotate(horizontal
      ? (section.inside && section.inside.r < first.r ? Math.PI : 0)
      : (section.inside && section.inside.c > first.c ? -Math.PI / 2 : Math.PI / 2))
    // The four files are pre-cropped to the same strip (512x129), so the wall
    // does not shift when its state changes.
    ctx.drawImage(img, -length / 2, -ts / 2, length, ts)
    ctx.restore()
  }

  private drawFence(section: Section, sx: (c: number) => number, sy: (r: number) => number, ts: number): void {
    const { ctx } = this
    const first = section.tiles[0]!
    const len = section.tiles.length
    if (section.state === 'missing') {
      ctx.strokeStyle = '#8fa2c2'
      ctx.lineWidth = Math.max(1, ts * 0.12)
      ctx.setLineDash([ts * 0.5, ts * 0.4])
      ctx.beginPath()
      if (section.orientation === 'h') {
        ctx.moveTo(sx(first.c), sy(first.r) + ts / 2)
        ctx.lineTo(sx(first.c + len), sy(first.r) + ts / 2)
      } else {
        ctx.moveTo(sx(first.c) + ts / 2, sy(first.r))
        ctx.lineTo(sx(first.c) + ts / 2, sy(first.r + len))
      }
      ctx.stroke()
      ctx.setLineDash([])
      return
    }
    const img = this.sprites.get(FENCE_SPRITE[section.state])
    const lengthPx = len * ts
    if (img) {
      const scale = lengthPx / img.naturalWidth
      const thick = img.naturalHeight * scale
      // Thin rails vanish at the overview zoom: never draw a fence slimmer than ~0.7 tile.
      const h = Math.max(thick, ts * 0.7)
      ctx.save()
      if (section.orientation === 'h') {
        ctx.drawImage(img, sx(first.c), sy(first.r) + ts / 2 - h / 2, lengthPx, h)
      } else {
        ctx.translate(sx(first.c) + ts / 2, sy(first.r))
        ctx.rotate(Math.PI / 2)
        ctx.drawImage(img, 0, -h / 2, lengthPx, h)
      }
      ctx.restore()
    } else {
      ctx.fillStyle = section.state === 'hole' ? DANGER : WALL
      if (section.orientation === 'h') ctx.fillRect(sx(first.c), sy(first.r) + ts * 0.35, lengthPx, ts * 0.3)
      else ctx.fillRect(sx(first.c) + ts * 0.35, sy(first.r), ts * 0.3, lengthPx)
    }
  }

  private drawSelection(state: GameState, sel: Selection, sx: (c: number) => number, sy: (r: number) => number, ts: number, nowMs: number): void {
    const { ctx } = this
    if (sel.kind === null) return
    ctx.strokeStyle = SELECT
    ctx.lineWidth = Math.max(1.5, ts * 0.15)
    ctx.setLineDash([ts * 0.4, ts * 0.3])
    ctx.lineDashOffset = -(nowMs / 60) % (ts * 0.7)
    if (sel.kind === 'section') {
      const s = state.section(sel.id as number)
      if (s) {
        const c0 = Math.min(...s.tiles.map((t) => t.c))
        const r0 = Math.min(...s.tiles.map((t) => t.r))
        const c1 = Math.max(...s.tiles.map((t) => t.c))
        const r1 = Math.max(...s.tiles.map((t) => t.r))
        ctx.strokeRect(sx(c0) - 3, sy(r0) - 3, (c1 - c0 + 1) * ts + 6, (r1 - r0 + 1) * ts + 6)
      }
    } else if (sel.kind === 'stove') {
      const st = state.stoves[sel.id as number]
      if (st) ctx.strokeRect(sx(st.c) - 3, sy(st.r) - 3, ts + 6, ts + 6)
    } else if (sel.kind === 'person') {
      const p = state.person(sel.id as string)
      if (p) {
        ctx.beginPath()
        ctx.arc(sx(p.pos.c) + ts / 2, sy(p.pos.r) + ts / 2, ts * 1.05, 0, Math.PI * 2)
        ctx.stroke()
      }
    } else if (sel.kind === 'tree' || sel.kind === 'sawhorse') {
      const idx = sel.id as number
      const c = idx % state.grid.w
      const r = (idx - c) / state.grid.w
      const w = sel.kind === 'sawhorse' ? 2 : 1
      ctx.strokeRect(sx(c) - 2, sy(r) - 2, ts * w + 4, ts + 4)
    }
    ctx.setLineDash([])
  }

  /** Pairs of eyes: at the fence section under attack, in the yard, or at the hole. */
  private drawThreat(state: GameState, sx: (c: number) => number, sy: (r: number) => number, ts: number, nowMs: number): void {
    const night = state.night
    if (night.phase === 'none' || night.attackers <= 0) return
    const { ctx } = this
    const blink = Math.floor(nowMs / 900) % 7 === 0
    if (blink) return
    const n = Math.min(12, night.attackers)
    const target = night.targetId >= 0 ? state.section(night.targetId) : undefined
    for (let i = 0; i < n; i++) {
      let c: number
      let r: number
      const seed = (i * 7919) % 100
      if (night.phase === 'fence' && target) {
        const t = target.tiles[i % target.tiles.length]!
        const out = target.orientation === 'h' ? (t.r < state.grid.h / 2 ? -1 : 1) : 0
        const outC = target.orientation === 'v' ? (t.c < state.grid.w / 2 ? -1 : 1) : 0
        c = t.c + outC * (1.2 + (seed % 3) * 0.6) + (target.orientation === 'h' ? (seed % 5) * 0.2 : 0)
        r = t.r + out * (1.2 + (seed % 3) * 0.6) + (target.orientation === 'v' ? (seed % 5) * 0.2 : 0)
      } else if (target && night.phase === 'yard') {
        const t = target.tiles[i % target.tiles.length]!
        c = t.c + ((seed % 5) - 2) * 0.6 + (target.orientation === 'v' ? 1.5 : 0)
        r = t.r + ((seed % 3) - 1) * 0.8 + (target.orientation === 'h' ? 1.5 : 0)
      } else {
        // In the yard at large or inside: scatter around the gate side of the building.
        c = GATE.c - 4 - (seed % 6)
        r = GATE.r0 - 3 + (seed % 7)
      }
      const x = sx(c) + ts / 2
      const y = sy(r) + ts / 2
      const eye = Math.max(1.2, ts * 0.12)
      ctx.fillStyle = '#ffe08a'
      ctx.beginPath()
      ctx.arc(x - eye * 1.6, y, eye, 0, Math.PI * 2)
      ctx.arc(x + eye * 1.6, y, eye, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

/** Ratio used when a sprite must map exactly onto tiles (kept for callers). */
export const SPRITE_TILE_SCALE = 1 / SPRITE_PX_PER_TILE
