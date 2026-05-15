# Changelog

All notable changes to `react-perf-scan` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [0.1.1] — 2026-05-15

### Fixed

- README.md now correctly appears on the npm package page (was missing in 0.1.0
  due to monorepo root placement)

---

## [0.1.0] — 2026-05-15

### Added

- `initPerfScan(options?)` — initializes all instrumentation before `createRoot().render()`
- `destroyPerfScan()` — full teardown: removes instrumentation, unmounts dashboard, resets state
- **Visual highlighter** — flashes a CSS outline on DOM nodes of wasting components
- **Floating dashboard** — lists wasting components with wasted count, prop diffs, and state diffs
- **Memo suggestion engine** — auto-generates `React.memo`, `useCallback`, `useMemo` code snippets
  with one-click copy when `renderThreshold` is reached
- **Suspense-aware detection** — renders under an active `<Suspense>` fallback are never flagged as wasted
- **Configurable options**: `enabled`, `flashColor`, `flashDuration`, `dashboardPosition`,
  `renderThreshold`, `trackComponents`
- **Production no-op stub** (`index.prod.*`) — zero runtime cost in production builds
- **Dev/prod conditional exports** — bundlers automatically pick the right bundle via `"development"` /
  `"production"` export conditions; fallback defaults to the prod no-op
- **TypeScript types** exported: `PerfScanOptions`, `DashboardPosition`, `RenderRecord`, `PropDiff`,
  `StateDiff`, `MemoSuggestion`, `SuggestionType`
- CI pipeline (GitHub Actions): typecheck → unit tests → build → bundle size report
- Playground app (Vite) with intentional wasted-render scenarios for manual testing
