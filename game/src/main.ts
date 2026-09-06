/**
 * Boot: build the base, wire loop + camera + input + renderer + HUD, drain
 * sim events into pauses, toasts and modals. No gameplay rules live here.
 */
import { GameLoop } from './core/loop'
import { setLang, t } from './core/i18n'
import { parseParams, STOCK_KEYS } from './core/params'
import { buildBase, MAP_H, MAP_W } from './sim/base'
import { computeTemps, type RoomTemps } from './sim/heat'
import { assignChop, assignSaw, assignSection, cancelJob, treat, type AssignResult } from './sim/jobs'
import { GameState } from './sim/state'
import { simStep } from './sim/tick'
import { dayOf, daylightHours, hourOf, nightOf, NIGHT_DAYS, PREP_DAYS } from './sim/time'
import type { SimEvent } from './sim/events'
import { Camera, TILE_PX } from './render/camera'
import { Renderer, type Selection } from './render/renderer'
import { Sprites } from './render/sprites'
import { InputController } from './ui/input'
import { Hud, type SheetTarget } from './ui/hud'
import { bedroomTemp } from './sim/heat'
import { foodDays } from './sim/economy'
import type { SectionOp } from './sim/sections'

/** Real milliseconds per 10-minute step at speed x1: an hour in 12 seconds. */
const TICK_MS = 2000

function main(): void {
  const params = parseParams(location.search)
  setLang(params.lang)

  const state = new GameState(params.seed, MAP_W, MAP_H)
  buildBase(state)
  if (params.startMinutes !== null) {
    state.totalMinutes = params.startMinutes
    state.lastMorningDay = state.day
  }
  for (const key of STOCK_KEYS) {
    const n = params.stocks[key]
    if (n !== undefined) state.res[key] = n
  }

  const canvas = document.getElementById('game') as HTMLCanvasElement
  const camera = new Camera(MAP_W, MAP_H)
  const sprites = new Sprites()
  const renderer = new Renderer(canvas, camera, sprites)

  let temps: RoomTemps = computeTemps(state)
  let sel: Selection = { kind: null, id: 0 }
  let note = ''
  let toMorning = false
  let speedBeforeModal = 1

  const loop = new GameLoop(TICK_MS, () => onTick(), (alpha) => onRender(alpha))

  const setSpeed = (s: number): void => {
    toMorning = false
    loop.speed = s
    hud.setSpeedActive(s, false)
  }
  const pause = (): void => setSpeed(0)

  const report = (personName: string, res: AssignResult): void => {
    note = res === 'ok' ? t('result.ok', { name: personName }) : t(`result.${res}`)
  }

  const hud = new Hud({
    setSpeed,
    toMorning: () => {
      toMorning = true
      loop.speed = 12
      hud.setSpeedActive(12, true)
    },
    selectPerson: (id) => {
      sel = { kind: 'person', id }
      note = ''
    },
    assignJob: (personId, job) => {
      const p = state.person(personId)
      if (!p) return
      if (job === 'cancel') {
        cancelJob(p)
        note = ''
        return
      }
      const res = job === 'chop' ? assignChop(state, p) : assignSaw(state, p)
      report(p.name, res)
    },
    assignSection: (personId, sectionId, op: SectionOp) => {
      const p = state.person(personId)
      if (!p) return
      report(p.name, assignSection(state, p, sectionId, op))
    },
    treatPerson: (personId) => {
      const p = state.person(personId)
      if (!p) return
      report(p.name, treat(state, p))
    },
    toggleStove: (index) => {
      const st = state.stoves[index]
      if (!st) return
      if (!st.lit && state.res.wood + state.res.boards <= 0) return
      st.lit = !st.lit
      temps = computeTemps(state)
    },
  })

  // Tile -> section lookup for hit tests.
  const sectionByTile = new Map<number, number>()
  for (const s of state.sections) for (const tile of s.tiles) sectionByTile.set(state.grid.idx(tile.c, tile.r), s.id)

  const pickPerson = (fc: number, fr: number): string | null => {
    let best: string | null = null
    let bestD = 1.1
    for (const p of state.people) {
      if (p.health <= 0) continue
      const d = Math.hypot(fc - (p.pos.c + 0.5), fr - (p.pos.r + 0.5))
      if (d < bestD) {
        bestD = d
        best = p.id
      }
    }
    return best
  }

  const onTap = (c: number, r: number, fc: number, fr: number): void => {
    note = ''
    const person = pickPerson(fc, fr)
    if (person) {
      sel = sel.kind === 'person' && sel.id === person ? { kind: null, id: 0 } : { kind: 'person', id: person }
      return
    }
    if (!state.grid.inBounds(c, r)) return
    const stoveIdx = state.stoves.findIndex((s) => s.c === c && s.r === r)
    if (stoveIdx >= 0) {
      sel = { kind: 'stove', id: stoveIdx }
      return
    }
    const sectionId = sectionByTile.get(state.grid.idx(c, r))
    if (sectionId !== undefined) {
      sel = { kind: 'section', id: sectionId }
      return
    }
    if (state.grid.treesAt(c, r) > 0) {
      sel = { kind: 'tree', id: state.grid.idx(c, r) }
      return
    }
    sel = { kind: null, id: 0 }
  }
  new InputController(canvas, camera, onTap, onTap)

  const sheetTarget = (): SheetTarget => {
    if (sel.kind === 'person') return { kind: 'person', id: sel.id as string }
    if (sel.kind === 'section') return { kind: 'section', id: sel.id as number }
    if (sel.kind === 'stove') return { kind: 'stove', id: sel.id as number }
    if (sel.kind === 'tree') return { kind: 'tree' }
    return { kind: 'none' }
  }

  const openModal = (title: string, lines: string[], label: string, after?: () => void): void => {
    speedBeforeModal = toMorning ? 1 : loop.speed || 1
    loop.speed = 0
    hud.setSpeedActive(0, false)
    toMorning = false
    hud.openModal(title, lines, label, () => {
      if (after) after()
      else setSpeed(speedBeforeModal)
    })
  }

  const onSimEvent = (ev: SimEvent): void => {
    switch (ev.type) {
      case 'morning': {
        const lines: string[] = []
        if (ev.night === 0) lines.push(t('morning.summer', { n: PREP_DAYS - ev.day + 1, h: daylightHours(ev.day) }))
        else {
          lines.push(t('morning.nightNo', { night: ev.night, total: NIGHT_DAYS }))
          const log = ev.report
          if (log.fenceHoles === 0 && log.wallHoles === 0 && !log.breached) lines.push(t('morning.calm'))
          if (log.fenceHoles > 0) lines.push(t('morning.holes', { n: log.fenceHoles }))
          if (log.breached) lines.push(t('morning.breach'))
          if (log.wallHoles > 0) lines.push(t('morning.walls', { n: log.wallHoles }))
          if (log.wounded.length > 0) lines.push(t('morning.wounded', { names: log.wounded.map((id) => state.person(id)?.name ?? id).join(', ') }))
        }
        lines.push(state.hungryToday ? t('morning.hungry') : t('morning.food', { food: Math.floor(state.res.food), days: foodDays(state) }))
        const temp = bedroomTemp(state, temps)
        lines.push(t('morning.temp', { t: `${temp > 0 ? '+' : ''}${Math.round(temp)}` }))
        // Every day starts paused: read the report, look around, then press play.
        openModal(t('morning.title', { day: ev.day }), lines, t('morning.ok'), () => pause())
        break
      }
      case 'nightFalls':
        hud.toast(t(`toast.${ev.kind}`, { night: ev.night, n: ev.attackers }), ev.kind === 'assault' ? 'bad' : '')
        if (ev.kind === 'assault') pause()
        break
      case 'fenceHole':
        hud.toast(t('toast.fenceHole'), 'bad')
        sel = { kind: 'section', id: ev.sectionId }
        pause()
        break
      case 'yardBreach':
        hud.toast(t('toast.yardBreach'), 'bad')
        pause()
        break
      case 'wallHole':
        hud.toast(t('toast.wallHole'), 'bad')
        sel = { kind: 'section', id: ev.sectionId }
        pause()
        break
      case 'peopleAttacked':
        hud.toast(t('toast.peopleAttacked'), 'bad')
        pause()
        break
      case 'wounded':
        hud.toast(t('toast.wounded', { name: state.person(ev.personId)?.name ?? ev.personId }), 'bad')
        break
      case 'recovered':
        hud.toast(t('toast.recovered', { name: state.person(ev.personId)?.name ?? ev.personId }), 'good')
        break
      case 'burningBoards':
        hud.toast(t('toast.burningBoards'), 'bad')
        pause()
        break
      case 'stoveOut':
        hud.toast(t('toast.stoveOut'), 'bad')
        pause()
        break
      case 'jobDone':
        hud.toast(t('toast.jobDone', { name: state.person(ev.personId)?.name ?? ev.personId }), 'good')
        break
      case 'dawn':
        openModal(t('dawn.title'), [t('dawn.text')], t('dawn.restart'), () => location.reload())
        break
      case 'gameOver':
        openModal(t('gameover.title'), [t(`gameover.${ev.reason}`)], t('gameover.restart'), () => location.reload())
        break
    }
  }

  function onTick(): void {
    if (hud.modalOpen) return
    const info = simStep(state)
    temps = info.temps
    for (const ev of state.events.splice(0)) onSimEvent(ev)
    if (toMorning && hourOf(state.totalMinutes) >= 6 && hourOf(state.totalMinutes) < 6.2) setSpeed(1)
  }

  function onRender(alpha: number): void {
    renderer.render(state, temps, alpha, sel, performance.now())
    hud.updateTop(state, temps)
    hud.updateRoster(state, sel.kind === 'person' ? (sel.id as string) : null)
    hud.updateSheet(state, temps, sheetTarget(), note)
  }

  const fit = (): void => {
    renderer.resize()
    const z = Math.min(camera.viewW / (MAP_W * TILE_PX), camera.viewH / (MAP_H * TILE_PX)) * 0.98
    camera.zoom = Math.max(0.5, Math.min(4, z))
    camera.x = MAP_W / 2
    camera.y = MAP_H / 2 + 1
    camera.setViewport(camera.viewW, camera.viewH)
  }
  window.addEventListener('resize', () => renderer.resize())
  fit()

  sprites.load().then(() => {
    hud.setSpeedActive(1, false)
    loop.start()
  })

  // Dev hook for browser-driven checks (the pane throttles rAF when hidden).
  if (import.meta.env.DEV) {
    ;(window as unknown as { __game: unknown }).__game = {
      state,
      step: onTick,
      render: () => onRender(0),
      loop,
      camera,
      day: () => dayOf(state.totalMinutes),
      night: () => nightOf(dayOf(state.totalMinutes)),
      select: (s: Selection) => (sel = s),
    }
  }
}

main()
