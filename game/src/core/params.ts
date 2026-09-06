/**
 * Dev/start URL parameters, parsed pure so tests can cover the edge cases.
 * NB: Number(null) === 0 in JS — always check has() before Number().
 */
import type { Lang } from './i18n'

export const DEFAULT_SEED = 20260715

export interface StartParams {
  seed: number
  lang: Lang
  /** Clock override in game minutes, or null = default (day 1, 08:00). */
  startMinutes: number | null
  /** Dev: pre-load the wrath ledger (?wrath=N), or null. */
  wrath: number | null
  /** Dev: force a raid ~10 game minutes in (?raid=1). */
  forceRaid: boolean
  /** Dev: skip the expedition-setup screen (?nosetup=1). */
  skipSetup: boolean
  /** Dev: load a save slot straight away (?load=auto|bookmark). */
  load: 'auto' | 'bookmark' | null
}

export function parseParams(search: string): StartParams {
  const params = new URLSearchParams(search)

  const rawSeed = params.has('seed') ? Number(params.get('seed')) : NaN
  const seed = Number.isFinite(rawSeed) && rawSeed > 0 ? rawSeed : DEFAULT_SEED

  const lang: Lang = params.get('lang') === 'en' ? 'en' : 'ru'

  // Dev-only clock jump: ?day=15&hour=22 (browser convenience, no UI on device).
  const day = params.has('day') ? Number(params.get('day')) : NaN
  const hour = params.has('hour') ? Number(params.get('hour')) : NaN
  const dayValid = Number.isFinite(day) && day >= 1
  const hourValid = Number.isFinite(hour) && hour >= 0 && hour < 24

  let startMinutes: number | null = null
  if (dayValid && hourValid) startMinutes = (day - 1) * 1440 + hour * 60
  else if (dayValid) startMinutes = (day - 1) * 1440 + 8 * 60
  else if (hourValid) startMinutes = hour * 60

  const rawWrath = params.has('wrath') ? Number(params.get('wrath')) : NaN
  const wrath = Number.isFinite(rawWrath) && rawWrath >= 0 ? Math.min(100, rawWrath) : null
  const forceRaid = params.get('raid') === '1'
  const skipSetup = params.get('nosetup') === '1'
  const rawLoad = params.get('load')
  const load = rawLoad === 'auto' || rawLoad === 'bookmark' ? rawLoad : null

  return { seed, lang, startMinutes, wrath, forceRaid, skipSetup, load }
}
