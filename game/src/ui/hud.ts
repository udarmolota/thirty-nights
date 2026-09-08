/**
 * DOM interface: the top bar, the roster, the action sheet, toasts and
 * modals. It reads the sim and calls back into main for actions; it never
 * mutates the sim itself.
 */
import { t } from '../core/i18n'
import type { GameState } from '../sim/state'
import type { Person } from '../sim/person'
import { availableOps, maxHp, opCost, type SectionOp } from '../sim/sections'
import { estimateJob, type JobEstimate, type Plan } from '../sim/jobs'
import { estimateExpedition } from '../sim/expedition'
import { isLooted } from '../sim/village'
import { STEP_MIN } from '../sim/time'
import balance from '../data/balance.json'
import { bedroomTemp, stoveRoom, type RoomTemps } from '../sim/heat'

/** The three heated rooms, by the index of their stove; the office (beds) first. */
const ROOMS: Array<[stove: number, key: string]> = [
  [1, 'room.office'],
  [0, 'room.hall'],
  [2, 'room.store'],
]

function fmtTemp(temp: number): string {
  return `${temp > 0 ? '+' : ''}${Math.round(temp)}°`
}
import { foodDays } from '../sim/economy'
import { daylightHours, daylightLeft, dayOf, hourOf, isDaylight, minutesToDaylight, NIGHT_DAYS, nightOf, PREP_DAYS } from '../sim/time'

export interface HudCallbacks {
  setSpeed: (speed: number) => void
  toMorning: () => void
  selectPerson: (id: string) => void
  assignJob: (personId: string, job: 'chop' | 'saw' | 'cancel') => void
  assignSection: (personId: string, sectionId: number, op: SectionOp) => void
  treatPerson: (personId: string) => void
  toggleStove: (index: number) => void
  sendExpedition: (personId: string, houseId: string) => void
  /** A house was tapped on the map (null = the map was closed or a tap on nothing). */
  selectHouse: (houseId: string | null) => void
}

export type SheetTarget =
  | { kind: 'person'; id: string }
  | { kind: 'section'; id: number }
  | { kind: 'stove'; id: number }
  | { kind: 'tree' }
  | { kind: 'sawhorse' }
  | { kind: 'house'; id: string }
  | { kind: 'none' }

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T
}

function fmt(n: number): string {
  return String(Math.floor(n))
}


/** Line icons for the top bar, 16x16, drawn in the current colour. */
const ICON = (body: string): string => `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`
const ICONS: Record<string, string> = {
  temp: ICON('<path d="M6 2.5a2 2 0 0 1 4 0v6.6a3.5 3.5 0 1 1-4 0z"/><path d="M8 6v5.5"/>'),
  food: ICON('<path d="M2.5 8.5h11l-1.2 4.5H3.7z"/><path d="M4 8.5V7a4 4 0 0 1 8 0v1.5"/>'),
  wood: ICON('<rect x="2" y="5" width="12" height="6" rx="3"/><circle cx="5" cy="8" r="1.4"/><path d="M8 6.5h4M8 9.5h4"/>'),
  boards: ICON('<rect x="2" y="5.5" width="12" height="5"/><path d="M6 5.5v5M10 5.5v5"/>'),
  meds: ICON('<rect x="2.5" y="3.5" width="11" height="9" rx="1.5"/><path d="M8 5.5v5M5.5 8h5"/>'),
  calendar: ICON('<rect x="2.5" y="3.5" width="11" height="10" rx="1"/><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3"/>'),
  hourglass: ICON('<path d="M4.5 2.5h7M4.5 13.5h7M5.5 2.5v1.5l2.5 4 2.5-4V2.5M5.5 13.5V12l2.5-4 2.5 4v1.5"/>'),
}

export class Hud {
  private readonly phase = el<HTMLDivElement>('phase')
  private readonly clock = el<HTMLDivElement>('clock')
  private readonly light = el<HTMLDivElement>('light')
  private readonly res = el<HTMLDivElement>('res')
  private readonly speeds = el<HTMLDivElement>('speeds')
  private readonly roster = el<HTMLDivElement>('roster')
  private readonly sheet = el<HTMLDivElement>('sheet')
  private readonly toasts = el<HTMLDivElement>('toasts')
  private readonly modal = el<HTMLDivElement>('modal')
  private readonly modalBox = el<HTMLDivElement>('modalbox')
  private speedButtons: HTMLButtonElement[] = []
  /** Which person the sheet's actions apply to (chips). */
  who: string | null = null
  /** The job being considered: chosen action, not yet confirmed. */
  private plan: Plan | null = null
  /** The sheet target the plan belongs to; a different target drops the plan. */
  private planTarget = ''
  private lastSheetKey = ''
  private modalShownAt = 0
  private readonly popover = el<HTMLDivElement>('popover')
  private readonly village = el<HTMLDivElement>('village')
  private readonly villageMap = el<HTMLDivElement>('villageMap')
  private readonly runners = el<HTMLDivElement>('runners')
  private readonly mapToggle = el<HTMLButtonElement>('mapToggle')
  /** The village map is open over the base. */
  mapOpen = false
  private lastMapKey = ''
  /** The last sim snapshot the top bar was drawn from, for the popover text. */
  private lastState: GameState | null = null
  private lastTemps: RoomTemps | null = null

  constructor(private readonly cb: HudCallbacks) {
    // A tap anywhere outside the popover closes it.
    // A tap anywhere outside the popover closes it - and goes no further, so
    // the map under it does not open something else.
    document.addEventListener(
      'pointerdown',
      (ev) => {
        if (this.popover.hidden || this.popover.contains(ev.target as Node)) return
        this.closePopover()
        ev.stopPropagation()
        ev.preventDefault()
      },
      true,
    )
    const defs: Array<[string, number | 'morning']> = [
      ['speed.pause', 0],
      ['speed.x1', 1],
      ['speed.x2', 2],
      ['speed.x3', 3],
      ['speed.toMorning', 'morning'],
    ]
    for (const [key, speed] of defs) {
      const b = document.createElement('button')
      b.textContent = t(key)
      b.addEventListener('click', () => (speed === 'morning' ? cb.toMorning() : cb.setSpeed(speed)))
      this.speeds.appendChild(b)
      if (speed !== 'morning') this.speedButtons.push(b)
    }
    this.mapToggle.textContent = t('map.open')
    this.mapToggle.addEventListener('click', () => this.setMapOpen(!this.mapOpen))
    // A tap on the map's empty paper drops the house selection.
    this.villageMap.addEventListener('click', (ev) => {
      if (ev.target === this.villageMap) this.cb.selectHouse(null)
    })
  }

  setMapOpen(open: boolean): void {
    this.mapOpen = open
    this.village.hidden = !open
    this.mapToggle.textContent = t(open ? 'map.close' : 'map.open')
    this.lastMapKey = ''
    this.cb.selectHouse(null)
  }

  /** Lay the map picture out to fit, and put a marker on every house. */
  updateMap(state: GameState, selectedId: string | null): void {
    if (!this.mapOpen) return
    const box = this.village.getBoundingClientRect()
    const aspect = 1376 / 768
    let w = box.width - 24
    let h = w / aspect
    if (h > box.height - 24) {
      h = box.height - 24
      w = h * aspect
    }
    this.villageMap.style.width = `${w}px`
    this.villageMap.style.height = `${h}px`
    const key = state.houses.map((x) => `${x.id}:${isLooted(x)}:${x.visited}:${x.id === selectedId}`).join('|') + '#' + state.people.map((p) => (p.away ? `${p.id}@${p.away.returnAt}` : '')).join()
    if (key === this.lastMapKey) return
    this.lastMapKey = key
    this.villageMap.replaceChildren(
      ...state.houses.map((house) => {
        const b = document.createElement('button')
        const looted = isLooted(house)
        b.className = `house ${house.type} ${looted ? 'looted' : ''} ${house.id === selectedId ? 'selected' : ''}`
        b.style.left = `${house.x * 100}%`
        b.style.top = `${house.y * 100}%`
        // The sketch icon (crossed out once looted) with a short label under it.
        const img = document.createElement('img')
        img.src = `./art/icon_${house.type}${looted ? '_x' : ''}.png`
        img.alt = ''
        const label = document.createElement('span')
        label.textContent = t(`marker.${house.type}`)
        b.append(img, label)
        b.addEventListener('click', (ev) => {
          ev.stopPropagation()
          this.cb.selectHouse(house.id)
        })
        return b
      }),
    )
    const out = state.people.filter((p) => p.away && p.health > 0)
    this.runners.replaceChildren(
      ...out.map((p) => {
        const house = state.houses.find((x) => x.id === p.away!.houseId)
        return this.line(t('map.runner', { name: p.name, house: house ? t(`house.${house.type}`) : '?', t: this.clockOf(p.away!.returnAt) }))
      }),
    )
    this.runners.hidden = out.length === 0
  }

  /** "13:40" for a game-minutes stamp. */
  private clockOf(totalMinutes: number): string {
    const m = ((totalMinutes % 1440) + 1440) % 1440
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  }

  /** "Office -2°, Workshop -22°, Storeroom -22°" for the morning report. */
  roomsLine(state: GameState, temps: RoomTemps): string {
    return ROOMS.map(([stove, key]) => `${t(key)} ${fmtTemp(temps.temps.get(stoveRoom(state, stove)) ?? -22)}`).join(', ')
  }

  /** Name of a room by its region id, if it is one of the three heated rooms. */
  private roomLabel(state: GameState, roomId: number): string | null {
    for (const [stove, key] of ROOMS) if (stoveRoom(state, stove) === roomId) return t(key)
    return null
  }

  setSpeedActive(speed: number, toMorning: boolean): void {
    this.speedButtons.forEach((b, i) => b.classList.toggle('active', !toMorning && i === speed))
    const last = this.speeds.lastElementChild as HTMLButtonElement
    last.classList.toggle('active', toMorning)
  }

  updateTop(state: GameState, temps: RoomTemps): void {
    const day = dayOf(state.totalMinutes)
    const night = nightOf(day)
    // Calendar icon + "8 of 14" (or "4 of 30" in the polar night), hourglass icon + clock.
    this.iconText(this.phase, 'calendar', night === 0 ? t('hud.phase', { day, total: PREP_DAYS }) : t('hud.nightPhase', { night, total: NIGHT_DAYS }))
    const h = hourOf(state.totalMinutes)
    const hh = Math.floor(h)
    const mm = Math.round((h - hh) * 60)
    this.iconText(this.clock, 'hourglass', `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`)
    // The light field is the "may I go out" sign: green while the forest is open,
    // amber in the last hour, a countdown before dawn, muted in the dark.
    const toDawn = minutesToDaylight(state.totalMinutes)
    const left = daylightLeft(state.totalMinutes)
    let lightState = 'dark'
    if (night > 0) this.light.textContent = t('hud.polarNight')
    else if (isDaylight(state.totalMinutes)) {
      this.light.textContent = t('hud.lightLeft', { t: this.clockDuration(left) })
      lightState = left <= 60 ? 'soon' : 'good'
    } else if (toDawn > 0) {
      this.light.textContent = t('hud.lightIn', { t: this.clockDuration(toDawn) })
      lightState = 'wait'
    } else this.light.textContent = t('hud.dark')
    this.light.className = lightState
    void daylightHours

    // Icon + number; a tap opens a small popover with the detail under it.
    const temp = bedroomTemp(state, temps)
    const lit = state.stoves.filter((s) => s.lit).length
    const woodHours = lit > 0 ? Math.floor(state.res.wood / lit) : -1
    const items: Array<[key: string, value: string, cls: string]> = [
      ['temp', fmtTemp(temp), temp < 0 ? 'bad' : ''],
      ['food', fmt(state.res.food), state.res.food < state.people.length * 3 ? 'bad' : ''],
      ['wood', fmt(state.res.wood), state.burningBoards || (lit > 0 && woodHours < 24) ? 'bad' : ''],
      ['boards', fmt(state.res.boards), state.res.boards < 4 ? 'bad' : ''],
      ['meds', fmt(state.res.meds), ''],
    ]
    this.lastState = state
    this.lastTemps = temps
    const key = items.map((i) => i[1] + i[2]).join('|')
    if (this.res.dataset.key === key) return
    this.res.dataset.key = key
    this.res.replaceChildren(
      ...items.map(([k, v, cls]) => {
        const d = document.createElement('button')
        d.className = `resitem ${cls}`
        d.innerHTML = ICONS[k] ?? ''
        const val = document.createElement('b')
        val.textContent = v
        d.appendChild(val)
        d.addEventListener('click', (ev) => {
          ev.stopPropagation()
          this.togglePopover(d, k)
        })
        return d
      }),
    )
  }

  /** What a stock means right now, one line per fact. */
  private stockDetail(key: string): string[] {
    const state = this.lastState
    const temps = this.lastTemps
    if (!state || !temps) return []
    const alive = state.people.filter((p) => p.health > 0).length
    const lit = state.stoves.filter((s) => s.lit).length
    switch (key) {
      case 'temp':
        return this.roomsLine(state, temps).split(', ')
      case 'food':
        return [t('pop.food', { food: fmt(state.res.food), n: foodDays(state), people: alive })]
      case 'wood':
        return [lit > 0 ? t('pop.wood', { wood: fmt(state.res.wood), h: Math.floor(state.res.wood / lit), lit }) : t('pop.woodIdle', { wood: fmt(state.res.wood) })]
      case 'boards':
        return [t('pop.boards', { boards: fmt(state.res.boards), n: Math.floor(state.res.boards / balance.sections.repair.boards), cost: balance.sections.repair.boards })]
      case 'meds':
        return [t('pop.meds', { meds: fmt(state.res.meds), days: balance.wounds.daysWithMeds })]
      default:
        return []
    }
  }

  private togglePopover(anchor: HTMLElement, key: string): void {
    if (this.popover.dataset.key === key && !this.popover.hidden) {
      this.closePopover()
      return
    }
    const close = document.createElement('button')
    close.className = 'close'
    close.textContent = '×'
    close.addEventListener('click', () => this.closePopover())
    this.popover.replaceChildren(close, ...this.stockDetail(key).map((line) => this.line(line)))
    this.popover.dataset.key = key
    this.popover.hidden = false
    const r = anchor.getBoundingClientRect()
    const w = this.popover.offsetWidth
    this.popover.style.left = `${Math.max(4, Math.min(window.innerWidth - w - 4, r.left + r.width / 2 - w / 2))}px`
    this.popover.style.top = `${r.bottom + 4}px`
  }

  closePopover(): void {
    this.popover.hidden = true
    this.popover.dataset.key = ''
  }

  private statusOf(p: Person): string {
    if (p.health <= 0) return '—'
    if (p.away) return t('status.away', { t: this.clockOf(p.away.returnAt) })
    if (p.wounded && (p.sleeping || p.job === null)) return t('status.wounded', { days: p.woundDays })
    if (p.sleeping) return t('status.sleeping')
    if (p.job?.kind === 'home') return t('status.home')
    if (p.isMoving) return t('status.walking')
    if (p.job) return t(`status.${p.job.kind}`)
    return t('status.idle')
  }

  updateRoster(state: GameState, selectedId: string | null): void {
    const key = state.people.map((p) => `${p.id}:${Math.round(p.health)}:${this.statusOf(p)}:${p.id === selectedId}:${Math.ceil(p.budgetMin / 60)}:${p.wounded}`).join('|')
    if (this.roster.dataset.key === key) return
    this.roster.dataset.key = key
    this.roster.replaceChildren(
      ...state.people.map((p) => {
        const card = document.createElement('button')
        card.className = `card ${p.id === selectedId ? 'selected' : ''} ${p.wounded ? 'wounded' : ''}`
        const img = document.createElement('img')
        img.src = `./art/${p.sprite}.png`
        img.alt = p.name
        const name = document.createElement('b')
        name.textContent = p.name
        const status = document.createElement('span')
        status.textContent = this.statusOf(p) // the hours are the white bar
        // Two bars: health (green) and work hours left today (white), same as over the head.
        const bar = document.createElement('div')
        bar.className = 'hp'
        const fill = document.createElement('div')
        fill.style.width = `${Math.max(0, p.health)}%`
        bar.appendChild(fill)
        const hours = document.createElement('div')
        hours.className = 'hp hours'
        const hfill = document.createElement('div')
        hfill.style.width = `${Math.max(0, Math.min(100, (p.budgetMin / (balance.calendar.workHoursPerDay * 60)) * 100))}%`
        hours.appendChild(hfill)
        card.append(img, name, status, bar, hours)
        card.addEventListener('click', () => this.cb.selectPerson(p.id))
        return card
      }),
    )
  }

  /** Rebuild the side sheet for the current target (cheap key check first). */
  updateSheet(state: GameState, temps: RoomTemps, target: SheetTarget, note: string): void {
    const targetKey = JSON.stringify(target)
    if (this.plan && targetKey !== this.planTarget) this.plan = null
    // While a plan is open its estimate moves with the clock and the stocks.
    const planKey = this.plan ? `${Math.floor(state.totalMinutes / STEP_MIN)}:${Math.floor(state.res.wood)}:${Math.floor(state.res.boards)}` : ''
    const tempsKey = [...temps.temps.values()].map((v) => Math.round(v)).join()
    const key = JSON.stringify([target, note, this.who, this.plan, planKey, tempsKey, this.sheetSignature(state, target)])
    if (key === this.lastSheetKey) return
    this.lastSheetKey = key
    this.sheet.replaceChildren()
    // Nothing selected: no panel at all, the map is the interface.
    this.sheet.hidden = target.kind === 'none'
    if (target.kind === 'none') return
    if (target.kind === 'person') this.personSheet(state, temps, target.id)
    else if (target.kind === 'section') this.sectionSheet(state, target.id)
    else if (target.kind === 'stove') this.stoveSheet(state, temps, target.id)
    else if (target.kind === 'tree') this.objectSheet(state, 'tree', 'chop')
    else if (target.kind === 'sawhorse') this.objectSheet(state, 'sawhorse', 'saw')
    else if (target.kind === 'house') this.houseSheet(state, target.id)
    if (note) this.sheet.append(this.line(note, 'note'))
  }

  private sheetSignature(state: GameState, target: SheetTarget): string {
    if (target.kind === 'section') {
      const s = state.section(target.id)
      return s ? `${s.state}:${s.hp}:${s.buffer}:${s.op}:${Math.floor(s.progress)}:${s.boarded}:${Math.floor(state.res.boards)}` : ''
    }
    if (target.kind === 'stove') return `${state.stoves[target.id]?.lit}:${Math.floor(state.res.wood + state.res.boards)}`
    if (target.kind === 'house') {
      const h = state.houses.find((x) => x.id === target.id)
      return h ? `${h.loot.food}:${h.loot.boards}:${h.loot.meds}:${h.visited}:${state.people.map((p) => `${p.id}${p.away ? '!' : ''}${p.budgetMin > 0}`).join()}` : ''
    }
    if (target.kind === 'person') {
      const p = state.person(target.id)
      return p ? `${Math.round(p.health)}:${this.statusOf(p)}:${p.budgetMin}:${p.woundDays}:${Math.floor(state.res.meds)}` : ''
    }
    return state.people.map((p) => `${p.wounded}:${p.budgetMin > 0}`).join()
  }

  private line(text: string, cls = ''): HTMLDivElement {
    const d = document.createElement('div')
    d.className = cls
    d.textContent = text
    return d
  }

  private button(label: string, sub: string, run: () => void, primary = false, disabled = false): HTMLButtonElement {
    const b = document.createElement('button')
    b.className = `action ${primary ? 'primary' : ''}`
    b.disabled = disabled
    const l = document.createElement('b')
    l.textContent = label
    b.appendChild(l)
    if (sub) {
      const s = document.createElement('span')
      s.textContent = sub
      b.appendChild(s)
    }
    b.addEventListener('click', run)
    return b
  }

  private whoRow(state: GameState): HTMLDivElement {
    const row = document.createElement('div')
    row.className = 'who'
    row.append(this.line(t('who'), 'label'))
    const free = state.people.filter((p) => p.health > 0)
    // A wounded worker is a valid pick (half pace); only the dead and the
    // out-of-hours are off the list. Auto-pick prefers the fit, the player's
    // own tap always sticks.
    const can = (p: Person): boolean => p.budgetMin > 0 && !p.away
    if (this.who === null || !free.some((p) => p.id === this.who && can(p))) {
      this.who = free.find((p) => !p.wounded && can(p))?.id ?? free.find(can)?.id ?? free[0]?.id ?? null
    }
    for (const p of free) {
      const chip = document.createElement('button')
      // Just the name: grey when they cannot take the job (out of hours). Busy
      // and wounded people can, so they look the same as the rest.
      chip.className = `chip ${p.id === this.who ? 'selected' : ''} ${can(p) ? '' : 'off'}`
      chip.textContent = p.name
      chip.addEventListener('click', () => {
        this.who = p.id
        this.lastSheetKey = ''
      })
      row.appendChild(chip)
    }
    return row
  }

  private personSheet(state: GameState, temps: RoomTemps, id: string): void {
    const p = state.person(id)
    if (!p) return
    this.sheet.append(
      this.line(p.name, 'title'),
      this.line(`${this.statusOf(p)} · ${t('person.health', { hp: Math.round(p.health) })}`, 'sub'),
      this.line(`${t('person.work', { work: p.work })} · ${t('person.speed', { speed: p.speed })} · ${t('status.budget', { h: Math.max(0, Math.ceil(p.budgetMin / 60)) })}`, 'sub'),
    )
    // Where they sleep and how cold it is there: the number the cold rule uses.
    const bedRoom = state.roomAt(p.home.c, p.home.r)
    const bedTemp = temps.temps.get(bedRoom) ?? -22
    this.sheet.append(this.line(t('person.sleeps', { room: this.roomLabel(state, bedRoom) ?? t('room.outside'), t: fmtTemp(bedTemp) }), bedTemp < 0 ? 'sub bad' : 'sub'))
    const cant = p.health <= 0 || p.away !== null
    if (p.away) this.sheet.append(this.line(t('person.away', { t: this.clockOf(p.away.returnAt) }), 'sub'))
    if (p.wounded) this.sheet.append(this.line(t('person.wounded', { days: p.woundDays }), 'sub'))
    const target = JSON.stringify({ kind: 'person', id })
    const kind = this.plan && this.plan.kind !== 'section' ? this.plan.kind : null
    this.sheet.append(
      this.button(t('action.chop'), '', () => this.openPlan(target, { kind: 'chop' }, p.id), kind === 'chop', cant),
      this.button(t('action.saw'), '', () => this.openPlan(target, { kind: 'saw' }, p.id), kind === 'saw', cant),
      this.button(t('action.cancel'), '', () => this.cb.assignJob(p.id, 'cancel'), false, p.job === null),
    )
    if (kind) this.sheet.append(this.planBlock(state))
    if (p.wounded) {
      this.sheet.append(
        this.button(t('action.treat'), t('action.treatSub', { meds: Math.floor(state.res.meds) }), () => this.cb.treatPerson(p.id), false, cant || state.res.meds < 1),
      )
    }
  }

  private sectionSheet(state: GameState, id: number): void {
    const s = state.section(id)
    if (!s) return
    const kindKey = s.kind === 'window' && s.boarded ? 'section.boarded' : `section.${s.kind}`
    this.sheet.append(
      this.line(`${t(kindKey)} · ${t(`state.${s.state}`)}`, 'title'),
      this.line(
        `${t('section.hp', { hp: Math.round(s.hp), max: maxHp(s) })}${s.buffer > 0 ? ` · ${t('section.buffer', { n: Math.round(s.buffer) })}` : ''}`,
        'sub',
      ),
    )
    if (s.op) {
      const pct = Math.min(99, Math.floor((s.progress / opCost(s.op).minutes) * 100))
      this.sheet.append(this.line(t('section.progress', { op: t(`action.${s.op}`), pct }), 'sub progress'))
    }
    const target = JSON.stringify({ kind: 'section', id })
    const chosen = this.plan && this.plan.kind === 'section' ? this.plan.op : null
    const ops = s.op ? [s.op] : availableOps(s)
    ops.forEach((op) => {
      const cost = opCost(op)
      const sub = s.op === op ? t('cost.free') : t('cost', { boards: cost.boards, hours: cost.minutes / 60 })
      const disabled = s.op !== op && state.res.boards < cost.boards
      this.sheet.append(this.button(t(`action.${op}`), sub, () => this.openPlan(target, { kind: 'section', sectionId: s.id, op }, null), chosen === op, disabled))
    })
    if (chosen) this.sheet.append(this.planBlock(state))
  }

  /** A workplace was tapped (the forest, the sawhorse): its one job, with the plan. */
  private objectSheet(state: GameState, kind: 'tree' | 'sawhorse', job: 'chop' | 'saw'): void {
    this.sheet.append(this.line(t(`${kind}.title`), 'title'), this.line(t(`${kind}.hint`), 'hint'))
    const open = this.plan !== null && this.plan.kind === job
    this.sheet.append(this.button(t(job === 'chop' ? 'action.chop' : 'action.saw'), '', () => this.openPlan(JSON.stringify({ kind }), { kind: job }, null), open, state.people.every((p) => p.health <= 0)))
    if (open) this.sheet.append(this.planBlock(state))
  }

  /** A house on the map: what is there, how far, how dangerous, and the plan to send someone. */
  private houseSheet(state: GameState, id: string): void {
    const house = state.houses.find((x) => x.id === id)
    if (!house) return
    this.sheet.append(this.line(t(`house.${house.type}`), 'title'))
    const looted = isLooted(house)
    this.sheet.append(this.line(looted ? t('house.looted') : t('house.loot', { list: this.lootList(house.loot) }), 'sub'))
    const dangerKey = house.danger >= 0.25 ? 'danger.high' : house.danger >= 0.12 ? 'danger.mid' : 'danger.low'
    this.sheet.append(this.line(`${t('house.travel', { t: this.clockDuration(house.travelMin) })} · ${t(dangerKey)}`, 'sub'))
    const target = JSON.stringify({ kind: 'house', id })
    const open = this.plan !== null && this.plan.kind === 'expedition'
    this.sheet.append(this.button(t('action.expedition'), '', () => this.openPlan(target, { kind: 'expedition', houseId: id }, null), open, looted || state.people.every((p) => p.health <= 0)))
    if (open) this.sheet.append(this.planBlock(state))
  }

  private lootList(loot: { food: number; boards: number; meds: number }): string {
    const parts: string[] = []
    if (loot.food > 0) parts.push(t('loot.food', { n: Math.floor(loot.food) }))
    if (loot.boards > 0) parts.push(t('loot.boards', { n: Math.floor(loot.boards) }))
    if (loot.meds > 0) parts.push(t('loot.meds', { n: Math.floor(loot.meds) }))
    return parts.length > 0 ? parts.join(' · ') : t('loot.nothing')
  }

  /** An action was tapped: show who could do it and what it would yield, then wait for 'Do it'. */
  private openPlan(target: string, plan: Plan, who: string | null): void {
    this.plan = plan
    this.planTarget = target
    if (who) this.who = who
    this.lastSheetKey = ''
  }

  private planBlock(state: GameState): HTMLDivElement {
    const box = document.createElement('div')
    box.className = 'plan'
    box.append(this.whoRow(state))
    const plan = this.plan!
    const p = this.who ? state.person(this.who) : undefined
    let ok = false
    if (plan.kind === 'expedition') {
      const house = state.houses.find((x) => x.id === plan.houseId)
      const est = p && house ? estimateExpedition(state, p, house) : null
      if (est) {
        ok = est.result === 'ok'
        if (!ok) box.append(this.line(t(`result.${est.result}`), 'sub estimate bad'))
        else {
          box.append(this.line(t('plan.trip', { t: this.clockDuration(est.minutes), at: this.clockOf(est.returnAt) }), 'sub estimate'))
          box.append(this.line(est.beforeDusk ? t('plan.beforeDusk', { t: this.clockDuration(est.duskMargin) }) : t('plan.afterDusk'), est.beforeDusk ? 'sub estimate' : 'sub estimate bad'))
          box.append(this.line(t('plan.brings', { list: this.lootList(est.loot) }), 'sub estimate'))
        }
      }
    } else {
      const est = p ? estimateJob(state, p, plan) : null
      if (est) box.append(this.line(this.estimateText(plan, est), est.result === 'ok' ? 'sub estimate' : 'sub estimate bad'))
      if (est?.danger) box.append(this.line(t('plan.danger'), 'sub estimate bad'))
      ok = est?.result === 'ok'
    }
    const run = (): void => {
      if (!this.who) return
      if (plan.kind === 'section') this.cb.assignSection(this.who, plan.sectionId, plan.op)
      else if (plan.kind === 'expedition') this.cb.sendExpedition(this.who, plan.houseId)
      else this.cb.assignJob(this.who, plan.kind)
      this.plan = null
      this.lastSheetKey = ''
    }
    box.append(
      this.button(t(plan.kind === 'expedition' ? 'plan.send' : 'plan.do'), '', run, true, !ok),
      this.button(t('plan.cancel'), '', () => {
        this.plan = null
        this.lastSheetKey = ''
      }),
    )
    return box
  }

  /** An icon and a text in a top-bar field, rebuilt only when the text changes. */
  private iconText(el: HTMLElement, icon: string, text: string): void {
    if (el.dataset.v === text) return
    el.dataset.v = text
    el.innerHTML = ICONS[icon] ?? ''
    el.append(text)
  }

  /** "4:50" for a span of minutes. */
  private clockDuration(min: number): string {
    const h = Math.floor(min / 60)
    const m = Math.round(min - h * 60)
    return `${h}:${String(m).padStart(2, '0')}`
  }

  private duration(min: number): string {
    const h = Math.floor(min / 60)
    const m = Math.round(min - h * 60)
    if (h > 0 && m > 0) return `${t('dur.h', { h })} ${t('dur.m', { m })}`
    return h > 0 ? t('dur.h', { h }) : t('dur.m', { m })
  }

  private estimateText(plan: Plan, est: JobEstimate): string {
    if (est.result !== 'ok' || plan.kind === 'expedition') return t(`result.${est.result}`)
    const parts = [t('plan.walk', { m: Math.round(est.walkMin) })]
    if (plan.kind === 'chop') parts.push(t('plan.chop', { t: this.duration(est.workMin), n: Math.round(est.wood) }))
    else if (plan.kind === 'saw') parts.push(t('plan.saw', { t: this.duration(est.workMin), n: Math.floor(est.boards) }))
    else {
      parts.push(t('plan.section', { t: this.duration(est.workMin) }))
      parts.push(est.boardsCost > 0 ? t('plan.boards', { n: est.boardsCost }) : t('plan.paid'))
      if (!est.enoughToday) parts.push(t('plan.notToday'))
    }
    return parts.join(' · ')
  }

  private stoveSheet(state: GameState, temps: RoomTemps, index: number): void {
    const st = state.stoves[index]
    if (!st) return
    const room = stoveRoom(state, index)
    const roomName = this.roomLabel(state, room) ?? t('room.hall')
    const temp = temps.temps.get(room) ?? -22
    this.sheet.append(
      this.line(t('stove.title', { room: roomName }), 'title'),
      this.line(`${st.lit ? t('stove.lit') : t('stove.cold')} · ${t('room.temp', { t: `${temp > 0 ? '+' : ''}${Math.round(temp)}` })}`, 'sub'),
      this.button(st.lit ? t('action.stoveOut') : t('action.stoveLight'), '', () => this.cb.toggleStove(index), !st.lit, !st.lit && state.res.wood + state.res.boards <= 0),
    )
  }

  toast(text: string, cls: '' | 'good' | 'bad' = ''): void {
    const d = document.createElement('div')
    d.className = `toast ${cls}`
    d.textContent = text
    d.addEventListener('click', () => d.remove())
    this.toasts.appendChild(d)
    setTimeout(() => d.remove(), 6000)
  }

  openModal(title: string, lines: string[], buttonLabel: string, onClose: () => void): void {
    this.modalBox.replaceChildren()
    const h = document.createElement('h2')
    h.textContent = title
    this.modalBox.appendChild(h)
    for (const l of lines) this.modalBox.appendChild(this.line(l, 'p'))
    const b = document.createElement('button')
    b.className = 'action primary'
    b.textContent = buttonLabel
    b.addEventListener('click', () => {
      if (performance.now() - this.modalShownAt < 180) return
      this.modal.style.display = 'none'
      onClose()
    })
    this.modalBox.appendChild(b)
    this.modal.style.display = 'flex'
    this.modalShownAt = performance.now()
  }

  /** A modal with several buttons (the start screen). */
  openChoice(title: string, lines: string[], buttons: Array<{ label: string; run: () => void; primary?: boolean }>): void {
    this.modalBox.replaceChildren()
    const h = document.createElement('h2')
    h.textContent = title
    this.modalBox.appendChild(h)
    for (const l of lines) this.modalBox.appendChild(this.line(l, 'p'))
    for (const { label, run, primary } of buttons) {
      const b = document.createElement('button')
      b.className = `action ${primary ? 'primary' : ''}`
      b.textContent = label
      b.addEventListener('click', () => {
        if (performance.now() - this.modalShownAt < 180) return
        this.modal.style.display = 'none'
        run()
      })
      this.modalBox.appendChild(b)
    }
    this.modal.style.display = 'flex'
    this.modalShownAt = performance.now()
  }

  get modalOpen(): boolean {
    return this.modal.style.display === 'flex'
  }
}
