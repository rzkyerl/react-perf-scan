import type { PropDiff } from '../types'

function isObjectRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

/**
 * Shallow diff between two prop/state snapshots.
 */
export function shallowDiff(
  prev: Record<string, unknown> | null | undefined,
  next: Record<string, unknown> | null | undefined,
): PropDiff[] {
  const p = prev && isObjectRecord(prev) ? prev : {}
  const n = next && isObjectRecord(next) ? next : {}
  const keys = new Set([...Object.keys(p), ...Object.keys(n)])
  const out: PropDiff[] = []

  for (const key of keys) {
    const hasP = Object.prototype.hasOwnProperty.call(p, key)
    const hasN = Object.prototype.hasOwnProperty.call(n, key)
    if (hasP && !hasN) {
      out.push({ key, prevValue: p[key], nextValue: undefined, changeType: 'removed' })
      continue
    }
    if (!hasP && hasN) {
      out.push({ key, prevValue: undefined, nextValue: n[key], changeType: 'added' })
      continue
    }
    if (hasP && hasN && p[key] !== n[key]) {
      out.push({ key, prevValue: p[key], nextValue: n[key], changeType: 'changed' })
    }
  }
  return out
}
