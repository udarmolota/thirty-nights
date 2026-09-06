/**
 * Fixed-timestep game loop.
 * Simulation ticks at a constant game-time step (1 tick = 1 game minute);
 * rendering runs on requestAnimationFrame, decoupled from the sim rate.
 */
export class GameLoop {
  /** Sim speed multiplier: 0 = paused, 1/2/3 = normal/fast/faster. */
  speed = 1
  /** Frames per second, updated once a second (for the debug HUD). */
  fps = 0

  private acc = 0
  private last = 0
  private frames = 0
  private fpsWindowStart = 0
  private rafId = 0

  constructor(
    private readonly tickMs: number,
    private readonly onTick: () => void,
    /** alpha = fraction of the next tick already elapsed (0..1), for interpolation. */
    private readonly onRender: (alpha: number) => void,
  ) {}

  start(): void {
    this.last = performance.now()
    this.fpsWindowStart = this.last
    const frame = (now: number): void => {
      // Clamp huge deltas (tab was in background) so we don't spiral.
      const dt = Math.min(now - this.last, 250)
      this.last = now
      this.acc += dt * this.speed

      let steps = 0
      while (this.acc >= this.tickMs && steps < 30) {
        this.onTick()
        this.acc -= this.tickMs
        steps++
        if (this.speed === 0) {
          // The step paused the game (a breach, a modal): drop the backlog so
          // nothing else happens before the player reacts, and unpausing does
          // not fire a stale step.
          this.acc = 0
          break
        }
      }
      if (steps === 30) this.acc = 0 // sim can't keep up; drop the backlog

      this.onRender(Math.min(1, this.acc / this.tickMs))

      this.frames++
      if (now - this.fpsWindowStart >= 1000) {
        this.fps = this.frames
        this.frames = 0
        this.fpsWindowStart = now
      }
      this.rafId = requestAnimationFrame(frame)
    }
    this.rafId = requestAnimationFrame(frame)
  }

  stop(): void {
    cancelAnimationFrame(this.rafId)
  }
}
