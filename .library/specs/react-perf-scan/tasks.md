# Tasks: react-perf-scan

Legend: `[x]` done, `[ ]` not done / follow-up

## Foundation

- [x] Monorepo scaffold (`pnpm-workspace.yaml`, root `package.json`)
- [x] Package `packages/react-perf-scan` with dual dev/prod exports (`tsup` + `tsc` declarations)
- [x] Public API: `initPerfScan`, `destroyPerfScan`, exported types

## Core modules

- [x] `validateConfig` + defaults + `console.warn` for invalid numeric / position values
- [x] Internal singleton state (`initialized`, records, dismissed suggestions, active suggestions)
- [x] Typed internal `eventBus`
- [x] `shallowDiff` for props / extracted hook snapshots
- [x] `renderTracker`: Profiler-driven post-commit fiber walk, wasted render detection, FIFO record cap
- [x] `reactRootPatch`: wrap `createRoot` / `hydrateRoot` subtrees with `React.Profiler`
- [x] `memoSuggestionEngine`: threshold + ratio heuristics, dismiss persistence (session), emits suggestion events

## UI modules

- [x] `visualHighlighter`: outline flash + timer restart semantics + destroy cleanup
- [x] Dashboard portal mount + CSS reset container + fixed positioning + z-index
- [x] Dashboard entries: FIFO max 10, diff truncation + overflow hint, Clear/Close/badge flows
- [x] Suggestion cards: Copy / Dismiss + clipboard fallback UI
- [x] `ErrorBoundary` around dashboard React tree

## Playground

- [x] Vite playground demonstrating (a) drilling, (b) unstable callback, (c) unstable object prop

## Spec gaps / hardening (follow-ups)

- [x] Suspense-fallback suppression for wasted-render classification (Req 6.3) — `memoizedState` SUSPENDED_MARKER heuristic in `suspenseHeuristic.ts`
- [x] `__REACT_DEVTOOLS_GLOBAL_HOOK__` fiber commit integration (optional) beyond Profiler scheduling
- [x] Automated tests (Profiler scheduling + memo engine ratios + dashboard FIFO)
- [x] Bundle size verification (Req 7.5) via analyzer in CI

## Notes

- `initPerfScan()` must run **before** the app’s first `createRoot(...).render(...)` so the `react-dom/client` patch can wrap the tree with `React.Profiler`.
- GitHub Actions workflow `.github/workflows/ci.yml` runs typecheck, tests, build, and `pnpm --filter react-perf-scan size:report` (gzip sizes; Req 7.5 target is tracked, not enforced as a hard limit yet).
