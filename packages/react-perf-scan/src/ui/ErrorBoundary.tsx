import { Component, type ErrorInfo, type ReactNode } from 'react'

export class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true }
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('[react-perf-scan/Dashboard]', error, info.componentStack)
  }

  override render(): ReactNode {
    if (this.state.hasError) return null
    return this.props.children
  }
}
