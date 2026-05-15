import { afterEach, describe, expect, it, vi } from 'vitest'
import { installDevToolsCommitHook } from './devToolsHook'

describe('installDevToolsCommitHook', () => {
  const g = globalThis as unknown as {
    __REACT_DEVTOOLS_GLOBAL_HOOK__?: {
      onCommitFiberRoot?: (rendererID: number, root: unknown, priority: unknown, didError: boolean) => void
      inject?: (internals: unknown) => unknown
    }
  }

  afterEach(() => {
    delete g.__REACT_DEVTOOLS_GLOBAL_HOOK__
  })

  it('wraps onCommitFiberRoot when present', () => {
    const orig = vi.fn()
    g.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { onCommitFiberRoot: orig }
    const schedule = vi.fn()
    const registerRoot = vi.fn()

    const un = installDevToolsCommitHook({ registerRoot, schedule })
    const hook = g.__REACT_DEVTOOLS_GLOBAL_HOOK__!
    expect(typeof hook.onCommitFiberRoot).toBe('function')

    hook.onCommitFiberRoot!(1, { current: {} }, 2, false)

    expect(orig).toHaveBeenCalledOnce()
    expect(schedule).toHaveBeenCalled()
    expect(registerRoot).toHaveBeenCalled()

    un()
    expect(hook.onCommitFiberRoot).toBe(orig)
  })
})
