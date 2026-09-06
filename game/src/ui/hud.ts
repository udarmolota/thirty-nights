/**
 * DOM interface: the top bar, the roster, the action sheet, toasts and
 * modals. It reads the sim and calls back into main for actions; it never
 * mutates the sim itself.
 */
import { t } from '../core/i18n'
import type { GameState } from '../sim/state'
import type { Person } from '../sim/person'
import { availableOps, maxHp, opCost, type SectionOp } from '../sim/sections'
import { bedroomTemp, stoveRoom, type RoomTemps } from '../sim/heat'
import { foodDays } from '../sim/economy'
import { daylightHours, daylightLeft, dayOf, hourOf, isDaylight, NIGHT_DAYS, nightOf, PREP_DAYS } from '../sim/time'

export interface HudCallbacks {
  setSpeed: (speed: number) => void
  toMorning: () => void
  selectPerson: (id: string) => void
  assignJob: (personId: string, job: 'chop' | 'saw' | 'split' | 'cancel') => void
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
    const items: Array<[string, string, string]> = [
      ['temp', `${temp > 0 ? '+' : ''}${Math.round(temp)}°`, temp < 0 ? 'bad' : ''],
      ['food', `${fmt(state.res.food)} (${t('hud.foodDays', { n: foodDays(state) })})`, state.res.food < state.people.length * 3 ? 'bad' : ''],
      ['logs', fmt(state.res.logs), ''],
      ['boards', fmt(state.res.boards), state.res.boards < 4 ? 'bad' : ''],
      ['fuel', fmt(state.res.fuel), state.res.fuel < 24 ? 'bad' : ''],
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
    const key = JSON.stringify([target, note, this.who, this.sheetSignature(state, target)])
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
    if (target.kind === 'person') this.personSheet(state, target.id)
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
    if (target.kind === 'stove') return `${state.stoves[target.id]?.lit}:${Math.floor(state.res.fuel)}`
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
    if (this.who === null || !free.some((p) => p.id === this.who && !p.wounded && p.budgetMin > 0)) {
      this.who = free.find((p) => !p.wounded && p.budgetMin > 0)?.id ?? free[0]?.id ?? null
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

  private personSheet(state: GameState, id: string): void {
    const p = state.person(id)
    if (!p) return
    this.sheet.append(
      this.line(p.name, 'title'),
      this.line(`${this.statusOf(p)} · ${t('person.health', { hp: Math.round(p.health) })}`, 'sub'),
      this.line(`${t('person.work', { work: p.work })} · ${t('person.speed', { speed: p.speed })} · ${t('status.budget', { h: Math.max(0, Math.ceil(p.budgetMin / 60)) })}`, 'sub'),
    )
    const cant = p.health <= 0
    if (p.wounded) this.sheet.append(this.line(t('person.wounded', { days: p.woundDays }), 'sub'))
    this.sheet.append(
      this.button(t('action.chop'), '', () => this.cb.assignJob(p.id, 'chop'), true, cant),
      this.button(t('action.saw'), '', () => this.cb.assignJob(p.id, 'saw'), false, cant),
      this.button(t('action.split'), '', () => this.cb.assignJob(p.id, 'split'), false, cant),
      this.button(t('action.cancel'), '', () => this.cb.assignJob(p.id, 'cancel'), false, p.job === null),
    )
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
    this.sheet.append(this.whoRow(state))
    const ops = s.op ? [s.op] : availableOps(s)
    ops.forEach((op, i) => {
      const cost = opCost(op)
      const sub = s.op === op ? t('cost.free') : t('cost', { boards: cost.boards, hours: cost.minutes / 60 })
      const disabled = this.who === null || (s.op !== op && state.res.boards < cost.boards)
      this.sheet.append(this.button(t(`action.${op}`), sub, () => this.who && this.cb.assignSection(this.who, s.id, op), i === 0, disabled))
    })
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
      this.button(st.lit ? t('action.stoveOut') : t('action.stoveLight'), '', () => this.cb.toggleStove(index), !st.lit, !st.lit && state.res.fuel <= 0),
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
