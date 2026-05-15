import type { CSSProperties, FocusEvent, KeyboardEvent, ReactElement } from 'react'
import { useMemo, useState } from 'react'
import { DIFF_VALUE_MAX_CHARS } from '../core/state'
import type { MemoSuggestion } from '../types'

function formatJsonish(value: unknown, max = DIFF_VALUE_MAX_CHARS): string {
  try {
    if (typeof value === 'function') return '[function]'
    const s = JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? v.toString() : v))
    if (s.length > max) return s.slice(0, max - 1) + '…'
    return s
  } catch {
    const s = String(value)
    return s.length > max ? s.slice(0, max - 1) + '…' : s
  }
}

export function SuggestionCard(props: {
  suggestion: MemoSuggestion
  style: CSSProperties
  onDismiss: () => void
}): ReactElement {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'manual'>('idle')

  const preText = useMemo(() => props.suggestion.codeSnippet, [props.suggestion.codeSnippet])

  async function copy(): Promise<void> {
    try {
      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
        setCopyState('manual')
        return
      }
      await navigator.clipboard.writeText(props.suggestion.codeSnippet)
      setCopyState('copied')
      window.setTimeout(() => setCopyState('idle'), 2000)
    } catch {
      setCopyState('manual')
    }
  }

  return (
    <div
      style={{
        border: '1px solid rgba(0,0,0,0.08)',
        borderRadius: 10,
        padding: 10,
        background: 'rgba(255,255,255,0.85)',
        ...props.style,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{props.suggestion.type}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => void copy()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                void copy()
              }
            }}
            style={btnStyle}
            onFocus={onFocus}
            onBlur={onBlur}
          >
            {copyState === 'copied' ? 'Copied!' : copyState === 'manual' ? 'Copy manually' : 'Copy'}
          </button>
          <button type="button" onClick={props.onDismiss} onKeyDown={activateOnSpace} style={btnStyle} onFocus={onFocus} onBlur={onBlur}>
            Dismiss
          </button>
        </div>
      </div>
      <div style={{ fontSize: 12, color: '#374151', marginBottom: 8 }}>{props.suggestion.explanation}</div>
      {copyState === 'manual' ? (
        <div style={{ fontSize: 11, color: '#b45309', marginBottom: 8 }}>Copy manually</div>
      ) : null}
      <pre
        style={{
          margin: 0,
          padding: 10,
          borderRadius: 8,
          background: '#0b1020',
          color: '#e5e7eb',
          fontSize: 11,
          overflow: 'auto',
          maxHeight: 160,
          whiteSpace: 'pre-wrap',
        }}
      >
        {preText}
      </pre>
    </div>
  )
}

const btnStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 8,
  border: '1px solid rgba(0,0,0,0.12)',
  background: '#fff',
  color: '#111827',
  padding: '6px 10px',
  cursor: 'pointer',
}

function onFocus(e: FocusEvent<HTMLButtonElement>): void {
  e.currentTarget.style.outline = '2px solid #60a5fa'
  e.currentTarget.style.outlineOffset = '2px'
}

function onBlur(e: FocusEvent<HTMLButtonElement>): void {
  e.currentTarget.style.outline = 'none'
  e.currentTarget.style.outlineOffset = '0px'
}

function activateOnSpace(e: KeyboardEvent<HTMLButtonElement>): void {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    e.currentTarget.click()
  }
}

export function DiffList(props: {
  title: string
  items: Array<{ key: string; prevValue: unknown; nextValue: unknown }>
}): ReactElement | null {
  if (props.items.length === 0) return null
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#111827', marginBottom: 6 }}>{props.title}</div>
      <ul style={{ margin: 0, paddingLeft: 16 }}>
        {props.items.map((d) => (
          <li key={d.key} style={{ fontSize: 11, color: '#374151', marginBottom: 6 }}>
            <span style={{ fontWeight: 700 }}>{d.key}</span>: {formatJsonish(d.prevValue)} → {formatJsonish(d.nextValue)}
          </li>
        ))}
      </ul>
    </div>
  )
}
