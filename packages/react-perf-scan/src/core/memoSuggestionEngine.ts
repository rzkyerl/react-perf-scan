import type { MemoSuggestion, PropDiff, RenderRecord, SuggestionType } from '../types'
import type { PerfScanConfig } from './config'
import { eventBus } from './eventBus'
import {
  SUGGESTION_EXPLANATION_MAX_CHARS,
  getActiveSuggestions,
  isDismissed,
  markDismissed,
  setActiveSuggestions,
} from './state'

const RATIO = 0.8

function clipExplanation(s: string): string {
  if (s.length <= SUGGESTION_EXPLANATION_MAX_CHARS) return s
  return s.slice(0, SUGGESTION_EXPLANATION_MAX_CHARS - 1) + '…'
}

function getPropType(value: unknown): 'function' | 'object' | 'array' | 'primitive' {
  if (typeof value === 'function') return 'function'
  if (Array.isArray(value)) return 'array'
  if (value !== null && typeof value === 'object') return 'object'
  return 'primitive'
}

function emitNewSuggestions(next: MemoSuggestion[], prev: MemoSuggestion[]): void {
  const prevTypes = new Set(prev.map((s) => s.type))
  for (const s of next) {
    if (!prevTypes.has(s.type)) {
      eventBus.emit('suggestion-generated', { suggestion: s })
    }
  }
}

function collectChangedKeys(records: RenderRecord[], pred: (d: PropDiff) => boolean): string[] {
  const keys = new Set<string>()
  for (const r of records) {
    for (const d of r.propDiff) {
      if (pred(d)) keys.add(d.key)
    }
  }
  return [...keys].slice(0, 5)
}

/**
 * Analyzes recent {@link RenderRecord} values and emits memoization suggestions.
 */
export const memoSuggestionEngine = {
  init(_config: PerfScanConfig): void {},

  analyze(componentName: string, records: RenderRecord[], config: PerfScanConfig): void {
    const wasted = records.filter((r) => r.isWasted)
    if (wasted.length < config.renderThreshold) return

    const updates = records.filter((r) => r.phase === 'update')

    const unchangedPropsWasted = wasted.filter((r) => r.propDiff.length === 0).length
    const unchangedPropsRatio = unchangedPropsWasted / Math.max(1, wasted.length)

    const fnPropDiffUpdates = updates.filter((r) =>
      r.propDiff.some((d) => getPropType(d.prevValue) === 'function' || getPropType(d.nextValue) === 'function'),
    )
    const newFunctionRefRatio = fnPropDiffUpdates.length / Math.max(1, updates.length)

    const objPropDiffUpdates = updates.filter((r) =>
      r.propDiff.some((d) => {
        const t1 = getPropType(d.prevValue)
        const t2 = getPropType(d.nextValue)
        return t1 === 'object' || t1 === 'array' || t2 === 'object' || t2 === 'array'
      }),
    )
    const newObjectRefRatio = objPropDiffUpdates.length / Math.max(1, updates.length)

    const prev = getActiveSuggestions().get(componentName) ?? []
    const byType = new Map<SuggestionType, MemoSuggestion>()
    for (const s of prev) {
      if (!isDismissed(componentName, s.type)) byType.set(s.type, s)
    }

    const upsert = (type: SuggestionType, snippet: string, explanation: string) => {
      if (isDismissed(componentName, type)) return
      const suggestion: MemoSuggestion = {
        componentName,
        type,
        codeSnippet: snippet,
        explanation: clipExplanation(explanation),
        isDismissed: false,
      }
      byType.set(type, suggestion)
    }

    if (unchangedPropsRatio >= RATIO) {
      upsert(
        'memo',
        `export const ${componentName}Memo = React.memo(${componentName});`,
        `Most wasted renders keep identical props by reference. Wrapping ${componentName} with React.memo() can skip re-renders when parents update.`,
      )
    } else {
      byType.delete('memo')
    }

    if (newFunctionRefRatio >= RATIO) {
      const keys = collectChangedKeys(fnPropDiffUpdates, (d) => getPropType(d.nextValue) === 'function')
      if (keys.length > 0) {
        const body = keys.map((k) => `const ${k} = useCallback(() => {\n  // ...\n}, [/* deps */]);`).join('\n\n')
        upsert(
          'useCallback',
          body,
          `Function props (${keys.join(', ')}) frequently change identity across renders. Stabilize them with useCallback in the parent.`,
        )
      } else {
        byType.delete('useCallback')
      }
    } else {
      byType.delete('useCallback')
    }

    if (newObjectRefRatio >= RATIO) {
      const keys = collectChangedKeys(objPropDiffUpdates, (d) => {
        const t = getPropType(d.nextValue)
        return t === 'object' || t === 'array'
      })
      if (keys.length > 0) {
        const body = keys.map((k) => `const ${k} = useMemo(() => ({\n  // ...\n}), [/* deps */]);`).join('\n\n')
        upsert(
          'useMemo',
          body,
          `Object/array props (${keys.join(', ')}) often get new references. Memoize them in the parent with useMemo.`,
        )
      } else {
        byType.delete('useMemo')
      }
    } else {
      byType.delete('useMemo')
    }

    const merged = [...byType.values()]
    setActiveSuggestions(componentName, merged)
    emitNewSuggestions(merged, prev)
  },

  dismiss(componentName: string, type: SuggestionType): void {
    markDismissed(componentName, type)
    eventBus.emit('suggestion-dismissed', { componentName, suggestionType: type })
    const list = (getActiveSuggestions().get(componentName) ?? []).filter((s) => s.type !== type)
    setActiveSuggestions(componentName, list)
  },

  destroy(): void {},
}
