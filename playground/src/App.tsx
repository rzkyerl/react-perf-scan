import type { ReactElement } from 'react'
import { useMemo, useState } from 'react'

function ObjectPropChild(props: { value: { count: number } }): ReactElement {
  return <div style={{ padding: 8, border: '1px solid #e5e7eb', borderRadius: 8 }}>object prop count: {props.value.count}</div>
}

function CallbackChild(props: { onTick: () => void; ticks: number }): ReactElement {
  return (
    <div style={{ padding: 8, border: '1px solid #e5e7eb', borderRadius: 8 }}>
      ticks: {props.ticks}
      <button type="button" onClick={props.onTick} style={{ marginLeft: 10 }}>
        child click
      </button>
    </div>
  )
}

function DrilledLeaf(props: { value: number }): ReactElement {
  return <div style={{ padding: 8, border: '1px solid #e5e7eb', borderRadius: 8 }}>drilled value: {props.value}</div>
}

function DrilledMiddle(props: { value: number }): ReactElement {
  return <DrilledLeaf value={props.value} />
}

export function App(): ReactElement {
  const [counter, setCounter] = useState(0)
  const [ticks, setTicks] = useState(0)
  const [stableN] = useState(0)

  // (c) object literal prop without useMemo — new reference each parent render
  const badObject = { count: counter }

  // Stable object reference unless stableN changes (it never does here)
  const stableObject = useMemo(() => ({ count: stableN }), [stableN])

  // (b) unstable callback without useCallback
  const badCallback = () => setTicks((t) => t + 1)

  return (
    <div style={{ fontFamily: 'system-ui', padding: 16, maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ marginTop: 0 }}>react-perf-scan playground</h1>
      <p style={{ color: '#374151', lineHeight: 1.5 }}>
        This page intentionally triggers wasted renders: prop drilling, unstable callbacks, and unstable object props.
      </p>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <button type="button" onClick={() => setCounter((c) => c + 1)}>
          bump parent counter ({counter})
        </button>
      </div>

      <h2 style={{ fontSize: 16 }}>(a) Prop drilling without memoization</h2>
      <DrilledMiddle value={42} />

      <h2 style={{ fontSize: 16, marginTop: 18 }}>(b) Unstable function prop</h2>
      <CallbackChild onTick={badCallback} ticks={ticks} />

      <h2 style={{ fontSize: 16, marginTop: 18 }}>(c) Unstable object prop</h2>
      <ObjectPropChild value={badObject} />

      <h2 style={{ fontSize: 16, marginTop: 18 }}>Stable control (should not waste)</h2>
      <ObjectPropChild value={stableObject} />
    </div>
  )
}
