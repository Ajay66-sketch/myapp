// client/src/components/ErrorBoundary.tsx
import React, { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Layout fault captured:', error, errorInfo)
  }

  private handleRecovery = () => {
    // Attempt state recovery by resetting component boundaries
    this.setState({ hasError: false, error: null })
    window.location.reload()
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="fullscreen-loading-container theme-dark">
          <div className="glass-panel text-center loading-box max-w-md anim-scale-up" style={{ padding: '2.5rem' }}>
            <div className="locked-icon" style={{ fontSize: '3.5rem' }}>⚠️</div>
            <h2 className="gradient-text mt-3" style={{ fontSize: '1.75rem' }}>Scholar Workspace Recovered</h2>
            <p className="text-secondary mt-2">
              An unexpected layout error occurred while synchronizing study rooms. Your streaks and XP progress are safely stored.
            </p>
            <div className="billing-banner mt-3 p-2 font-medium" style={{ fontSize: '0.8rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
              Fault: {this.state.error?.message || 'Rendering synchronization lost.'}
            </div>
            <button onClick={this.handleRecovery} className="btn btn-primary btn-block btn-pulse mt-4">
              Refresh Workspace Session
            </button>
          </div>
        </div>
      )
    }

    return this.children
  }
}

export default ErrorBoundary
