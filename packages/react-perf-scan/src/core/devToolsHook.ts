import type { FiberRootLike } from './reactRootPatch'

type Hook = {
  inject?: (internals: unknown) => unknown
  onCommitFiberRoot?: (rendererID: number, root: FiberRootLike, priority: unknown, didError: boolean) => void
}

let injectedInject: Hook['inject'] | undefined
let injectedOnCommit: Hook['onCommitFiberRoot'] | undefined
let hookRef: Hook | null = null

export type DevToolsCommitPayload = {
  registerRoot: (root: FiberRootLike) => void
  schedule: () => void
}

function restoreHook(): void {
  try {
    if (hookRef && injectedOnCommit) {
      hookRef.onCommitFiberRoot = injectedOnCommit
    }
    if (hookRef && injectedInject) {
      hookRef.inject = injectedInject
    }
  } catch (e) {
    console.error('[react-perf-scan/devToolsHook]', e)
  }
  injectedInject = undefined
  injectedOnCommit = undefined
  hookRef = null
}

/**
 * Subscribes to React DevTools global hook commit notifications (official integration path).
 * Complements the `Profiler` callback so commits still schedule work if Profiler timing differs.
 */
export function installDevToolsCommitHook(payload: DevToolsCommitPayload): () => void {
  try {
    const g = globalThis as unknown as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: Hook }
    const hook = g.__REACT_DEVTOOLS_GLOBAL_HOOK__
    if (!hook) return () => {}

    hookRef = hook

    const wrapOnCommit = (): void => {
      if (typeof hook.onCommitFiberRoot !== 'function') return
      if (injectedOnCommit) return
      injectedOnCommit = hook.onCommitFiberRoot
      hook.onCommitFiberRoot = (rendererID, root, priority, didError) => {
        try {
          injectedOnCommit?.call(hook, rendererID, root, priority, didError)
        } catch {
          // ignore host hook errors
        }
        try {
          if (root && typeof root === 'object' && 'current' in root) {
            payload.registerRoot(root as FiberRootLike)
          }
          payload.schedule()
        } catch (e) {
          console.error('[react-perf-scan/devToolsHook]', e)
        }
      }
    }

    if (typeof hook.onCommitFiberRoot === 'function') {
      wrapOnCommit()
    } else if (typeof hook.inject === 'function') {
      injectedInject = hook.inject.bind(hook)
      hook.inject = (internals: unknown) => {
        const id = injectedInject!(internals)
        wrapOnCommit()
        return id
      }
    }

    return restoreHook
  } catch (e) {
    console.error('[react-perf-scan/devToolsHook]', e)
    return () => {}
  }
}
