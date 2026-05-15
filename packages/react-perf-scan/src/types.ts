/**
 * Public configuration and data types for `react-perf-scan`.
 *
 * @packageDocumentation
 */

/** Corner position of the floating dashboard overlay. */
export type DashboardPosition =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'

/** Optional configuration passed to {@link initPerfScan}. */
export interface PerfScanOptions {
  /** When `false`, the library does not install any instrumentation. @default true */
  enabled?: boolean
  /** CSS color used for the wasted-render flash outline. @default "rgba(255, 0, 0, 0.3)" */
  flashColor?: string
  /** Flash duration in milliseconds (1–60000). @default 500 */
  flashDuration?: number
  /** Dashboard corner. Invalid values fall back to `bottom-right`. @default "bottom-right" */
  dashboardPosition?: DashboardPosition
  /** Minimum consecutive wasted renders before memo suggestions. @default 3 */
  renderThreshold?: number
  /** If non-empty, only these display names are tracked (case-sensitive). @default [] */
  trackComponents?: string[]
}

export type SuggestionType = 'memo' | 'useMemo' | 'useCallback'

/** A generated memoization hint with copy-ready code. */
export interface MemoSuggestion {
  componentName: string
  type: SuggestionType
  codeSnippet: string
  explanation: string
  isDismissed: boolean
}

export type PropDiffChangeType = 'added' | 'removed' | 'changed'

/** Describes a single prop key change between renders. */
export interface PropDiff {
  key: string
  prevValue: unknown
  nextValue: unknown
  changeType: PropDiffChangeType
}

/** Same shape as {@link PropDiff} but for extracted hook state snapshots. */
export type StateDiff = PropDiff

/** One committed render observation for a component display name. */
export interface RenderRecord {
  componentName: string
  timestamp: number
  duration: number
  phase: 'mount' | 'update'
  propDiff: PropDiff[]
  stateDiff: StateDiff[] | null
  isWasted: boolean
}
