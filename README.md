# react-perf-scan

> **Dev-only** wasted-render visualizer and memoization advisor for React 18 & 19.

[![CI](https://github.com/rzkyerl/react-perf-scan/actions/workflows/ci.yml/badge.svg)](https://github.com/rzkyerl/react-perf-scan/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![React](https://img.shields.io/badge/React-18%20%7C%2019-61DAFB?logo=react)](https://react.dev)

`react-perf-scan` wraps your React tree in a `Profiler`, intercepts every commit
via the React DevTools global hook, and **highlights components that re-rendered without
any prop or state change** — wasted renders. For each offender it generates copy-ready
`React.memo`, `useCallback`, and `useMemo` code snippets.

**Zero production cost.** In production builds the library is a no-op stub (`index.prod.*`)
so it ships 0 bytes of overhead to your users.

---

## Features

- 🔴 **Visual flash** — outlines DOM nodes of wasting components in real time
- 📊 **Floating dashboard** — lists every wasting component, wasted count, and prop/state diffs
- 💡 **Memo suggestions** — auto-generated `React.memo` / `useCallback` / `useMemo` snippets with one-click copy
- 🚫 **Suspense-aware** — never marks renders under an active Suspense fallback as wasted
- ⚙️ **Configurable** — flash color, duration, position, component filter, render threshold
- 🧹 **Clean teardown** — `destroyPerfScan()` removes all instrumentation with zero side effects

---

## Installation

> **Note:** `react-perf-scan` is not yet published to npm. Install directly from GitHub:

```bash
# npm
npm install github:rzkyerl/react-perf-scan#main --save-dev

# pnpm
pnpm add github:rzkyerl/react-perf-scan#main -D

# yarn
yarn add github:rzkyerl/react-perf-scan#main --dev
```

Or clone and build locally (see [Contributing](#contributing)).

**Peer dependencies** (already in your project):

```bash
react >= 18.0.0
react-dom >= 18.0.0
```

---

## Quick Start

Call `initPerfScan()` **before** `createRoot(...).render(...)` so the library can wrap
your tree with a React `Profiler`.

```tsx
// src/main.tsx
import { initPerfScan } from 'react-perf-scan'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'

// Only runs in development — no-op in production builds
initPerfScan()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

That's it. Open your app in the browser and interact with it. Any component that
re-renders without a prop or state change will flash red and appear in the dashboard.

---

## Configuration

```tsx
initPerfScan({
  enabled: true,              // false → disables all instrumentation
  flashColor: 'rgba(255, 0, 0, 0.3)', // CSS color for the wasted-render outline flash
  flashDuration: 500,         // Flash duration in ms (1–60000). Default: 500
  dashboardPosition: 'bottom-right',  // 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  renderThreshold: 3,         // Min consecutive wasted renders before memo suggestions appear
  trackComponents: [],        // If non-empty, only track these component display names
})
```

### Option Reference

| Option | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | `true` | Master switch. Set to `false` to disable everything. |
| `flashColor` | `string` | `"rgba(255,0,0,0.3)"` | CSS color applied as `outline` to wasting DOM nodes. |
| `flashDuration` | `number` | `500` | Outline visible duration in milliseconds. |
| `dashboardPosition` | `DashboardPosition` | `"bottom-right"` | Corner where the floating panel appears. |
| `renderThreshold` | `number` | `3` | Minimum wasted renders before suggestions are generated. |
| `trackComponents` | `string[]` | `[]` | Allowlist by component `displayName`. Empty = track all. |

---

## API Reference

### `initPerfScan(options?)`

Initializes all instrumentation. Must be called before `createRoot().render()`.
Safe to call multiple times — subsequent calls are no-ops if already initialized.

```ts
import { initPerfScan } from 'react-perf-scan'

initPerfScan({ dashboardPosition: 'top-left', renderThreshold: 5 })
```

### `destroyPerfScan()`

Tears down all instrumentation, unmounts the dashboard, clears all state, and
restores the original `createRoot` / `hydrateRoot` implementations.

```ts
import { destroyPerfScan } from 'react-perf-scan'

// e.g. during hot-module replacement or in tests
destroyPerfScan()
```

### Exported Types

```ts
import type {
  PerfScanOptions,    // Options object for initPerfScan()
  DashboardPosition,  // 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  RenderRecord,       // One committed render observation
  PropDiff,           // Single prop key change between renders
  StateDiff,          // Same shape as PropDiff, for hook state
  MemoSuggestion,     // A generated memoization hint
  SuggestionType,     // 'memo' | 'useMemo' | 'useCallback'
} from 'react-perf-scan'
```

---

## Restricting to Specific Components

Use `trackComponents` to focus on a subset of your component tree:

```tsx
initPerfScan({
  trackComponents: ['ProductCard', 'DataTable', 'ChartWidget'],
})
```

Only `ProductCard`, `DataTable`, and `ChartWidget` will be tracked.
Component names must match the `displayName` (case-sensitive).

---

## Dashboard

The floating dashboard panel shows:

- **Component name** and **wasted render count**
- **Prop diffs** — which props changed (or didn't) between renders
- **State diffs** — hook state snapshot deltas (displayed as `hook_0`, `hook_1`, …)
- **Memo suggestions** — `React.memo`, `useCallback`, `useMemo` snippets you can copy

Click **Clear** to reset the list. Click **×** to minimize the panel to a badge (click the badge to reopen).

---

## How It Works

```
initPerfScan()
    │
    ├─ patchReactDomClient()      Wraps createRoot/hydrateRoot so every tree
    │                             is wrapped in a <Profiler id="react-perf-scan-root">
    │
    ├─ installDevToolsCommitHook() Subscribes to __REACT_DEVTOOLS_GLOBAL_HOOK__
    │                             .onCommitFiberRoot to be notified after every commit
    │
    ├─ renderTracker.init()       On each commit, walks the fiber tree via
    │                             queueMicrotask, reads memoizedProps / memoizedState,
    │                             computes shallow diffs, detects wasted renders,
    │                             emits events on the internal eventBus
    │
    ├─ visualHighlighter.init()   Listens for 'wasted-render' events and applies
    │                             a CSS outline flash to the component's DOM node
    │
    ├─ memoSuggestionEngine.init() Listens for 'wasted-render' events, analyzes
    │                              prop/state change patterns, and emits suggestions
    │                              when renderThreshold is reached
    │
    └─ mountDashboard()           Renders a React app into its own isolated root
                                  that listens for events and shows the panel
```

> **Suspense safety:** If a component sits under a `<Suspense>` boundary that is
> currently showing its fallback, its renders are never classified as wasted. This
> avoids false positives during loading states.

---

## Production Safety

`react-perf-scan` uses **conditional exports** to ship two separate bundles:

| Condition | Bundle | Size |
|---|---|---|
| `development` | `index.dev.*` | Full tracking + dashboard |
| `production` | `index.prod.*` | No-op stubs only (~0 bytes) |
| fallback (unknown bundler) | `index.prod.*` | No-op stubs (safe default) |

In Vite, Create React App (Webpack), and most modern bundlers, `NODE_ENV` is
automatically used to select the correct condition. No extra configuration needed.

---

## Known Limitations

- **Fiber internals are private.** `react-perf-scan` reads React's internal fiber tree
  (`memoizedProps`, `memoizedState`, etc.) which are not part of the public API and
  may change in future React versions. This is a known trade-off for dev-time tooling.
- **Hook state shown as `hook_0`, `hook_1`, …** — React does not expose hook names at
  runtime. State diffs use positional indices.
- **Requires `createRoot`.** Legacy `ReactDOM.render()` (React 17 and below) is not supported.

---

## Contributing

```bash
# 1. Clone the repo
git clone https://github.com/rzkyerl/react-perf-scan.git
cd react-perf-scan

# 2. Install dependencies (requires pnpm >= 9 and Node >= 18)
pnpm install

# 3. Build the library
pnpm build

# 4. Run the playground
pnpm dev

# 5. Run tests
pnpm test

# 6. Type check
pnpm typecheck
```

### Repository Structure

```
react-perf-scan/
├── packages/
│   └── react-perf-scan/     ← library source
│       ├── src/
│       │   ├── core/        ← renderTracker, memoSuggestionEngine, devToolsHook, …
│       │   ├── ui/          ← Dashboard, BadgeButton, SuggestionCard, visualHighlighter
│       │   ├── types.ts     ← public TypeScript types
│       │   ├── index.ts     ← dev entry point
│       │   └── index.prod.ts ← production no-op entry point
│       └── dist/            ← build output (generated, not committed)
└── playground/              ← Vite app for manual testing
```

---

## License

[MIT](LICENSE) — © 2026 rzkyerl
