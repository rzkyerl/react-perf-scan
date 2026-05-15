import type { CSSProperties, FocusEvent, KeyboardEvent, ReactElement } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { DashboardPosition, MemoSuggestion, PropDiff, RenderRecord, StateDiff } from '../types'
import type { PerfScanConfig } from '../core/config'
import { eventBus } from '../core/eventBus'
import { memoSuggestionEngine } from '../core/memoSuggestionEngine'
import { BADGE_COUNTER_MAX, DIFF_VALUE_MAX_CHARS, MAX_DASHBOARD_ENTRIES, MAX_DIFF_ITEMS_DISPLAYED, getActiveSuggestions } from '../core/state'
import { mergeDashboardEntriesForWastedRender } from '../core/dashboardFifo'
import { BadgeButton } from './BadgeButton'
import { DiffList, SuggestionCard } from './SuggestionCard'

type Entry = {
  componentName: string
  wastedRenderCount: number
  latestPropDiff: PropDiff[]
  latestStateDiff: StateDiff[] | null
  propDiffOverflow: boolean
  stateDiffOverflow: boolean
  suggestions: MemoSuggestion[]
  firstDetectedAt: number
}

const positionStyles: Record<DashboardPosition, CSSProperties> = {
  'top-left': { top: '16px', left: '16px' },
  'top-right': { top: '16px', right: '16px' },
  'bottom-left': { bottom: '16px', left: '16px' },
  'bottom-right': { bottom: '16px', right: '16px' },
}

function takeDiffs(record: RenderRecord): {
  prop: PropDiff[]
  state: StateDiff[] | null
  propOverflow: boolean
  stateOverflow: boolean
} {
  const propOverflow = record.propDiff.length > MAX_DIFF_ITEMS_DISPLAYED
  const stateOverflow = (record.stateDiff?.length ?? 0) > MAX_DIFF_ITEMS_DISPLAYED
  const prop = record.propDiff.slice(0, MAX_DIFF_ITEMS_DISPLAYED)
  const state = record.stateDiff ? record.stateDiff.slice(0, MAX_DIFF_ITEMS_DISPLAYED) : null
  return { prop, state, propOverflow, stateOverflow }
}

function kbdActivate(e: KeyboardEvent<HTMLButtonElement>): void {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    e.currentTarget.click()
  }
}

const miniBtn: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  borderRadius: 8,
  border: '1px solid rgba(0,0,0,0.12)',
  background: '#fff',
  padding: '6px 10px',
  cursor: 'pointer',
}

function focusOutline(e: FocusEvent<HTMLButtonElement>): void {
  e.currentTarget.style.outline = '2px solid #60a5fa'
  e.currentTarget.style.outlineOffset = '2px'
}

function blurOutline(e: FocusEvent<HTMLButtonElement>): void {
  e.currentTarget.style.outline = 'none'
  e.currentTarget.style.outlineOffset = '0px'
}

export function DashboardApp(props: { config: PerfScanConfig }): ReactElement {
  const [entries, setEntries] = useState<Entry[]>([])
  const [isVisible, setIsVisible] = useState(true)
  const [totalWasted, setTotalWasted] = useState(0)

  const pos = positionStyles[props.config.dashboardPosition]

  useEffect(() => {
    const unsubWasted = eventBus.on('wasted-render', (evt) => {
      setTotalWasted((n) => n + 1)
      setEntries((prev) => {
        const { prop, state, propOverflow, stateOverflow } = takeDiffs(evt.record)
        const now = Date.now()
        const suggestions = getActiveSuggestions().get(evt.componentName) ?? []

        return mergeDashboardEntriesForWastedRender(
          prev,
          evt.componentName,
          {
            componentName: evt.componentName,
            wastedRenderCount: 1,
            latestPropDiff: prop,
            latestStateDiff: state,
            propDiffOverflow: propOverflow,
            stateDiffOverflow: stateOverflow,
            suggestions,
            firstDetectedAt: now,
          },
          MAX_DASHBOARD_ENTRIES,
          (cur) => ({
            ...cur,
            wastedRenderCount: cur.wastedRenderCount + 1,
            latestPropDiff: prop,
            latestStateDiff: state,
            propDiffOverflow: propOverflow,
            stateDiffOverflow: stateOverflow,
            suggestions: getActiveSuggestions().get(evt.componentName) ?? cur.suggestions,
          }),
        )
      })
    })

    const unsubSuggestion = eventBus.on('suggestion-generated', (evt) => {
      setEntries((prev) => {
        const idx = prev.findIndex((e) => e.componentName === evt.suggestion.componentName)
        if (idx === -1) return prev
        const copy = [...prev]
        const cur = copy[idx]!
        const without = cur.suggestions.filter((s) => s.type !== evt.suggestion.type)
        copy[idx] = { ...cur, suggestions: [...without, evt.suggestion] }
        return copy
      })
    })

    const unsubDismiss = eventBus.on('suggestion-dismissed', (evt) => {
      setEntries((prev) => {
        const idx = prev.findIndex((e) => e.componentName === evt.componentName)
        if (idx === -1) return prev
        const copy = [...prev]
        const cur = copy[idx]!
        copy[idx] = {
          ...cur,
          suggestions: cur.suggestions.filter((s) => s.type !== evt.suggestionType),
        }
        return copy
      })
    })

    return () => {
      unsubWasted()
      unsubSuggestion()
      unsubDismiss()
    }
  }, [])

  const panel = useMemo(() => {
    return (
      <div
        style={{
          width: 380,
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: 'calc(100vh - 32px)',
          overflow: 'auto',
          borderRadius: 14,
          border: '1px solid rgba(0,0,0,0.10)',
          background: 'rgba(249,250,251,0.98)',
          boxShadow: '0 18px 60px rgba(0,0,0,0.25)',
          padding: 12,
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
          color: '#111827',
          position: 'fixed',
          zIndex: 99999,
          ...pos,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 800 }}>react-perf-scan</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => {
                setEntries([])
                setTotalWasted(0)
              }}
              onKeyDown={kbdActivate}
              style={miniBtn}
              onFocus={focusOutline}
              onBlur={blurOutline}
            >
              Clear
            </button>
            <button
              type="button"
              aria-label="Close dashboard"
              onClick={() => setIsVisible(false)}
              onKeyDown={kbdActivate}
              style={miniBtn}
              onFocus={focusOutline}
              onBlur={blurOutline}
            >
              ×
            </button>
          </div>
        </div>

        {entries.length === 0 ? (
          <div style={{ fontSize: 12, color: '#6b7280', padding: '6px 2px' }}>No wasted renders detected yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {entries.map((e) => (
              <div key={e.componentName} style={{ borderRadius: 12, border: '1px solid rgba(0,0,0,0.08)', padding: 10, background: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 800 }}>{e.componentName}</div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>wasted: {e.wastedRenderCount}</div>
                </div>

                {e.latestPropDiff.length > 0 ? (
                  <div>
                    <DiffList title="Prop changes" items={e.latestPropDiff} />
                    {e.propDiffOverflow ? (
                      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6 }}>Showing first {MAX_DIFF_ITEMS_DISPLAYED} diffs…</div>
                    ) : null}
                  </div>
                ) : null}

                {e.latestStateDiff && e.latestStateDiff.length > 0 ? (
                  <div>
                    <DiffList title="State changes" items={e.latestStateDiff} />
                    {e.stateDiffOverflow ? (
                      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6 }}>Showing first {MAX_DIFF_ITEMS_DISPLAYED} diffs…</div>
                    ) : null}
                  </div>
                ) : null}

                {e.suggestions.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                    {e.suggestions.map((s) => (
                      <SuggestionCard
                        key={s.type}
                        suggestion={s}
                        style={{}}
                        onDismiss={() => memoSuggestionEngine.dismiss(e.componentName, s.type)}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}

        <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 10, lineHeight: 1.4 }}>
          Values are truncated to {DIFF_VALUE_MAX_CHARS} chars (JSON). This panel is dev-only.
        </div>
      </div>
    )
  }, [entries, pos])

  const badge = useMemo(() => {
    return (
      <BadgeButton
        label="Open react-perf-scan dashboard"
        count={totalWasted}
        maxCount={BADGE_COUNTER_MAX}
        onClick={() => setIsVisible(true)}
        style={{
          position: 'fixed',
          zIndex: 99999,
          ...pos,
        }}
      />
    )
  }, [pos, totalWasted])

  return (
    <>
      {isVisible ? createPortal(panel, document.body) : null}
      {!isVisible ? createPortal(badge, document.body) : null}
    </>
  )
}
