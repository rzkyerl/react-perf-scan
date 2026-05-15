export type EventMap = {
  'wasted-render': {
    componentName: string
    record: import('../types').RenderRecord
    domNode: HTMLElement | null
  }
  'suggestion-generated': {
    suggestion: import('../types').MemoSuggestion
  }
  'suggestion-dismissed': {
    componentName: string
    suggestionType: import('../types').SuggestionType
  }
  destroy: void
}

type Handler<K extends keyof EventMap> = (data: EventMap[K]) => void

const listeners = new Map<keyof EventMap, Set<Handler<keyof EventMap>>>()

function getSet<K extends keyof EventMap>(event: K): Set<Handler<K>> {
  let s = listeners.get(event) as Set<Handler<K>> | undefined
  if (!s) {
    s = new Set()
    listeners.set(event, s as Set<Handler<keyof EventMap>>)
  }
  return s
}

export const eventBus = {
  on<K extends keyof EventMap>(event: K, handler: Handler<K>): () => void {
    const set = getSet(event)
    set.add(handler)
    return () => set.delete(handler)
  },

  off<K extends keyof EventMap>(event: K, handler: Handler<K>): void {
    getSet(event).delete(handler)
  },

  emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
    try {
      const set = listeners.get(event)
      if (!set) return
      for (const h of [...set]) {
        ;(h as Handler<K>)(data)
      }
    } catch (e) {
      console.error('[react-perf-scan/eventBus]', e)
    }
  },

  clear(): void {
    listeners.clear()
  },
}
