import type { MemoSuggestion, RenderRecord } from '../types'
import type { PerfScanConfig } from './config'

export const MAX_RECORDS_PER_COMPONENT = 100
export const MAX_DASHBOARD_ENTRIES = 10
export const MAX_DIFF_ITEMS_DISPLAYED = 5
export const SUGGESTION_EXPLANATION_MAX_CHARS = 200
export const DIFF_VALUE_MAX_CHARS = 50
export const BADGE_COUNTER_MAX = 999

export interface LibraryState {
  initialized: boolean
  config: PerfScanConfig | null
  renderRecords: Map<string, RenderRecord[]>
  dismissedSuggestions: Set<string>
  activeSuggestions: Map<string, MemoSuggestion[]>
}

let state: LibraryState = {
  initialized: false,
  config: null,
  renderRecords: new Map(),
  dismissedSuggestions: new Set(),
  activeSuggestions: new Map(),
}

export function getState(): Readonly<LibraryState> {
  return state
}

export function setState(partial: Partial<LibraryState>): void {
  state = { ...state, ...partial }
}

export function resetState(): void {
  state = {
    initialized: false,
    config: null,
    renderRecords: new Map(),
    dismissedSuggestions: new Set(),
    activeSuggestions: new Map(),
  }
}

export function dismissKey(componentName: string, type: string): string {
  return `${componentName}:${type}`
}

export function addRecord(componentName: string, record: RenderRecord): void {
  const list = state.renderRecords.get(componentName) ?? []
  list.push(record)
  while (list.length > MAX_RECORDS_PER_COMPONENT) {
    list.shift()
  }
  state.renderRecords.set(componentName, list)
}

export function clearComponentRecords(componentName: string): void {
  state.renderRecords.delete(componentName)
}

export function setActiveSuggestions(componentName: string, list: MemoSuggestion[]): void {
  state.activeSuggestions.set(componentName, list)
}

export function getActiveSuggestions(): Map<string, MemoSuggestion[]> {
  return state.activeSuggestions
}

export function markDismissed(componentName: string, type: string): void {
  state.dismissedSuggestions.add(dismissKey(componentName, type))
}

export function isDismissed(componentName: string, type: string): boolean {
  return state.dismissedSuggestions.has(dismissKey(componentName, type))
}
