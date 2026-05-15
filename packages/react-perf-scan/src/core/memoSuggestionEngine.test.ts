import { beforeEach, describe, expect, it } from 'vitest'
import type { RenderRecord } from '../types'
import { validateConfig } from './config'
import { memoSuggestionEngine } from './memoSuggestionEngine'
import { getState, resetState } from './state'

function rec(p: Partial<RenderRecord> & Pick<RenderRecord, 'componentName'>): RenderRecord {
  return {
    timestamp: 0,
    duration: 0,
    phase: 'update',
    propDiff: [],
    stateDiff: null,
    isWasted: true,
    ...p,
  }
}

describe('memoSuggestionEngine.analyze', () => {
  beforeEach(() => {
    resetState()
  })

  it('does not emit suggestions below wasted threshold', () => {
    const cfg = validateConfig({ renderThreshold: 5 })
    memoSuggestionEngine.analyze('Foo', [rec({ componentName: 'Foo', isWasted: true })], cfg)
    expect(getState().activeSuggestions.get('Foo') ?? []).toHaveLength(0)
  })

  it('adds memo suggestion when most renders are wasted with empty prop diffs', () => {
    const cfg = validateConfig({ renderThreshold: 3 })
    const records: RenderRecord[] = [
      rec({ componentName: 'Foo', isWasted: true, propDiff: [] }),
      rec({ componentName: 'Foo', isWasted: true, propDiff: [] }),
      rec({ componentName: 'Foo', isWasted: true, propDiff: [] }),
    ]
    memoSuggestionEngine.analyze('Foo', records, cfg)
    const sug = getState().activeSuggestions.get('Foo') ?? []
    expect(sug.some((s) => s.type === 'memo')).toBe(true)
  })
})
