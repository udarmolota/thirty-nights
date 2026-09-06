/**
 * Sprite loading. The art lives in public/art as PNGs drawn at 4x the base
 * tile (64 px per tile); the renderer scales them to the camera's tile size.
 */
export const SPRITE_NAMES = [
  'wall_intact',
  'wall_damaged',
  'wall_broken',
  'wall_reinforced',
  'fence_intact',
  'fence_damaged',
  'fence_reinforced',
  'fence_broken',
  'person_ivan',
  'person_marta',
  'stove',
  'spruce_small',
  'spruce',
  'spruce_large',
  'snow',
  'snow_night',
  'floor_hall',
  'floor_office',
  'floor_store',
  'crate',
  'sawhorse',
  'woodpile',
  'door',
  'bed',
  'window_intact',
  'window_boarded',
  'window_broken',
  'partition',
] as const

export type SpriteName = (typeof SPRITE_NAMES)[number]

/** Pixels per tile the sprites were authored at. */
export const SPRITE_PX_PER_TILE = 64

export class Sprites {
  private readonly images = new Map<SpriteName, HTMLImageElement>()

  get(name: SpriteName): HTMLImageElement | null {
    const img = this.images.get(name)
    return img && img.complete && img.naturalWidth > 0 ? img : null
  }

  /** Resolve when everything that can load has loaded (missing files are tolerated). */
  load(base = './art/'): Promise<void> {
    const waits = SPRITE_NAMES.map(
      (name) =>
        new Promise<void>((resolve) => {
          const img = new Image()
          img.onload = () => resolve()
          img.onerror = () => resolve()
          img.src = `${base}${name}.png`
          this.images.set(name, img)
        }),
    )
    return Promise.all(waits).then(() => undefined)
  }
}
