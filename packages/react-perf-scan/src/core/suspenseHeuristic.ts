import { REACT_SUSPENSE_TYPE } from './reactRootPatch'
import type { FiberLike } from './reactRootPatch'

/**
 * Detects React's internal `SUSPENDED_MARKER` shape (see `react-dom` Suspense implementation).
 * When a Suspense fiber carries this `memoizedState`, the boundary is in "suspended / showing fallback" mode.
 */
export function isSuspendedSuspenseMemoState(state: unknown): boolean {
  if (state == null || typeof state !== 'object') return false
  const o = state as Record<string, unknown>
  return (
    Object.prototype.hasOwnProperty.call(o, 'dehydrated') &&
    Object.prototype.hasOwnProperty.call(o, 'treeContext') &&
    Object.prototype.hasOwnProperty.call(o, 'retryLane') &&
    Object.prototype.hasOwnProperty.call(o, 'hydrationErrors') &&
    o.dehydrated === null &&
    o.treeContext === null &&
    o.retryLane === 0 &&
    (o.hydrationErrors === null || o.hydrationErrors === undefined)
  )
}

function isSuspenseFiber(fiber: FiberLike): boolean {
  return fiber.type === REACT_SUSPENSE_TYPE || fiber.elementType === REACT_SUSPENSE_TYPE
}

function getSuspenseMemoizedState(fiber: FiberLike): unknown {
  return fiber.memoizedState ?? fiber.alternate?.memoizedState
}

function isDescendantOf(ancestor: FiberLike, node: FiberLike | null): boolean {
  let cur: FiberLike | null = node
  while (cur) {
    if (cur === ancestor) return true
    cur = cur.return
  }
  return false
}

/**
 * Best-effort: returns true when `fiber` sits under a Suspense boundary that is currently
 * displaying fallback (React `memoizedState` matches suspended marker).
 *
 * @remarks
 * Matches Req 6.3 — avoids classifying renders as wasted while fallback is active.
 */
export function isFiberUnderActiveSuspenseFallback(fiber: FiberLike): boolean {
  try {
    let cur: FiberLike | null = fiber.return
    while (cur) {
      if (isSuspenseFiber(cur) && isSuspendedSuspenseMemoState(getSuspenseMemoizedState(cur))) {
        return true
      }
      cur = cur.return
    }
    return false
  } catch {
    return false
  }
}

/** Exported for tests — whether `node` is in the fallback subtree (second child chain) of Suspense. */
export function isUnderSuspenseFallbackSiblingHeuristic(suspense: FiberLike, node: FiberLike | null): boolean {
  const primary = suspense.child
  const fallback = primary?.sibling ?? null
  if (!fallback) return false
  return isDescendantOf(fallback, node)
}
