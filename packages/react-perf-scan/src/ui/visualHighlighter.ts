import type { PerfScanConfig } from '../core/config'
import { eventBus } from '../core/eventBus'

const activeTimers = new Map<HTMLElement, ReturnType<typeof setTimeout>>()
let unsub: (() => void) | null = null
let currentConfig: PerfScanConfig | null = null

function removeFlash(domNode: HTMLElement): void {
  try {
    domNode.style.outline = ''
    domNode.style.boxShadow = ''
    domNode.style.transition = ''
  } catch (e) {
    console.error('[react-perf-scan/VisualHighlighter]', e)
  }
}

function flash(domNode: HTMLElement, componentName: string): void {
  const config = currentConfig
  if (!config) return

  try {
    if (!document.contains(domNode)) {
      console.warn(`[react-perf-scan/VisualHighlighter] DOM node not found for component: ${componentName}`)
      return
    }

    const existing = activeTimers.get(domNode)
    if (existing) {
      clearTimeout(existing)
    }

    domNode.style.outline = `2px solid ${config.flashColor}`
    domNode.style.transition = `outline ${config.flashDuration}ms ease-out`

    const id = setTimeout(() => {
      try {
        removeFlash(domNode)
      } catch (e) {
        console.error('[react-perf-scan/VisualHighlighter]', e)
      } finally {
        activeTimers.delete(domNode)
      }
    }, config.flashDuration)

    activeTimers.set(domNode, id)
  } catch (e) {
    console.error('[react-perf-scan/VisualHighlighter]', e)
    try {
      removeFlash(domNode)
    } catch {
      // ignore
    }
  }
}

export const visualHighlighter = {
  init(config: PerfScanConfig): void {
    currentConfig = config
    unsub?.()
    unsub = eventBus.on('wasted-render', (evt) => {
      if (!evt.domNode) return
      flash(evt.domNode, evt.componentName)
    })
  },

  destroy(): void {
    unsub?.()
    unsub = null
    currentConfig = null
    for (const [el, id] of activeTimers) {
      clearTimeout(id)
      removeFlash(el)
    }
    activeTimers.clear()
  },
}
