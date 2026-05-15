import { describe, expect, it } from 'vitest'
import { mergeDashboardEntriesForWastedRender } from './dashboardFifo'

type Row = { componentName: string; firstDetectedAt: number; v: number }

describe('mergeDashboardEntriesForWastedRender', () => {
  it('appends a new component', () => {
    const prev: Row[] = []
    const next = mergeDashboardEntriesForWastedRender(
      prev,
      'A',
      { componentName: 'A', firstDetectedAt: 10, v: 1 },
      10,
      () => ({ componentName: 'A', firstDetectedAt: 0, v: 99 }),
    )
    expect(next).toHaveLength(1)
    expect(next[0]).toMatchObject({ componentName: 'A', firstDetectedAt: 10, v: 1 })
  })

  it('evicts oldest when exceeding max unique entries', () => {
    const prev: Row[] = [
      { componentName: 'A', firstDetectedAt: 1, v: 1 },
      { componentName: 'B', firstDetectedAt: 2, v: 1 },
      { componentName: 'C', firstDetectedAt: 3, v: 1 },
    ]
    const next = mergeDashboardEntriesForWastedRender(
      prev,
      'D',
      { componentName: 'D', firstDetectedAt: 4, v: 1 },
      3,
      () => ({ componentName: 'D', firstDetectedAt: 0, v: 99 }),
    )
    expect(next).toHaveLength(3)
    expect(next.map((x) => x.componentName).sort()).toEqual(['B', 'C', 'D'])
  })

  it('merges existing component without changing firstDetectedAt', () => {
    const prev: Row[] = [{ componentName: 'A', firstDetectedAt: 100, v: 1 }]
    const next = mergeDashboardEntriesForWastedRender(
      prev,
      'A',
      { componentName: 'A', firstDetectedAt: 999, v: 2 },
      10,
      (cur) => ({ ...cur, v: cur.v + 1 }),
    )
    expect(next).toHaveLength(1)
    expect(next[0]).toMatchObject({ componentName: 'A', firstDetectedAt: 100, v: 2 })
  })
})
