import type { CSSProperties, ReactElement } from 'react'

export function BadgeButton(props: {
  label: string
  count: number
  maxCount: number
  onClick: () => void
  style: CSSProperties
}): ReactElement {
  const text = props.count > props.maxCount ? `${props.maxCount}+` : String(props.count)

  return (
    <button
      type="button"
      aria-label={props.label}
      onClick={props.onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          props.onClick()
        }
      }}
      style={{
        width: '48px',
        height: '48px',
        borderRadius: '12px',
        border: '1px solid rgba(0,0,0,0.12)',
        background: '#111827',
        color: '#fff',
        cursor: 'pointer',
        position: 'relative',
        boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
        outline: 'none',
        ...props.style,
      }}
      onFocus={(e) => {
        e.currentTarget.style.outline = '2px solid #60a5fa'
        e.currentTarget.style.outlineOffset = '2px'
      }}
      onBlur={(e) => {
        e.currentTarget.style.outline = 'none'
        e.currentTarget.style.outlineOffset = '0px'
      }}
    >
      <span style={{ fontSize: 18, fontWeight: 700 }}>▦</span>
      {props.count > 0 ? (
        <span
          style={{
            position: 'absolute',
            top: -6,
            right: -6,
            minWidth: 22,
            height: 22,
            padding: '0 6px',
            borderRadius: 999,
            background: '#ef4444',
            color: '#fff',
            fontSize: 12,
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {text}
        </span>
      ) : null}
    </button>
  )
}
