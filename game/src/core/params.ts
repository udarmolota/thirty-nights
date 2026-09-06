/**
 * Start / playtest URL parameters, parsed pure so tests can cover the edge
 * cases. Browser convenience only: the device build has no UI for them.
 * NB: Number(null) === 0 in JS - always check has() before Number().
 */
import type { Lang } from './i18n'

export const DEFAULT_SEED = 20260715

/** Stock names that can be overridden from the URL (?food=100&wood=300). */
export const STOCK_KEYS = ['wood', 'boards', 'food', 'meds'] as const
export type StockKey = (typeof STOCK_KEYS)[number]

export interface StartParams {
  seed: number
  lang: Lang
  /** Clock override in game minutes, or null = default (day 1, 08:00). */
  startMinutes: number | null
  /** Starting stock overrides; only the keys given in the URL. */
  stocks: Partial<Record<StockKey, number>>
}

export function parseParams(search: string): StartParams {
  const params = new URLSearchParams(search)

  const rawSeed = params.has('seed') ? Number(params.get('seed')) : NaN
  const seed = Number.isFinite(rawSeed) && rawSeed > 0 ? rawSeed : DEFAULT_SEED

  const lang: Lang = params.get('lang') === 'en' ? 'en' : 'ru'

  // Clock jump: ?day=14 (08:00 of that day) or ?day=16&hour=23.
  const day = params.has('day') ? Number(params.get('day')) : NaN
  const hour = params.has('hour') ? Number(params.get('hour')) : NaN
  const dayValid = Number.isFinite(day) && day >= 1
  const hourValid = Number.isFinite(hour) && hour >= 0 && hour < 24

  let startMinutes: number | null = null
  if (dayValid && hourValid) startMinutes = (day - 1) * 1440 + hour * 60
  else if (dayValid) startMinutes = (day - 1) * 1440 + 8 * 60
  else if (hourValid) startMinutes = hour * 60

  const stocks: Partial<Record<StockKey, number>> = {}
  for (const key of STOCK_KEYS) {
    if (!params.has(key)) continue
    const n = Number(params.get(key))
    if (Number.isFinite(n) && n >= 0) stocks[key] = n
  }

  return { seed, lang, startMinutes, stocks }
}
