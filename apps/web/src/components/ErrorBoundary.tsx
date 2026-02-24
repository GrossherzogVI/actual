import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

type Props = {
  children: ReactNode;
  fallback?: ReactNode;
  zone?: string;
};

type State = {
  hasError: boolean;
  error: Error | null;
};

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary:${this.props.zone ?? 'unknown'}]`, error, info);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="fo-panel" role="alert" style={{ padding: '1rem' }}>
          <strong style={{ color: 'var(--color-error, #ef4444)' }}>
            Panel error
          </strong>
          <small style={{ display: 'block', marginTop: '0.25rem', opacity: 0.7 }}>
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </small>
          <button
            className="fo-btn-secondary"
            type="button"
            style={{ marginTop: '0.5rem' }}
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
