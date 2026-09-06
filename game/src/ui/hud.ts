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
import { STEP_MIN } from '../sim/time'
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
import { daylightHours, daylightLeft, dayOf, hourOf, isDaylight, NIGHT_DAYS, nightOf, PREP_DAYS } from '../sim/time'

export interface HudCallbacks {
  setSpeed: (speed: number) => void
  toMorning: () => void
  selectPerson: (id: string) => void
  assignJob: (personId: string, job: 'chop' | 'saw' | 'cancel') => void
  assignSection: (personId: string, sectionId: number, op: SectionOp) => void
  treatPerson: (personId: string) => void
  toggleStove: (index: number) => void
}

export type SheetTarget =
  | { kind: 'person'; id: string }
  | { kind: 'section'; id: number }
  | { kind: 'stove'; id: number }
  | { kind: 'tree' }
  | { kind: 'none' }

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T
}

function fmt(n: number): string {
  return String(Math.floor(n))
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

  constructor(private readonly cb: HudCallbacks) {
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
    this.phase.textContent =
      night === 0
        ? `${t('hud.day', { day })} · ${t('hud.untilNight', { n: PREP_DAYS - day + 1 })}`
        : t('hud.night', { night, total: NIGHT_DAYS })
    const h = hourOf(state.totalMinutes)
    const hh = Math.floor(h)
    const mm = Math.round((h - hh) * 60)
    this.clock.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
    if (night > 0) this.light.textContent = t('hud.dark')
    else if (isDaylight(state.totalMinutes)) this.light.textContent = t('hud.lightLeft', { h: (daylightLeft(state.totalMinutes) / 60).toFixed(1) })
    else this.light.textContent = t('hud.light', { h: daylightHours(day) })
    this.light.classList.toggle('dark', night > 0 || !isDaylight(state.totalMinutes))

    const temp = bedroomTemp(state, temps)
    // Firewood shows how long the lit stoves can go on it; red under a day.
    const lit = state.stoves.filter((s) => s.lit).length
    const woodHours = lit > 0 ? Math.floor(state.res.wood / lit) : -1
    const woodText = woodHours >= 0 ? `${fmt(state.res.wood)} (${t('hud.woodHours', { h: woodHours })})` : fmt(state.res.wood)
    const items: Array<[string, string, string]> = [
      ['temp', `${temp > 0 ? '+' : ''}${Math.round(temp)}°`, temp < 0 ? 'bad' : ''],
      ['food', `${fmt(state.res.food)} (${t('hud.foodDays', { n: foodDays(state) })})`, state.res.food < state.people.length * 3 ? 'bad' : ''],
      ['wood', woodText, state.burningBoards || (lit > 0 && woodHours < 24) ? 'bad' : ''],
      ['boards', fmt(state.res.boards), state.res.boards < 4 ? 'bad' : ''],
      ['meds', fmt(state.res.meds), ''],
    ]
    const key = items.map((i) => i[1] + i[2]).join('|')
    if (this.res.dataset.key === key) return
    this.res.dataset.key = key
    this.res.replaceChildren(
      ...items.map(([k, v, cls]) => {
        const d = document.createElement('div')
        d.className = `resitem ${cls}`
        const val = document.createElement('b')
        val.textContent = v
        const lab = document.createElement('span')
        lab.textContent = t(`hud.${k}`)
        d.append(val, lab)
        return d
      }),
    )
  }

  private statusOf(p: Person): string {
    if (p.health <= 0) return '—'
    if (p.wounded && (p.sleeping || p.job === null)) return t('status.wounded', { days: p.woundDays })
    if (p.sleeping) return t('status.sleeping')
    if (p.job?.kind === 'home') return t('status.home')
    if (p.isMoving) return t('status.walking')
    if (p.job) return t(`status.${p.job.kind}`)
    return t('status.idle')
  }

  updateRoster(state: GameState, selectedId: string | null): void {
    const key = state.people.map((p) => `${p.id}:${Math.round(p.health)}:${this.statusOf(p)}:${p.id === selectedId}:${Math.ceil(p.budgetMin / 60)}`).join('|')
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
        status.textContent = `${this.statusOf(p)} · ${t('status.budget', { h: Math.max(0, Math.ceil(p.budgetMin / 60)) })}`
        const bar = document.createElement('div')
        bar.className = 'hp'
        const fill = document.createElement('div')
        fill.style.width = `${Math.max(0, p.health)}%`
        bar.appendChild(fill)
        card.append(img, name, status, bar)
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
    if (target.kind === 'none') {
      this.sheet.classList.add('empty')
      this.sheet.append(this.line(t('select.hint'), 'hint'))
      if (note) this.sheet.append(this.line(note, 'note'))
      return
    }
    this.sheet.classList.remove('empty')
    if (target.kind === 'person') this.personSheet(state, temps, target.id)
    else if (target.kind === 'section') this.sectionSheet(state, target.id)
    else if (target.kind === 'stove') this.stoveSheet(state, temps, target.id)
    else {
      this.sheet.append(this.line(t('tree.title'), 'title'), this.line(t('tree.hint'), 'hint'))
    }
    if (note) this.sheet.append(this.line(note, 'note'))
  }

  private sheetSignature(state: GameState, target: SheetTarget): string {
    if (target.kind === 'section') {
      const s = state.section(target.id)
      return s ? `${s.state}:${s.hp}:${s.buffer}:${s.op}:${Math.floor(s.progress)}:${s.boarded}:${Math.floor(state.res.boards)}` : ''
    }
    if (target.kind === 'stove') return `${state.stoves[target.id]?.lit}:${Math.floor(state.res.wood + state.res.boards)}`
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
    if (this.who === null || !free.some((p) => p.id === this.who && p.budgetMin > 0)) {
      this.who = free.find((p) => !p.wounded && p.budgetMin > 0)?.id ?? free.find((p) => p.budgetMin > 0)?.id ?? free[0]?.id ?? null
    }
    for (const p of free) {
      const chip = document.createElement('button')
      chip.className = `chip ${p.id === this.who ? 'selected' : ''}`
      const flag = p.wounded ? t('chip.wounded') : p.budgetMin <= 0 ? t('chip.tired') : p.job && p.job.kind !== 'home' ? t('chip.busy') : ''
      chip.textContent = flag ? `${p.name} · ${flag}` : p.name
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
    const cant = p.health <= 0
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
    const est = p ? estimateJob(state, p, plan) : null
    if (est) box.append(this.line(this.estimateText(plan, est), est.result === 'ok' ? 'sub estimate' : 'sub estimate bad'))
    const run = (): void => {
      if (!this.who) return
      if (plan.kind === 'section') this.cb.assignSection(this.who, plan.sectionId, plan.op)
      else this.cb.assignJob(this.who, plan.kind)
      this.plan = null
      this.lastSheetKey = ''
    }
    box.append(
      this.button(t('plan.do'), '', run, true, !est || est.result !== 'ok'),
      this.button(t('plan.cancel'), '', () => {
        this.plan = null
        this.lastSheetKey = ''
      }),
    )
    return box
  }

  private duration(min: number): string {
    const h = Math.floor(min / 60)
    const m = Math.round(min - h * 60)
    if (h > 0 && m > 0) return `${t('dur.h', { h })} ${t('dur.m', { m })}`
    return h > 0 ? t('dur.h', { h }) : t('dur.m', { m })
  }

  private estimateText(plan: Plan, est: JobEstimate): string {
    if (est.result !== 'ok') return t(`result.${est.result}`)
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
    const roomName = t(index === 0 ? 'room.hall' : index === 1 ? 'room.office' : 'room.store')
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

  get modalOpen(): boolean {
    return this.modal.style.display === 'flex'
  }
}
