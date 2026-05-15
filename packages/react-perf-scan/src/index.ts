import type { PerfScanOptions } from './types'
import { validateConfig } from './core/config'
import { eventBus } from './core/eventBus'
import { memoSuggestionEngine } from './core/memoSuggestionEngine'
import { renderTracker } from './core/renderTracker'
import { getState, resetState, setState } from './core/state'
import { mountDashboard, unmountDashboard } from './ui/dashboardMount'
import { visualHighlighter } from './ui/visualHighlighter'

export type { DashboardPosition, MemoSuggestion, PerfScanOptions, PropDiff, RenderRecord, StateDiff, SuggestionType } from './types'

/**
 * Initialize `react-perf-scan` in development.
 *
 * @param options - Optional tuning for flashing, dashboard placement, and tracking scope
 * @returns `void`
 *
 * @remarks
 * Call this **before** `react-dom/client` `createRoot(...).render(...)` so the library can wrap your tree with a React `Profiler`.
 *
 * @example
 * ```tsx
 * import { initPerfScan } from 'react-perf-scan'
 *
 * initPerfScan({ dashboardPosition: 'bottom-right' })
 * ```
 */
export function initPerfScan(options?: PerfScanOptions): void {
  try {
    if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'development') return
    if (getState().initialized) return

    const config = validateConfig(options)
    if (!config.enabled) return

    setState({ initialized: true, config })
    renderTracker.init(config)
    visualHighlighter.init(config)
    memoSuggestionEngine.init(config)
    mountDashboard(config)
  } catch (e) {
    console.error('[react-perf-scan]', e)
  }
}

/**
 * Tear down all instrumentation created by {@link initPerfScan}.
 *
 * @returns `void`
 *
 * @example
 * ```tsx
 * import { destroyPerfScan } from 'react-perf-scan'
 *
 * destroyPerfScan()
 * ```
 */
export function destroyPerfScan(): void {
  try {
    visualHighlighter.destroy()
    renderTracker.destroy()
    memoSuggestionEngine.destroy()
    unmountDashboard()
    eventBus.clear()
    resetState()
  } catch (e) {
    console.error('[react-perf-scan]', e)
  }
}
