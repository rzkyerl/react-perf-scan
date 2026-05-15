import { Profiler, createElement, type ProfilerProps, type ReactNode } from 'react'
import * as ReactDOMClient from 'react-dom/client'
import type { Root } from 'react-dom/client'

type ReactDomClientModule = {
  createRoot: typeof import('react-dom/client').createRoot
  hydrateRoot: typeof import('react-dom/client').hydrateRoot
}

const domClient = ReactDOMClient as unknown as ReactDomClientModule

export type FiberRootLike = { current: FiberLike | null }
export type FiberLike = {
  tag: number
  key: string | null
  elementType: unknown
  type: unknown
  stateNode: unknown
  return: FiberLike | null
  child: FiberLike | null
  sibling: FiberLike | null
  alternate: FiberLike | null
  memoizedProps: unknown
  memoizedState: unknown
  actualDuration?: number
  pendingProps?: unknown
}

const REACT_FRAGMENT_TYPE = Symbol.for('react.fragment')
const REACT_STRICT_MODE_TYPE = Symbol.for('react.strict_mode')
const REACT_PROFILER_TYPE = Symbol.for('react.profiler')
export const REACT_SUSPENSE_TYPE = Symbol.for('react.suspense')

let origCreateRoot: typeof ReactDOMClient.createRoot | null = null
let origHydrateRoot: typeof ReactDOMClient.hydrateRoot | null = null
let patched = false

export type ProfilerRenderFn = NonNullable<ProfilerProps['onRender']>

export function getInternalRoot(reactDomRoot: Root): FiberRootLike | null {
  const r = reactDomRoot as unknown as { _internalRoot?: FiberRootLike; internalRoot?: FiberRootLike }
  return r._internalRoot ?? r.internalRoot ?? null
}

function wrapTree(element: ReactNode, onRender: ProfilerRenderFn): ReactNode {
  return createElement(Profiler, { id: 'react-perf-scan-root', onRender }, element)
}

/**
 * Patches ReactDOM roots so every host tree is wrapped in a {@link Profiler} boundary.
 *
 * @remarks
 * Call {@link initPerfScan} before `createRoot(...).render(...)` so the patch can take effect.
 */
export function patchReactDomClient(
  onRender: ProfilerRenderFn,
  onRootCreated?: (root: import('react-dom/client').Root) => void,
): void {
  if (patched || typeof window === 'undefined') return
  patched = true

  try {
    origCreateRoot = domClient.createRoot
    origHydrateRoot = domClient.hydrateRoot

    domClient.createRoot = function patchedCreateRoot(
      container: Parameters<typeof domClient.createRoot>[0],
      options?: Parameters<typeof domClient.createRoot>[1],
    ) {
      const root = origCreateRoot!(container, options)
      onRootCreated?.(root)
      const originalRender = root.render.bind(root)
      root.render = (element: ReactNode) => {
        originalRender(wrapTree(element, onRender))
      }
      return root
    }

    domClient.hydrateRoot = function patchedHydrateRoot(
      container: Parameters<typeof domClient.hydrateRoot>[0],
      element: ReactNode,
      options?: Parameters<typeof domClient.hydrateRoot>[2],
    ) {
      const root = origHydrateRoot!(container, wrapTree(element, onRender), options)
      onRootCreated?.(root)
      return root
    }
  } catch (e) {
    patched = false
    console.error('[react-perf-scan/reactRootPatch]', e)
  }
}

export function unpatchReactDomClient(): void {
  if (!patched) return
  patched = false
  try {
    if (origCreateRoot) domClient.createRoot = origCreateRoot
    if (origHydrateRoot) domClient.hydrateRoot = origHydrateRoot
  } catch (e) {
    console.error('[react-perf-scan/reactRootPatch]', e)
  }
  origCreateRoot = null
  origHydrateRoot = null
}

export function isFragmentFiber(fiber: FiberLike): boolean {
  return fiber.type === REACT_FRAGMENT_TYPE || fiber.elementType === REACT_FRAGMENT_TYPE
}

export function isProfilerFiber(fiber: FiberLike): boolean {
  return fiber.type === REACT_PROFILER_TYPE || fiber.elementType === REACT_PROFILER_TYPE
}

export function isStrictFiber(fiber: FiberLike): boolean {
  return fiber.type === REACT_STRICT_MODE_TYPE || fiber.elementType === REACT_STRICT_MODE_TYPE
}
