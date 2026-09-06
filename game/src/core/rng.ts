/**
 * Deterministic seeded RNG (mulberry32).
 * Every subsystem gets its own named stream via fork() so that
 * save/load and unrelated systems never disturb each other's sequences.
 */
export class Rng {
  readonly seed: number
  private s: number

  constructor(seed: number) {
    this.seed = seed >>> 0
    this.s = this.seed
  }

  /** Uniform float in [0, 1). */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0
    let t = this.s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** Uniform integer in [min, max], inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1))
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.next() < p
  }

  /** Random element of a non-empty array. */
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(0, arr.length - 1)]!
  }

  /** Derive an independent, reproducible stream from the ORIGINAL seed and a label. */
  fork(label: string): Rng {
    return new Rng(Rng.hash(this.seed, label))
  }

  /** Save/load support: the whole stream state is one 32-bit word. */
  getState(): number {
    return this.s
  }

  setState(s: number): void {
    this.s = s >>> 0
  }

  private static hash(seed: number, label: string): number {
    let h = (seed ^ 0x9e3779b9) >>> 0
    for (let i = 0; i < label.length; i++) {
      h = Math.imul(h ^ label.charCodeAt(i), 0x85ebca6b)
      h = ((h << 13) | (h >>> 19)) >>> 0
    }
    return h >>> 0
  }
}
