# Design Document: react-perf-scan

## Overview

`react-perf-scan` adalah developer tool library untuk React yang mendeteksi, memvisualisasikan, dan memberikan saran perbaikan untuk *wasted render* — re-render komponen yang tidak menghasilkan perubahan output nyata. Library beroperasi **hanya di mode development** dan memiliki zero footprint di production build.

### Tujuan Desain

- **Non-intrusive**: Library tidak mengubah output render komponen yang dipantau sama sekali.
- **Zero production cost**: Seluruh kode library dieliminasi dari bundle production melalui tree-shaking.
- **Resilient**: Semua error internal ditangkap dan dilaporkan tanpa menyebabkan crash pada aplikasi host.
- **Self-contained**: Dashboard UI terisolasi dari styling aplikasi host menggunakan CSS reset.

### Ringkasan Arsitektur

Library terdiri dari empat modul inti yang berkomunikasi melalui sebuah event bus internal:

```
Consumer App
    │
    ▼
initPerfScan(options)          ← Public API entry point
    │
    ├─► RenderTracker           ← Profiler API + Fiber hook integration
    │       │ WastedRenderEvent
    │       ▼
    ├─► VisualHighlighter       ← DOM flash effect management
    │
    ├─► MemoSuggestionEngine    ← Pattern analysis & code generation
    │       │ SuggestionEvent
    │       ▼
    └─► Dashboard               ← React Portal overlay UI
```

Data mengalir satu arah: `RenderTracker` menghasilkan events, `VisualHighlighter` dan `MemoSuggestionEngine` mengkonsumsi events tersebut, dan `Dashboard` menampilkan state yang dikelola oleh `MemoSuggestionEngine` dan `RenderTracker`.

---

## Architecture

### Module Breakdown

```
packages/react-perf-scan/src/
├── index.ts                    ← Public API entry point (dev)
├── index.prod.ts               ← No-op stubs (production)
├── core/
│   ├── config.ts               ← PerfScanOptions validation & defaults
│   ├── eventBus.ts             ← Internal typed event emitter
│   ├── renderTracker.ts        ← RenderTracker: Profiler + Fiber hook
│   ├── shallowDiff.ts          ← Shallow equality comparison algorithm
│   ├── memoSuggestionEngine.ts ← Pattern analysis & suggestion generation
│   └── state.ts                ← Singleton library state (init guard, records)
├── ui/
│   ├── visualHighlighter.ts    ← DOM flash effect + timer management
│   ├── Dashboard.tsx           ← React Portal overlay component
│   ├── DashboardEntry.tsx      ← Single component entry with diffs & suggestions
│   ├── SuggestionCard.tsx      ← MemoSuggestion display with Copy/Dismiss
│   ├── BadgeButton.tsx         ← Collapsed state badge
│   └── ErrorBoundary.tsx       ← Dashboard error boundary
└── types.ts                    ← All exported TypeScript types
```

### Dependency Graph

```
index.ts
  └── config.ts
  └── state.ts
  └── eventBus.ts
  └── renderTracker.ts
  │     └── shallowDiff.ts
  │     └── eventBus.ts
  │     └── state.ts
  └── visualHighlighter.ts
  │     └── eventBus.ts
  └── memoSuggestionEngine.ts
  │     └── state.ts
  │     └── eventBus.ts
  └── Dashboard.tsx (React)
        └── ErrorBoundary.tsx
        └── DashboardEntry.tsx
        └── SuggestionCard.tsx
        └── BadgeButton.tsx
        └── state.ts (read-only)
```

Tidak ada circular dependency. `state.ts` adalah satu-satunya modul yang dibaca oleh beberapa modul lain; semua mutasi state dilakukan melalui fungsi yang diekspor dari `state.ts`.

### Initialization Flow

```
initPerfScan(options)
  │
  ├─ [guard] NODE_ENV !== 'development' → return (no-op)
  ├─ [guard] already initialized → return (idempotency)
  ├─ [guard] enabled === false → return (no-op)
  │
  ├─ validateConfig(options) → PerfScanConfig (with defaults)
  ├─ setState({ initialized: true, config })
  ├─ renderTracker.init(config)
  │     └─ install __REACT_DEVTOOLS_GLOBAL_HOOK__ listener
  │     └─ register onCommitFiberRoot handler
  ├─ visualHighlighter.init(config)
  └─ dashboard.mount(config)
        └─ createPortal → document.body
```

### Destruction Flow

```
destroyPerfScan()
  │
  ├─ [safe] if not initialized → return (no-op, no error)
  ├─ visualHighlighter.destroy()
  │     └─ clear all active timers
  │     └─ remove all flash styles from DOM nodes
  ├─ renderTracker.destroy()
  │     └─ unregister onCommitFiberRoot handler
  │     └─ clear all RenderRecords
  ├─ dashboard.unmount()
  │     └─ unmount React tree from portal container
  │     └─ remove portal container from document.body
  └─ setState(initialState)
```

---

## Components and Interfaces

### 1. Public API (`index.ts`)

```typescript
// Entry point — semua export adalah named exports, tidak ada default export

export function initPerfScan(options?: PerfScanOptions): void
export function destroyPerfScan(): void
export type { PerfScanOptions, DashboardPosition, MemoSuggestion, RenderRecord, PropDiff, StateDiff }
```

**Rationale**: Named exports memungkinkan tree-shaking yang optimal. `index.prod.ts` mengekspor versi no-op dari fungsi yang sama sehingga consumer tidak perlu mengubah import mereka.

### 2. Config Module (`core/config.ts`)

```typescript
interface PerfScanConfig {
  enabled: boolean           // default: true
  flashColor: string         // default: "rgba(255, 0, 0, 0.3)"
  flashDuration: number      // default: 500, range: 1–60000
  dashboardPosition: DashboardPosition  // default: "bottom-right"
  renderThreshold: number    // default: 3, min: 1
  trackComponents: string[]  // default: []
}

function validateConfig(options?: PerfScanOptions): PerfScanConfig
```

`validateConfig` menerapkan defaults untuk setiap field yang hilang atau invalid, dan memanggil `console.warn` untuk setiap nilai yang digantikan dengan default.

### 3. Event Bus (`core/eventBus.ts`)

Event bus internal menggunakan pola publish-subscribe yang ringan. Tidak menggunakan `EventEmitter` Node.js untuk menjaga kompatibilitas browser.

```typescript
type EventMap = {
  'wasted-render': WastedRenderEvent
  'suggestion-generated': SuggestionEvent
  'suggestion-dismissed': DismissEvent
  'destroy': void
}

interface WastedRenderEvent {
  componentName: string
  record: RenderRecord
  domNode: Element | null
}

interface SuggestionEvent {
  suggestion: MemoSuggestion
}

interface DismissEvent {
  componentName: string
  suggestionType: SuggestionType
}

const eventBus: {
  on<K extends keyof EventMap>(event: K, handler: (data: EventMap[K]) => void): () => void
  emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void
  off<K extends keyof EventMap>(event: K, handler: (data: EventMap[K]) => void): void
  clear(): void
}
```

`on()` mengembalikan fungsi unsubscribe untuk memudahkan cleanup. `clear()` dipanggil oleh `destroyPerfScan()`.

### 4. RenderTracker (`core/renderTracker.ts`)

```typescript
interface RenderTrackerAPI {
  init(config: PerfScanConfig): void
  destroy(): void
  getRecords(componentName: string): RenderRecord[]
  getAllRecords(): Map<string, RenderRecord[]>
}
```

### 5. VisualHighlighter (`ui/visualHighlighter.ts`)

```typescript
interface VisualHighlighterAPI {
  init(config: PerfScanConfig): void
  flash(domNode: Element, componentName: string): void
  destroy(): void
}
```

### 6. MemoSuggestionEngine (`core/memoSuggestionEngine.ts`)

```typescript
interface MemoSuggestionEngineAPI {
  init(config: PerfScanConfig): void
  analyze(componentName: string, records: RenderRecord[]): MemoSuggestion[]
  dismiss(componentName: string, type: SuggestionType): void
  getActiveSuggestions(): Map<string, MemoSuggestion[]>
  destroy(): void
}
```

### 7. Dashboard (`ui/Dashboard.tsx`)

```typescript
interface DashboardProps {
  config: PerfScanConfig
}

// Internal state (React useState)
interface DashboardState {
  entries: DashboardEntry[]
  isVisible: boolean
  totalWastedRenders: number
}

interface DashboardEntry {
  componentName: string
  wastedRenderCount: number
  latestDiff: { propDiff: PropDiff[]; stateDiff: StateDiff[] | null }
  suggestions: MemoSuggestion[]
  firstDetectedAt: number  // Unix ms, used for FIFO eviction
}
```

---

## Data Models

### RenderRecord

```typescript
interface RenderRecord {
  componentName: string
  timestamp: number          // Unix ms (Date.now())
  duration: number           // actualDuration dari Profiler callback (ms)
  phase: 'mount' | 'update'
  propDiff: PropDiff[]       // array key yang berubah
  stateDiff: StateDiff[] | null  // null jika state tidak dapat diakses
  isWasted: boolean
}
```

### PropDiff / StateDiff

```typescript
interface PropDiff {
  key: string
  prevValue: unknown
  nextValue: unknown
  changeType: 'added' | 'removed' | 'changed'
}

type StateDiff = PropDiff  // struktur identik
```

### MemoSuggestion

```typescript
type SuggestionType = 'memo' | 'useMemo' | 'useCallback'

interface MemoSuggestion {
  componentName: string
  type: SuggestionType
  codeSnippet: string        // kode siap salin
  explanation: string        // max 200 karakter
  isDismissed: boolean
}
```

### PerfScanOptions (Public Type)

```typescript
type DashboardPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

interface PerfScanOptions {
  enabled?: boolean
  flashColor?: string
  flashDuration?: number
  dashboardPosition?: DashboardPosition
  renderThreshold?: number
  trackComponents?: string[]
}
```

### Internal Library State (`core/state.ts`)

```typescript
interface LibraryState {
  initialized: boolean
  config: PerfScanConfig | null
  // RenderRecords: Map<componentName, RenderRecord[]>
  // Capped at MAX_RECORDS_PER_COMPONENT = 100 (FIFO)
  renderRecords: Map<string, RenderRecord[]>
  // Dismissed suggestions: Set<`${componentName}:${SuggestionType}`>
  dismissedSuggestions: Set<string>
  // Active suggestions: Map<componentName, MemoSuggestion[]>
  activeSuggestions: Map<string, MemoSuggestion[]>
}

const MAX_RECORDS_PER_COMPONENT = 100
const MAX_DASHBOARD_ENTRIES = 10
const MAX_DIFF_ITEMS_DISPLAYED = 5
const SUGGESTION_EXPLANATION_MAX_CHARS = 200
const DIFF_VALUE_MAX_CHARS = 50
const BADGE_COUNTER_MAX = 999
```

---

## Key Design Decisions

### React Profiler API Integration

`React.Profiler` adalah komponen bawaan React yang memanggil `onRenderCallback` setiap kali subtree yang dibungkusnya melakukan commit ke DOM. Ini adalah API resmi dan stabil.

**Signature callback**:
```typescript
type ProfilerOnRenderCallback = (
  id: string,              // Profiler id (= nama komponen yang dipantau)
  phase: 'mount' | 'update',
  actualDuration: number,  // waktu render aktual (ms)
  baseDuration: number,    // estimasi waktu tanpa memoization
  startTime: number,       // kapan render dimulai
  commitTime: number       // kapan commit selesai
) => void
```

**Keterbatasan**: `onRenderCallback` hanya memberikan data timing dan phase, bukan props/state aktual. Untuk mendapatkan props dan state, library menggunakan `ReactFiberDevToolsHook`.

### ReactFiberDevToolsHook Integration

`window.__REACT_DEVTOOLS_GLOBAL_HOOK__` adalah API resmi yang digunakan oleh React DevTools. Library mendaftarkan diri sebagai "renderer" melalui hook ini untuk mendapatkan akses ke fiber tree setelah setiap commit.

```typescript
// Pendaftaran ke DevTools hook
const hook = (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__

if (hook && typeof hook.inject === 'function') {
  // Inject renderer untuk mendapatkan onCommitFiberRoot callback
  hook.inject({
    onCommitFiberRoot(rendererID: number, root: FiberRoot, priorityLevel: number) {
      // root.current adalah fiber root — traverse untuk menemukan komponen
      traverseFiberTree(root.current)
    }
  })
}
```

**Fiber node yang relevan**:
- `fiber.memoizedProps` — props setelah render terbaru
- `fiber.alternate?.memoizedProps` — props sebelum render (dari fiber sebelumnya)
- `fiber.memoizedState` — state hooks (linked list untuk function components)
- `fiber.type?.displayName || fiber.type?.name` — nama komponen

**Catatan penting**: Akses ke `fiber.memoizedState` untuk function components menghasilkan linked list hook state, bukan objek key-value. Library akan mengekstrak nilai state dari linked list ini dengan hati-hati, membungkus akses dalam try-catch karena struktur internal dapat berubah antar versi React.

**Fallback**: Jika `__REACT_DEVTOOLS_GLOBAL_HOOK__` tidak tersedia (misalnya di environment yang tidak mendukung), `stateDiff` akan selalu `null` dan library tetap berfungsi dengan hanya `propDiff`.

### Shallow Equality Comparison Algorithm (`core/shallowDiff.ts`)

Algoritma perbandingan satu level untuk mendeteksi perubahan props:

```
shallowDiff(prev: Record<string, unknown>, next: Record<string, unknown>): PropDiff[]

1. Kumpulkan semua keys dari prev dan next (union)
2. Untuk setiap key:
   a. Jika key hanya ada di prev → changeType: 'removed'
   b. Jika key hanya ada di next → changeType: 'added'
   c. Jika prev[key] !== next[key] (referential equality) → changeType: 'changed'
   d. Jika prev[key] === next[key] → tidak ada perubahan (skip)
3. Return array PropDiff untuk semua key yang berubah
```

**Penanganan tipe khusus**:
- `function`: dibandingkan berdasarkan referensi (`===`), bukan konten
- `object` / `array`: dibandingkan berdasarkan referensi (`===`), bukan deep equality
- `NaN`: `NaN !== NaN` secara JavaScript, sehingga dua `NaN` akan terdeteksi sebagai "changed". Ini adalah trade-off yang diterima karena konsisten dengan perilaku React sendiri.
- `undefined` vs tidak ada key: dibedakan — key yang ada dengan nilai `undefined` berbeda dari key yang tidak ada sama sekali

**Kompleksitas**: O(n) di mana n adalah jumlah keys unik dari kedua objek.

### VisualHighlighter DOM Strategy

Library menggunakan `outline` (bukan `border` atau `box-shadow`) sebagai properti CSS utama karena:
- `outline` tidak mempengaruhi layout (tidak menambah dimensi atau menggeser elemen)
- `outline` tidak dipengaruhi oleh `overflow: hidden` pada parent
- `box-shadow` adalah fallback jika `outline` tidak dapat diaplikasikan

**Timer management** menggunakan `Map<Element, ReturnType<typeof setTimeout>>` untuk melacak timer aktif per DOM node:

```
flash(domNode: Element, componentName: string):
  1. Jika ada timer aktif untuk domNode → clearTimeout(existingTimer)
  2. Aplikasikan style: domNode.style.outline = `2px solid ${flashColor}`
  3. Set timer baru: setTimeout(() => removeFlash(domNode), flashDuration)
  4. Simpan timer ID di activeTimers Map

removeFlash(domNode: Element):
  1. domNode.style.outline = ''
  2. Hapus dari activeTimers Map
```

**DOM node discovery**: Library mendapatkan DOM node dari fiber melalui `fiber.stateNode` untuk host components (div, span, dll). Untuk composite components, library traverse ke child fiber pertama yang merupakan host component.

### Dashboard Architecture

Dashboard dirender sebagai React Portal ke `document.body` menggunakan `ReactDOM.createPortal()`. Container element dibuat secara programatik:

```typescript
const container = document.createElement('div')
container.id = 'react-perf-scan-dashboard'
container.style.cssText = 'all: initial; position: fixed; z-index: 99999;'
document.body.appendChild(container)
ReactDOM.createRoot(container).render(
  <ErrorBoundary>
    <Dashboard config={config} />
  </ErrorBoundary>
)
```

**CSS Isolation**: `all: initial` pada container me-reset semua inherited CSS properties, memastikan Dashboard tidak terpengaruh oleh global styles aplikasi host. Semua styling Dashboard menggunakan inline styles atau CSS-in-JS yang scoped.

**Positioning**: Posisi ditentukan oleh `dashboardPosition` config:
```typescript
const positionStyles: Record<DashboardPosition, React.CSSProperties> = {
  'top-left':     { top: '16px', left: '16px' },
  'top-right':    { top: '16px', right: '16px' },
  'bottom-left':  { bottom: '16px', left: '16px' },
  'bottom-right': { bottom: '16px', right: '16px' },
}
```

**State management**: Dashboard menggunakan React `useState` dan `useEffect` untuk subscribe ke event bus. Tidak ada external state management library — state Dashboard adalah local React state yang di-update melalui event bus subscriptions.

```typescript
useEffect(() => {
  const unsubWasted = eventBus.on('wasted-render', handleWastedRender)
  const unsubSuggestion = eventBus.on('suggestion-generated', handleSuggestion)
  const unsubDismiss = eventBus.on('suggestion-dismissed', handleDismiss)
  return () => {
    unsubWasted(); unsubSuggestion(); unsubDismiss()
  }
}, [])
```

### MemoSuggestionEngine Analysis Algorithm

```
analyze(componentName, records):
  1. Filter records: hanya WastedRender (isWasted === true)
  2. Jika wastedCount < renderThreshold → return [] (belum cukup data)
  3. Hitung proporsi setiap pola:
     a. unchangedPropsRatio = count(records where propDiff.length === 0) / wastedCount
     b. newFunctionRefRatio = count(records where any propDiff has function type with changed ref) / wastedCount
     c. newObjectRefRatio = count(records where any propDiff has object/array type with changed ref) / wastedCount
  4. Generate suggestions berdasarkan threshold 80%:
     a. IF unchangedPropsRatio >= 0.8 AND not dismissed → add memo suggestion
     b. IF newFunctionRefRatio >= 0.8 AND not dismissed → add useCallback suggestion (per function prop)
     c. IF newObjectRefRatio >= 0.8 AND not dismissed → add useMemo suggestion (per object/array prop)
  5. Return deduplicated suggestions (tidak duplikasi yang sudah ada di activeSuggestions)
```

**Code snippet generation**:
- `memo`: `export default React.memo(${componentName})`
- `useCallback`: `const ${propName} = useCallback(() => { /* ... */ }, [/* deps */])`
- `useMemo`: `const ${propName} = useMemo(() => ({ /* ... */ }), [/* deps */])`

**Tipe deteksi untuk props**:
```typescript
function getPropType(value: unknown): 'function' | 'object' | 'array' | 'primitive' {
  if (typeof value === 'function') return 'function'
  if (Array.isArray(value)) return 'array'
  if (value !== null && typeof value === 'object') return 'object'
  return 'primitive'
}
```

### Production Build Split

Library menggunakan field `exports` di `package.json` untuk mengarahkan bundler ke artifact yang tepat:

```json
{
  "exports": {
    ".": {
      "development": "./dist/index.dev.esm.js",
      "production": "./dist/index.prod.esm.js",
      "import": "./dist/index.dev.esm.js",
      "require": "./dist/index.dev.cjs.js"
    }
  },
  "sideEffects": false
}
```

`index.prod.ts` berisi no-op stubs:
```typescript
export function initPerfScan(_options?: PerfScanOptions): void {}
export function destroyPerfScan(): void {}
```

Dengan `sideEffects: false`, bundler modern (Vite, webpack 5, Rollup) dapat mengeliminasi seluruh kode library dari bundle production karena tidak ada side effects di module level.

Alternatif untuk bundler yang tidak mendukung `exports` condition: library juga menyediakan guard `process.env.NODE_ENV` di dalam `initPerfScan()` sebagai lapisan keamanan kedua.

---

## Data Flow and State Management

### Render Event Flow

```
React commits a render
    │
    ▼
onCommitFiberRoot(rendererID, root)   [via __REACT_DEVTOOLS_GLOBAL_HOOK__]
    │
    ▼
traverseFiberTree(root.current)
    │
    ├─ For each fiber node:
    │   ├─ Extract componentName (fiber.type.displayName || fiber.type.name)
    │   ├─ [filter] if trackComponents.length > 0 && !trackComponents.includes(name) → skip
    │   ├─ Extract prevProps = fiber.alternate?.memoizedProps
    │   ├─ Extract nextProps = fiber.memoizedProps
    │   ├─ Extract prevState = extractHookState(fiber.alternate?.memoizedState)
    │   ├─ Extract nextState = extractHookState(fiber.memoizedState)
    │   ├─ propDiff = shallowDiff(prevProps, nextProps)
    │   ├─ stateDiff = shallowDiff(prevState, nextState) [or null if inaccessible]
    │   ├─ isWasted = (phase === 'update') && (propDiff.length === 0) && (stateDiff === null || stateDiff.length === 0)
    │   ├─ record = { componentName, timestamp, duration, phase, propDiff, stateDiff, isWasted }
    │   ├─ addRecord(componentName, record)  [FIFO cap at 100]
    │   └─ IF isWasted:
    │       ├─ domNode = getDOMNode(fiber)
    │       ├─ eventBus.emit('wasted-render', { componentName, record, domNode })
    │       └─ memoSuggestionEngine.analyze(componentName, getRecords(componentName))
    │
    └─ [continue traversal to sibling and child fibers]
```

### Dashboard State Update Flow

```
eventBus.emit('wasted-render', event)
    │
    ▼
Dashboard useEffect handler
    │
    ├─ Find existing entry for componentName
    ├─ IF not found:
    │   ├─ Create new DashboardEntry
    │   └─ IF entries.length >= MAX_DASHBOARD_ENTRIES:
    │       └─ Remove entry with oldest firstDetectedAt (FIFO)
    ├─ IF found:
    │   ├─ Increment wastedRenderCount
    │   └─ Update latestDiff
    └─ setState({ entries: [...], totalWastedRenders: totalWastedRenders + 1 })
```

### Memory Management

**RenderRecord FIFO cap**:
```typescript
function addRecord(componentName: string, record: RenderRecord): void {
  const records = state.renderRecords.get(componentName) ?? []
  records.push(record)
  if (records.length > MAX_RECORDS_PER_COMPONENT) {
    records.shift()  // O(n) — acceptable karena n <= 100
  }
  state.renderRecords.set(componentName, records)
}
```

**Cleanup on unmount**: Library mendeteksi unmount melalui fiber traversal — ketika sebuah fiber tidak lagi muncul dalam commit tree, library menghapus records-nya. Cleanup dijadwalkan menggunakan `setTimeout(..., 0)` untuk menghindari blocking commit phase.

**Dashboard entry FIFO**: Ketika entri ke-11 ditambahkan, entri dengan `firstDetectedAt` terkecil dihapus.
