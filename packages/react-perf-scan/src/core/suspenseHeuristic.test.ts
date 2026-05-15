import { describe, expect, it } from 'vitest'
import { REACT_SUSPENSE_TYPE } from './reactRootPatch'
import type { FiberLike } from './reactRootPatch'
import {
  isFiberUnderActiveSuspenseFallback,
  isSuspendedSuspenseMemoState,
  isUnderSuspenseFallbackSiblingHeuristic,
} from './suspenseHeuristic'

const suspendedMarker = {
  dehydrated: null,
  treeContext: null,
  retryLane: 0,
  hydrationErrors: null,
}

describe('isSuspendedSuspenseMemoState', () => {
  it('matches React SUSPENDED_MARKER shape', () => {
    expect(isSuspendedSuspenseMemoState(suspendedMarker)).toBe(true)
  })

  it('rejects hydration / resolved shapes', () => {
    expect(isSuspendedSuspenseMemoState(null)).toBe(false)
    expect(isSuspendedSuspenseMemoState({ dehydrated: {}, treeContext: null, retryLane: 0, hydrationErrors: null })).toBe(false)
    expect(isSuspendedSuspenseMemoState({ dehydrated: null, treeContext: null, retryLane: 1, hydrationErrors: null })).toBe(false)
  })
})

describe('isFiberUnderActiveSuspenseFallback', () => {
  it('returns true when an ancestor Suspense carries suspended marker', () => {
    const suspense: FiberLike = {
      tag: 0,
      key: null,
      elementType: REACT_SUSPENSE_TYPE,
      type: REACT_SUSPENSE_TYPE,
      stateNode: null,
      return: null,
      child: null,
      sibling: null,
      alternate: null,
      memoizedProps: {},
      memoizedState: suspendedMarker,
    }
    const child: FiberLike = {
      tag: 0,
      key: null,
      elementType: null,
      type: function Child() {},
      stateNode: null,
      return: suspense,
      child: null,
      sibling: null,
      alternate: null,
      memoizedProps: {},
      memoizedState: null,
    }
    expect(isFiberUnderActiveSuspenseFallback(child)).toBe(true)
  })

  it('returns false when Suspense memoizedState is null', () => {
    const suspense: FiberLike = {
      tag: 0,
      key: null,
      elementType: REACT_SUSPENSE_TYPE,
      type: REACT_SUSPENSE_TYPE,
      stateNode: null,
      return: null,
      child: null,
      sibling: null,
      alternate: null,
      memoizedProps: {},
      memoizedState: null,
    }
    const child: FiberLike = {
      tag: 0,
      key: null,
      elementType: null,
      type: function Child() {},
      stateNode: null,
      return: suspense,
      child: null,
      sibling: null,
      alternate: null,
      memoizedProps: {},
      memoizedState: null,
    }
    expect(isFiberUnderActiveSuspenseFallback(child)).toBe(false)
  })
})

describe('isUnderSuspenseFallbackSiblingHeuristic', () => {
  it('detects nodes under the second child of Suspense', () => {
    const fb: FiberLike = {
      tag: 0,
      key: null,
      elementType: null,
      type: 'div',
      stateNode: null,
      return: null,
      child: null,
      sibling: null,
      alternate: null,
      memoizedProps: {},
      memoizedState: null,
    }
    const primary: FiberLike = {
      tag: 0,
      key: null,
      elementType: null,
      type: 'div',
      stateNode: null,
      return: null,
      child: null,
      sibling: fb,
      alternate: null,
      memoizedProps: {},
      memoizedState: null,
    }
    const suspense: FiberLike = {
      tag: 0,
      key: null,
      elementType: REACT_SUSPENSE_TYPE,
      type: REACT_SUSPENSE_TYPE,
      stateNode: null,
      return: null,
      child: primary,
      sibling: null,
      alternate: null,
      memoizedProps: {},
      memoizedState: null,
    }
    fb.return = suspense
    primary.return = suspense

    const leaf: FiberLike = {
      tag: 0,
      key: null,
      elementType: null,
      type: function X() {},
      stateNode: null,
      return: fb,
      child: null,
      sibling: null,
      alternate: null,
      memoizedProps: {},
      memoizedState: null,
    }

    expect(isUnderSuspenseFallbackSiblingHeuristic(suspense, leaf)).toBe(true)
    expect(isUnderSuspenseFallbackSiblingHeuristic(suspense, primary)).toBe(false)
  })
})
