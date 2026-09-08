/**
 * Sim -> UI outbox. The simulation never touches the DOM; it appends events
 * here and main.ts drains them after each step (pauses, toasts, modals).
 */
import type { GameState, NightReport } from './state'

export type SimEvent =
  | { type: 'morning'; day: number; night: number; report: NightReport }
  | { type: 'nightFalls'; night: number; kind: 'assault' | 'probe' | 'quiet'; attackers: number }
  | { type: 'fenceHole'; sectionId: number }
  | { type: 'yardBreach'; night: number }
  | { type: 'wallHole'; sectionId: number }
  | { type: 'peopleAttacked'; sectionId: number }
  | { type: 'wounded'; personId: string }
  | { type: 'recovered'; personId: string }
  | { type: 'expeditionLeft'; personId: string; houseId: string; returnAt: number }
  | { type: 'expeditionReturn'; personId: string; houseId: string; loot: { food: number; boards: number; meds: number }; late: boolean; hurt: boolean }
  | { type: 'burningBoards' }
  | { type: 'stoveOut'; stoveIndex: number }
  | { type: 'jobDone'; personId: string; job: string }
  | { type: 'dawn' }
  | { type: 'gameOver'; reason: 'frozen' | 'starved' | 'killed' }

export function emit(state: GameState, ev: SimEvent): void {
  state.events.push(ev)
}
