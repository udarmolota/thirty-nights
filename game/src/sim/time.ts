/**
 * Time constants and pure clock math. One simulation step is 10 game
 * minutes; the hour is the planning unit the UI talks in.
 * Days 1..prepDays are the shrinking summer; every day after that is a
 * night of the siege. Dawn after the last night is the win.
 */
import balance from '../data/balance.json'

export const STEP_MIN = 10
export const MIN_PER_DAY = 1440
export const PREP_DAYS: number = balance.calendar.prepDays
export const NIGHT_DAYS: number = balance.calendar.nightDays
export const TOTAL_DAYS = PREP_DAYS + NIGHT_DAYS

/** 1-based calendar day. */
export function dayOf(totalMinutes: number): number {
  return Math.floor(totalMinutes / MIN_PER_DAY) + 1
}

export function hourOf(totalMinutes: number): number {
  return (totalMinutes % MIN_PER_DAY) / 60
}

/** 0 during the summer, 1..NIGHT_DAYS during the siege. */
export function nightOf(day: number): number {
  return Math.max(0, day - PREP_DAYS)
}

/** Hours of safe daylight on a given day: 8 -> 1 over the summer, 0 after. */
export function daylightHours(day: number): number {
  if (day > PREP_DAYS) return 0
  const { daylightDay1: d1, daylightLast: dl } = balance.calendar
  return Math.round((d1 - (d1 - dl) * ((day - 1) / (PREP_DAYS - 1))) * 10) / 10
}

/** Daylight is centred on noon: [12 - d/2, 12 + d/2). */
export function isDaylight(totalMinutes: number): boolean {
  const d = daylightHours(dayOf(totalMinutes))
  if (d <= 0) return false
  const h = hourOf(totalMinutes)
  return h >= 12 - d / 2 && h < 12 + d / 2
}

/** Minutes until today's daylight opens (0 once it has, or on a day without light). */
export function minutesToDaylight(totalMinutes: number): number {
  const d = daylightHours(dayOf(totalMinutes))
  if (d <= 0) return 0
  const start = (12 - d / 2) * 60
  const now = totalMinutes % MIN_PER_DAY
  return Math.max(0, start - now)
}

/** Minutes of daylight left today (0 when dark or after the window). */
export function daylightLeft(totalMinutes: number): number {
  const d = daylightHours(dayOf(totalMinutes))
  if (d <= 0) return 0
  const end = (12 + d / 2) * 60
  const now = totalMinutes % MIN_PER_DAY
  return Math.max(0, end - now)
}

/** The attack window of a siege night (hours from balance). */
export function isAttackHour(totalMinutes: number): boolean {
  if (nightOf(dayOf(totalMinutes)) === 0) return false
  const h = hourOf(totalMinutes)
  return h >= balance.calendar.attackFromHour && h < balance.calendar.attackToHour
}

export type NightKind = 'assault' | 'probe' | 'quiet'

/** Assault every third night, a probe the night after, then quiet. */
export function nightKind(night: number): NightKind {
  if (night <= 0) return 'quiet'
  const every = balance.night.assaultEvery
  if (night % every === 0) return 'assault'
  if (night % every === 1) return 'probe'
  return 'quiet'
}

export function nightAttackers(night: number): number {
  const kind = nightKind(night)
  if (kind === 'assault') return Math.floor(night / balance.night.assaultEvery) + balance.night.assaultBonus
  if (kind === 'probe') return balance.night.probeAttackers
  return 0
}

/** Night-time darkness 0..1 for the render tint: full night after sunset. */
export function darkness(totalMinutes: number): number {
  const d = daylightHours(dayOf(totalMinutes))
  if (d <= 0) return 1
  const h = hourOf(totalMinutes)
  const from = 12 - d / 2
  const to = 12 + d / 2
  // Dark until dawn; dawn brightens over an hour once the window is open;
  // full light until dusk; dusk darkens over the hour after it. So "until
  // dusk" is still light, and after it the forest is closed and it is dark.
  const ramp = 1
  if (h < from) return 1
  if (h < from + ramp) return 1 - (h - from) / ramp
  if (h < to) return 0
  if (h < to + ramp) return (h - to) / ramp
  return 1
}

/** "13:40" for a game-minutes stamp (any day). */
export function clockOf(totalMinutes: number): string {
  const m = ((Math.round(totalMinutes) % MIN_PER_DAY) + MIN_PER_DAY) % MIN_PER_DAY
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}
