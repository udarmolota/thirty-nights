/**
 * The settlement beyond the fence: seventeen houses along one street and its
 * lanes, each a finite stash that runs out once looted. The map is a drawing;
 * everything the game needs about a house is here.
 */
import type { GameState } from './state'
import village from '../data/village.json'

export type HouseType = 'house' | 'shop' | 'lumber' | 'clinic' | 'garage' | 'office'

export interface Loot {
  food: number
  boards: number
  meds: number
}

export interface House {
  id: string
  type: HouseType
  /** Position on the map picture, 0..1 of its width and height. */
  x: number
  y: number
  /** Minutes of walking one way, by the road, for a runner of speed 1. */
  travelMin: number
  /** What is still there. */
  loot: Loot
  /** Chance (0..1) that the runner gets hurt on this trip. */
  danger: number
  /** Somebody is hiding here (a residential house) or lying here hurt (the clinic). */
  survivor: boolean
  /** Visited at least once (the player has seen what is there). */
  visited: boolean
}

export const VILLAGE = village

/** Build the houses for a new game; the RNG decides which homes hide a survivor. */
export function buildVillage(state: GameState): void {
  const houses: House[] = village.houses.map((h) => ({
    id: h.id,
    type: h.type as HouseType,
    x: h.x,
    y: h.y,
    travelMin: h.travelMin,
    loot: { ...h.loot },
    danger: h.danger,
    survivor: h.type === 'clinic',
    visited: false,
  }))
  const homes = houses.filter((h) => h.type === 'house')
  for (let i = 0; i < village.survivorHouses && homes.length > 0; i++) {
    const pick = homes.splice(state.rng.int(0, homes.length - 1), 1)[0]!
    pick.survivor = true
  }
  state.houses = houses
}

export function isLooted(house: House): boolean {
  return house.loot.food <= 0 && house.loot.boards <= 0 && house.loot.meds <= 0
}
