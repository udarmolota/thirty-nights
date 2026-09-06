/**
 * A person of the colony: pure simulation data. There is no hero - both are
 * workers the player assigns. Movement is cosmetic (the job's hours are what
 * cost), but positions still matter for the render and for being in a room
 * when the cold or the enemies come.
 */
import type { Cell } from '../world/path'
import type { Job } from './jobs'

export interface PersonDef {
  id: string
  name: string
  sprite: string
  work: number
  speed: number
  carry: number
}

export class Person {
  readonly id: string
  readonly name: string
  readonly sprite: string
  /** Work speed multiplier (1.2 = strong). */
  readonly work: number
  /** Expedition speed multiplier (1.3 = light on their feet). */
  readonly speed: number
  readonly carry: number
  health = 100
  /** Days until a wound heals (0 = not wounded). Counts down every morning. */
  woundDays = 0
  pos: { c: number; r: number }
  prev: { c: number; r: number }
  path: Cell[] | null = null
  /** Facing, radians; the sprite turns toward movement. */
  heading = 0
  job: Job | null = null
  /** Work minutes left in the daily budget (12 h); refilled each morning. */
  budgetMin: number
  sleeping = false
  /** Where they stand when idle: beside their bed. */
  home: Cell

  constructor(def: PersonDef, home: Cell, budgetMin: number) {
    this.id = def.id
    this.name = def.name
    this.sprite = def.sprite
    this.work = def.work
    this.speed = def.speed
    this.carry = def.carry
    this.home = home
    this.pos = { c: home.c, r: home.r }
    this.prev = { c: home.c, r: home.r }
    this.budgetMin = budgetMin
  }

  get wounded(): boolean {
    return this.woundDays > 0
  }

  get isMoving(): boolean {
    return this.path !== null && this.path.length > 0
  }

  isAtTile(c: number, r: number): boolean {
    return !this.isMoving && Math.round(this.pos.c) === c && Math.round(this.pos.r) === r
  }
}
