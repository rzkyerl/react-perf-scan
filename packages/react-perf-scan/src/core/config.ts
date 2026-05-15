import type { DashboardPosition, PerfScanOptions } from '../types'

const DEFAULT_FLASH_COLOR = 'rgba(255, 0, 0, 0.3)'
const DEFAULT_FLASH_DURATION = 500
const DEFAULT_DASHBOARD_POSITION: DashboardPosition = 'bottom-right'
const DEFAULT_RENDER_THRESHOLD = 3

const VALID_POSITIONS = new Set<DashboardPosition>([
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
])

export interface PerfScanConfig {
  enabled: boolean
  flashColor: string
  flashDuration: number
  dashboardPosition: DashboardPosition
  renderThreshold: number
  trackComponents: string[]
}

function warnInvalid(prop: string, received: unknown, fallback: unknown): void {
  console.warn(
    `[react-perf-scan/config] Invalid value for "${prop}": ${String(received)}. Using default: ${String(fallback)}.`,
  )
}

/**
 * Validates user options and returns a fully-resolved config object.
 *
 * @param options - Partial options from the host app
 * @returns Resolved configuration with safe defaults
 */
export function validateConfig(options?: PerfScanOptions): PerfScanConfig {
  const o = options ?? {}

  let flashDuration =
    typeof o.flashDuration === 'number' && Number.isFinite(o.flashDuration)
      ? Math.trunc(o.flashDuration)
      : DEFAULT_FLASH_DURATION
  if (flashDuration < 1 || flashDuration > 60_000) {
    warnInvalid('flashDuration', o.flashDuration, DEFAULT_FLASH_DURATION)
    flashDuration = DEFAULT_FLASH_DURATION
  }

  let renderThreshold =
    typeof o.renderThreshold === 'number' && Number.isFinite(o.renderThreshold)
      ? Math.trunc(o.renderThreshold)
      : DEFAULT_RENDER_THRESHOLD
  if (renderThreshold < 1) {
    warnInvalid('renderThreshold', o.renderThreshold, DEFAULT_RENDER_THRESHOLD)
    renderThreshold = DEFAULT_RENDER_THRESHOLD
  }

  let dashboardPosition: DashboardPosition = DEFAULT_DASHBOARD_POSITION
  if (o.dashboardPosition !== undefined) {
    if (VALID_POSITIONS.has(o.dashboardPosition)) {
      dashboardPosition = o.dashboardPosition
    } else {
      warnInvalid('dashboardPosition', o.dashboardPosition, DEFAULT_DASHBOARD_POSITION)
    }
  }

  const trackComponents = Array.isArray(o.trackComponents)
    ? o.trackComponents.filter((x): x is string => typeof x === 'string')
    : []

  return {
    enabled: o.enabled !== false,
    flashColor: typeof o.flashColor === 'string' && o.flashColor.length > 0 ? o.flashColor : DEFAULT_FLASH_COLOR,
    flashDuration,
    dashboardPosition,
    renderThreshold,
    trackComponents,
  }
}
