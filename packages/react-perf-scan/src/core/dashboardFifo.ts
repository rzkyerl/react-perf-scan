/**
 * FIFO eviction for unique component keys in the dashboard (Req 4.5).
 */
export function mergeDashboardEntriesForWastedRender<T extends { componentName: string; firstDetectedAt: number }>(
  prev: T[],
  componentName: string,
  newEntry: T,
  maxEntries: number,
  mergeExisting: (existing: T) => T,
): T[] {
  const idx = prev.findIndex((e) => e.componentName === componentName)
  if (idx === -1) {
    const next = [...prev, newEntry]
    if (next.length <= maxEntries) return next
    const sorted = [...next].sort((a, b) => a.firstDetectedAt - b.firstDetectedAt)
    sorted.shift()
    return sorted
  }
  const copy = [...prev]
  copy[idx] = mergeExisting(copy[idx]!)
  return copy
}
