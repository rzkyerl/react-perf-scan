import type { Root } from 'react-dom/client'
import type { RenderRecord } from '../types'
import type { PerfScanConfig } from './config'
import { installDevToolsCommitHook } from './devToolsHook'
import { eventBus } from './eventBus'
import { memoSuggestionEngine } from './memoSuggestionEngine'
import { getInternalRoot, isProfilerFiber, isStrictFiber, patchReactDomClient, unpatchReactDomClient, type FiberLike, type FiberRootLike } from './reactRootPatch'
import { isFiberUnderActiveSuspenseFallback } from './suspenseHeuristic'
import { shallowDiff } from './shallowDiff'
import { addRecord, clearComponentRecords, getState } from './state'

const registeredRoots = new Set<FiberRootLike>()
let lastSeen = new Set<string>()
let microScheduled = false
let uninstallDevToolsHook: (() => void) | null = null

function safeRecordProps(v: unknown): Record<string, unknown> | null {
  if (v == null) return {}
  if (typeof v !== 'object' || Array.isArray(v)) return null
  return v as Record<string, unknown>
}

function extractHookState(head: unknown): Record<string, unknown> | null {
  if (head == null) return {}
  if (typeof head !== 'object') return null
  try {
    const out: Record<string, unknown> = {}
    type HookNode = { memoizedState: unknown; next: HookNode | null }
    let node = head as HookNode | null
    let i = 0
    while (node && i < 60) {
      if (!('next' in node)) break
      out[`hook_${i}`] = node.memoizedState
      node = node.next
      i++
    }
    return out
  } catch {
    return null
  }
}

function getComponentName(fiber: FiberLike): string | null {
  const t = fiber.type
  if (typeof t === 'function') {
    const fn = t as { displayName?: string; name?: string }
    return fn.displayName || fn.name || 'Anonymous'
  }
  if (typeof t === 'object' && t) {
    const o = t as { displayName?: string; name?: string; render?: unknown }
    if (typeof o.render === 'function') {
      const r = o.render as { displayName?: string; name?: string }
      return o.displayName || r.displayName || r.name || o.name || 'Anonymous'
    }
    if ('displayName' in o || 'name' in o) {
      return o.displayName || o.name || 'Anonymous'
    }
  }
  return null
}

function isCompositeFiber(fiber: FiberLike): boolean {
  if (isProfilerFiber(fiber) || isStrictFiber(fiber)) return false
  return getComponentName(fiber) != null
}

function traverseFibers(root: FiberLike, visitor: (fiber: FiberLike) => void): void {
  let fiber: FiberLike | null = root
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (!fiber) return
    visitor(fiber)
    if (fiber.child) {
      fiber = fiber.child
      continue
    }
    while (fiber) {
      if (fiber.sibling) {
        fiber = fiber.sibling
        break
      }
      fiber = fiber.return
    }
  }
}

function getDomNodeForFiber(fiber: FiberLike): HTMLElement | null {
  try {
    let f: FiberLike | null = fiber
    while (f) {
      if (typeof f.type === 'string') {
        const n = f.stateNode
        if (n instanceof HTMLElement) return n
        return null
      }
      if (f.child) {
        f = f.child
        continue
      }
      return null
    }
    return null
  } catch {
    return null
  }
}

function registerRootFromReactDomRoot(reactDomRoot: Root): void {
  const internal = getInternalRoot(reactDomRoot)
  if (internal) registeredRoots.add(internal)
}

function scheduleProcessCommittedRoots(): void {
  if (microScheduled) return
  microScheduled = true
  queueMicrotask(() => {
    microScheduled = false
    try {
      processCommittedRoots()
    } catch (e) {
      console.error('[react-perf-scan/RenderTracker]', e)
    }
  })
}

function processCommittedRoots(): void {
  const config = getState().config
  if (!config) return

  const visited = new Set<string>()

  for (const fiberRoot of registeredRoots) {
    const rootFiber = fiberRoot.current
    if (!rootFiber) continue
    traverseFibers(rootFiber, (fiber) => {
      try {
        if (!isCompositeFiber(fiber)) return
        const name = getComponentName(fiber)
        if (!name) return
        if (config.trackComponents.length > 0 && !config.trackComponents.includes(name)) return

        visited.add(name)

        const prevProps = safeRecordProps(fiber.alternate ? fiber.alternate.memoizedProps : null)
        const nextProps = safeRecordProps(fiber.memoizedProps)
        const propDiff =
          prevProps != null && nextProps != null
            ? shallowDiff(prevProps, nextProps)
            : shallowDiff({}, nextProps ?? {})

        const prevStateObj = extractHookState(fiber.alternate?.memoizedState)
        const nextStateObj = extractHookState(fiber.memoizedState)
        const stateDiff =
          prevStateObj != null && nextStateObj != null
            ? shallowDiff(prevStateObj, nextStateObj)
            : prevStateObj === null || nextStateObj === null
              ? null
              : shallowDiff(prevStateObj, nextStateObj)

        const phase: 'mount' | 'update' = fiber.alternate ? 'update' : 'mount'
        const duration = Number(fiber.actualDuration ?? 0)

        const inSuspenseFallback = isFiberUnderActiveSuspenseFallback(fiber)

        const isWasted =
          !inSuspenseFallback &&
          phase === 'update' &&
          propDiff.length === 0 &&
          (stateDiff === null || stateDiff.length === 0)

        const record: RenderRecord = {
          componentName: name,
          timestamp: Date.now(),
          duration,
          phase,
          propDiff,
          stateDiff,
          isWasted,
        }

        addRecord(name, record)

        if (isWasted) {
          memoSuggestionEngine.analyze(name, getState().renderRecords.get(name) ?? [], config)
          const domNode = getDomNodeForFiber(fiber)
          if (!domNode || !document.contains(domNode)) {
            console.warn(`[react-perf-scan/VisualHighlighter] DOM node not found for component: ${name}`)
          }
          eventBus.emit('wasted-render', { componentName: name, record, domNode })
        }
      } catch (e) {
        console.error('[react-perf-scan/RenderTracker]', e)
      }
    })
  }

  for (const name of lastSeen) {
    if (!visited.has(name)) {
      window.setTimeout(() => {
        try {
          clearComponentRecords(name)
        } catch (e) {
          console.error('[react-perf-scan/RenderTracker]', e)
        }
      }, 0)
    }
  }
  lastSeen = visited
}

export const renderTracker = {
  init(_config: PerfScanConfig): void {
    uninstallDevToolsHook?.()
    uninstallDevToolsHook = installDevToolsCommitHook({
      registerRoot: (root) => {
        registeredRoots.add(root)
      },
      schedule: scheduleProcessCommittedRoots,
    })

    patchReactDomClient(
      () => {
        scheduleProcessCommittedRoots()
      },
      (root) => {
        registerRootFromReactDomRoot(root)
      },
    )
  },

  registerRootFromReactDomRoot,

  destroy(): void {
    uninstallDevToolsHook?.()
    uninstallDevToolsHook = null
    registeredRoots.clear()
    lastSeen.clear()
    unpatchReactDomClient()
  },
}
