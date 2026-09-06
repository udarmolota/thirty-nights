import { describe, expect, it } from 'vitest'
import { GameLoop } from '../src/core/loop'

describe('the game loop', () => {
  it('a step that pauses the game ends the batch and drops the backlog', () => {
    let frame: ((now: number) => void) | null = null
    Object.assign(globalThis, {
      requestAnimationFrame: (cb: (now: number) => void): number => {
        frame = cb
        return 1
      },
      cancelAnimationFrame: (): void => {},
    })
    let ticks = 0
    const loop = new GameLoop(
      10,
      () => {
        ticks++
        loop.speed = 0 // the first step hits a breach and pauses
      },
      () => {},
    )
    loop.start()
    const started = performance.now()
    frame!(started + 100) // ten steps' worth of time
    expect(ticks).toBe(1)
    // Unpausing does not fire the stale steps.
    loop.speed = 1
    frame!(started + 105)
    expect(ticks).toBe(1)
    loop.stop()
  })
})
