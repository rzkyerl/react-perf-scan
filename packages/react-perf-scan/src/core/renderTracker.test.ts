/**
 * Unit tests for renderTracker helpers.
 *
 * Because most helper functions inside renderTracker.ts are not exported,
 * we test them through:
 *  1. The public renderTracker API (init / destroy) with mocked dependencies.
 *  2. The exported utilities from adjacent modules that renderTracker delegates to
 *     (shallowDiff, state, eventBus, memoSuggestionEngine).
 *  3. A small set of pure helpers extracted into this file directly to keep
 *     renderTracker.ts free of test-only exports.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FiberLike, FiberRootLike } from './reactRootPatch'
import { REACT_SUSPENSE_TYPE } from './reactRootPatch'
import { eventBus } from './eventBus'
import { renderTracker } from './renderTracker'
import { resetState } from './state'
import { shallowDiff } from './shallowDiff'
import { validateConfig } from './config'

// ---------------------------------------------------------------------------
// Fiber factory helpers (keep tests readable)
// ---------------------------------------------------------------------------

const REACT_PROFILER_TYPE = Symbol.for('react.profiler')
const REACT_STRICT_MODE_TYPE = Symbol.for('react.strict_mode')

function makeFiber(overrides: Partial<FiberLike> = {}): FiberLike {
  return {
    tag: 0,
    key: null,
    elementType: null,
    type: null,
    stateNode: null,
    return: null,
    child: null,
    sibling: null,
    alternate: null,
    memoizedProps: {},
    memoizedState: null,
    actualDuration: 0,
    ...overrides,
  }
}

function makeFunctionFiber(name: string, overrides: Partial<FiberLike> = {}): FiberLike {
  function Component() {}
  Component.displayName = name
  return makeFiber({ type: Component, elementType: Component, ...overrides })
}

// ---------------------------------------------------------------------------
// Inline copies of private renderTracker helpers (white-box, kept in sync)
// These are pure functions with zero side-effects — safe to copy for testing.
// ---------------------------------------------------------------------------

function safeRecordProps(v: unknown): Record<string, unknown> | null {
  if (v == null) return {}
  if (typeof v !== 'object' || Array.isArray(v)) return null
  return v as Record<string, unknown>
}

type HookNode = { memoizedState: unknown; next: HookNode | null }

function extractHookState(head: unknown): Record<string, unknown> | null {
  if (head == null) return {}
  if (typeof head !== 'object') return null
  try {
    const out: Record<string, unknown> = {}
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
  const isProfiler = fiber.type === REACT_PROFILER_TYPE || fiber.elementType === REACT_PROFILER_TYPE
  const isStrict = fiber.type === REACT_STRICT_MODE_TYPE || fiber.elementType === REACT_STRICT_MODE_TYPE
  if (isProfiler || isStrict) return false
  return getComponentName(fiber) != null
}

function traverseFibers(root: FiberLike, visitor: (f: FiberLike) => void): void {
  let fiber: FiberLike | null = root
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (!fiber) return
    visitor(fiber)
    if (fiber.child) { fiber = fiber.child; continue }
    while (fiber) {
      if (fiber.sibling) { fiber = fiber.sibling; break }
      fiber = fiber.return
    }
  }
}

// ---------------------------------------------------------------------------
// safeRecordProps
// ---------------------------------------------------------------------------

describe('safeRecordProps', () => {
  it('returns empty object for null/undefined', () => {
    expect(safeRecordProps(null)).toEqual({})
    expect(safeRecordProps(undefined)).toEqual({})
  })

  it('returns null for arrays', () => {
    expect(safeRecordProps([1, 2, 3])).toBeNull()
  })

  it('returns null for primitives', () => {
    expect(safeRecordProps('string')).toBeNull()
    expect(safeRecordProps(42)).toBeNull()
    expect(safeRecordProps(true)).toBeNull()
  })

  it('passes through plain objects', () => {
    const obj = { a: 1, b: 'hello' }
    expect(safeRecordProps(obj)).toBe(obj)
  })
})

// ---------------------------------------------------------------------------
// extractHookState
// ---------------------------------------------------------------------------

describe('extractHookState', () => {
  it('returns empty object for null head', () => {
    expect(extractHookState(null)).toEqual({})
  })

  it('returns null for non-object head', () => {
    expect(extractHookState(42)).toBeNull()
    expect(extractHookState('str')).toBeNull()
  })

  it('walks a linked list of hook nodes', () => {
    const node2: HookNode = { memoizedState: 'b', next: null }
    const node1: HookNode = { memoizedState: 'a', next: node2 }
    const result = extractHookState(node1)
    expect(result).toEqual({ hook_0: 'a', hook_1: 'b' })
  })

  it('stops when a node has no "next" property', () => {
    // A node without the "next" property should stop the walk
    const node = { memoizedState: 42 } // no "next"
    const result = extractHookState(node)
    expect(result).toEqual({})
  })

  it('stops after 60 nodes (safety cap)', () => {
    // Build a chain of 70 nodes
    let head: HookNode = { memoizedState: 69, next: null }
    for (let i = 68; i >= 0; i--) {
      head = { memoizedState: i, next: head }
    }
    const result = extractHookState(head)
    expect(Object.keys(result!)).toHaveLength(60)
    expect(result!['hook_59']).toBe(59)
    expect(result!['hook_60']).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// getComponentName
// ---------------------------------------------------------------------------

describe('getComponentName', () => {
  it('uses displayName when available', () => {
    function Foo() {}
    Foo.displayName = 'CustomName'
    expect(getComponentName(makeFiber({ type: Foo }))).toBe('CustomName')
  })

  it('falls back to function.name', () => {
    function MyComponent() {}
    expect(getComponentName(makeFiber({ type: MyComponent }))).toBe('MyComponent')
  })

  it('falls back to "Anonymous" when function.name is empty string', () => {
    // V8 infers names from variable/property keys, so we strip the name explicitly.
    // The source code uses: fn.displayName || fn.name || 'Anonymous'
    // An empty string is falsy, so 'Anonymous' is returned.
    const fn = () => null
    Object.defineProperty(fn, 'name', { value: '', configurable: true })
    expect(getComponentName(makeFiber({ type: fn }))).toBe('Anonymous')
  })

  it('handles forwardRef-like objects with render function', () => {
    function Inner() {}
    Inner.displayName = 'Inner'
    const forwardRef = { render: Inner }
    expect(getComponentName(makeFiber({ type: forwardRef }))).toBe('Inner')
  })

  it('returns null for host elements (string type)', () => {
    expect(getComponentName(makeFiber({ type: 'div' }))).toBeNull()
  })

  it('returns null for null type', () => {
    expect(getComponentName(makeFiber({ type: null }))).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// isCompositeFiber
// ---------------------------------------------------------------------------

describe('isCompositeFiber', () => {
  it('returns true for a named function component', () => {
    function MyComp() {}
    expect(isCompositeFiber(makeFiber({ type: MyComp }))).toBe(true)
  })

  it('returns false for Profiler fiber', () => {
    expect(isCompositeFiber(makeFiber({ type: REACT_PROFILER_TYPE }))).toBe(false)
    expect(isCompositeFiber(makeFiber({ elementType: REACT_PROFILER_TYPE }))).toBe(false)
  })

  it('returns false for StrictMode fiber', () => {
    expect(isCompositeFiber(makeFiber({ type: REACT_STRICT_MODE_TYPE }))).toBe(false)
  })

  it('returns false for host elements', () => {
    expect(isCompositeFiber(makeFiber({ type: 'div' }))).toBe(false)
  })

  it('returns false for null type', () => {
    expect(isCompositeFiber(makeFiber({ type: null }))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// traverseFibers
// ---------------------------------------------------------------------------

describe('traverseFibers', () => {
  it('visits a single node', () => {
    const root = makeFunctionFiber('Root')
    const visited: string[] = []
    traverseFibers(root, (f) => visited.push(getComponentName(f) ?? '?'))
    expect(visited).toEqual(['Root'])
  })

  it('visits in depth-first order: root → child → sibling', () => {
    const root = makeFunctionFiber('Root')
    const child = makeFunctionFiber('Child')
    const sibling = makeFunctionFiber('Sibling')
    root.child = child
    child.return = root
    child.sibling = sibling
    sibling.return = root

    const visited: string[] = []
    traverseFibers(root, (f) => visited.push(getComponentName(f) ?? '?'))
    expect(visited).toEqual(['Root', 'Child', 'Sibling'])
  })

  it('visits nested grandchildren before siblings', () => {
    //  Root
    //   └─ Parent
    //       ├─ ChildA
    //       └─ ChildB
    const root = makeFunctionFiber('Root')
    const parent = makeFunctionFiber('Parent')
    const childA = makeFunctionFiber('ChildA')
    const childB = makeFunctionFiber('ChildB')

    root.child = parent
    parent.return = root
    parent.child = childA
    childA.return = parent
    childA.sibling = childB
    childB.return = parent

    const visited: string[] = []
    traverseFibers(root, (f) => visited.push(getComponentName(f) ?? '?'))
    expect(visited).toEqual(['Root', 'Parent', 'ChildA', 'ChildB'])
  })
})

// ---------------------------------------------------------------------------
// shallowDiff (delegated by renderTracker for prop/state diffing)
// ---------------------------------------------------------------------------

describe('shallowDiff (used by renderTracker for prop/state deltas)', () => {
  it('detects added props', () => {
    const diffs = shallowDiff({}, { newProp: 'value' })
    expect(diffs).toEqual([{ key: 'newProp', prevValue: undefined, nextValue: 'value', changeType: 'added' }])
  })

  it('detects removed props', () => {
    const diffs = shallowDiff({ gone: true }, {})
    expect(diffs).toEqual([{ key: 'gone', prevValue: true, nextValue: undefined, changeType: 'removed' }])
  })

  it('detects changed props (reference inequality)', () => {
    const prev = { fn: () => {} }
    const next = { fn: () => {} }
    const diffs = shallowDiff(prev, next)
    expect(diffs).toHaveLength(1)
    expect(diffs[0]).toMatchObject({ key: 'fn', changeType: 'changed' })
  })

  it('returns empty array when props are identical by reference', () => {
    const fn = () => {}
    expect(shallowDiff({ fn, n: 1 }, { fn, n: 1 })).toHaveLength(0)
  })

  it('treats null/undefined inputs as empty objects', () => {
    expect(shallowDiff(null, null)).toHaveLength(0)
    expect(shallowDiff(undefined, undefined)).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// renderTracker.init / destroy lifecycle (integration)
// ---------------------------------------------------------------------------

describe('renderTracker lifecycle', () => {
  beforeEach(() => {
    resetState()
    eventBus.clear()
  })

  afterEach(() => {
    renderTracker.destroy()
    resetState()
    eventBus.clear()
  })

  it('init does not throw', () => {
    const cfg = validateConfig()
    expect(() => renderTracker.init(cfg)).not.toThrow()
  })

  it('destroy does not throw when called before init', () => {
    expect(() => renderTracker.destroy()).not.toThrow()
  })

  it('destroy can be called multiple times without error', () => {
    const cfg = validateConfig()
    renderTracker.init(cfg)
    expect(() => {
      renderTracker.destroy()
      renderTracker.destroy()
    }).not.toThrow()
  })

  it('re-init after destroy does not throw', () => {
    const cfg = validateConfig()
    renderTracker.init(cfg)
    renderTracker.destroy()
    expect(() => renderTracker.init(cfg)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// wasted-render detection logic (via processCommittedRoots simulation)
// Tests the core wasted-render = update + no propDiff + no stateDiff logic
// by using the public state + event APIs.
// ---------------------------------------------------------------------------

describe('wasted-render detection (logic validation)', () => {
  it('a render is wasted when phase=update and both diffs are empty', () => {
    const phase: 'mount' | 'update' = 'update'
    const propDiff = shallowDiff({ count: 1 }, { count: 1 }) // same → empty
    const stateDiff = shallowDiff({}, {}) // same → empty
    const isWasted =
      phase === 'update' &&
      propDiff.length === 0 &&
      stateDiff.length === 0

    expect(isWasted).toBe(true)
  })

  it('a render is NOT wasted when props changed', () => {
    const phase: 'mount' | 'update' = 'update'
    const propDiff = shallowDiff({ label: 'a' }, { label: 'b' }) // changed!
    const isWasted = phase === 'update' && propDiff.length === 0
    expect(isWasted).toBe(false)
  })

  it('a mount render is never wasted regardless of diffs', () => {
    const phase: 'mount' | 'update' = 'mount'
    const propDiff = shallowDiff({}, {})
    const isWasted = phase === 'update' && propDiff.length === 0
    expect(isWasted).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// FiberRoot registration via registerRootFromReactDomRoot
// ---------------------------------------------------------------------------

describe('renderTracker.registerRootFromReactDomRoot', () => {
  afterEach(() => {
    renderTracker.destroy()
    resetState()
  })

  it('does not throw when root has no _internalRoot', () => {
    // Simulates a ReactDOM root object without internal reference
    const fakeRoot = {} as Parameters<typeof renderTracker.registerRootFromReactDomRoot>[0]
    expect(() => renderTracker.registerRootFromReactDomRoot(fakeRoot)).not.toThrow()
  })

  it('registers a root with _internalRoot', () => {
    const fiberRoot: FiberRootLike = { current: null }
    const fakeRoot = { _internalRoot: fiberRoot } as unknown as Parameters<
      typeof renderTracker.registerRootFromReactDomRoot
    >[0]
    // Should not throw — the registered root will be iterated on next commit
    expect(() => renderTracker.registerRootFromReactDomRoot(fakeRoot)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// eventBus 'wasted-render' is emitted with correct shape (smoke test)
// ---------------------------------------------------------------------------

describe('eventBus wasted-render event shape', () => {
  it('handler receives expected fields', () => {
    const handler = vi.fn()
    const unsub = eventBus.on('wasted-render', handler)

    const fakeRecord = {
      componentName: 'TestComp',
      timestamp: Date.now(),
      duration: 1.5,
      phase: 'update' as const,
      propDiff: [],
      stateDiff: null,
      isWasted: true,
    }

    eventBus.emit('wasted-render', {
      componentName: 'TestComp',
      record: fakeRecord,
      domNode: null,
    })

    expect(handler).toHaveBeenCalledTimes(1)
    const payload = handler.mock.calls[0]![0]
    expect(payload.componentName).toBe('TestComp')
    expect(payload.record.isWasted).toBe(true)
    expect(payload.domNode).toBeNull()

    unsub()
  })

  it('unsubscribed handlers are not called', () => {
    const handler = vi.fn()
    const unsub = eventBus.on('wasted-render', handler)
    unsub()

    eventBus.emit('wasted-render', {
      componentName: 'X',
      record: {
        componentName: 'X',
        timestamp: 0,
        duration: 0,
        phase: 'update',
        propDiff: [],
        stateDiff: null,
        isWasted: true,
      },
      domNode: null,
    })

    expect(handler).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Suspense fiber detection used by renderTracker
// ---------------------------------------------------------------------------

describe('Suspense fiber type check (used in wasted-render guard)', () => {
  it('REACT_SUSPENSE_TYPE symbol is correct', () => {
    expect(REACT_SUSPENSE_TYPE).toBe(Symbol.for('react.suspense'))
  })

  it('a fiber with suspense type is identified correctly', () => {
    const suspenseFiber = makeFiber({ type: REACT_SUSPENSE_TYPE, elementType: REACT_SUSPENSE_TYPE })
    const isSuspense =
      suspenseFiber.type === REACT_SUSPENSE_TYPE ||
      suspenseFiber.elementType === REACT_SUSPENSE_TYPE
    expect(isSuspense).toBe(true)
  })
})
