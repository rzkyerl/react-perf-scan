import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { PerfScanConfig } from '../core/config'
import { ErrorBoundary } from './ErrorBoundary'
import { DashboardApp } from './Dashboard'

let rootHost: HTMLDivElement | null = null
let reactRoot: ReturnType<typeof createRoot> | null = null

export function mountDashboard(config: PerfScanConfig): void {
  if (typeof document === 'undefined') return
  if (rootHost) return

  try {
    const el = document.createElement('div')
    el.id = 'react-perf-scan-dashboard'
    el.setAttribute('data-react-perf-scan', 'true')
    el.style.all = 'initial'
    el.style.position = 'fixed'
    el.style.zIndex = '99999'
    document.body.appendChild(el)
    rootHost = el

    reactRoot = createRoot(el)
    reactRoot.render(
      createElement(
        ErrorBoundary,
        null,
        createElement(DashboardApp, { config }),
      ),
    )
  } catch (e) {
    console.error('[react-perf-scan/dashboardMount]', e)
  }
}

export function unmountDashboard(): void {
  try {
    reactRoot?.unmount()
  } catch (e) {
    console.error('[react-perf-scan/dashboardMount]', e)
  }
  reactRoot = null

  try {
    rootHost?.remove()
  } catch {
    // ignore
  }
  rootHost = null
}
