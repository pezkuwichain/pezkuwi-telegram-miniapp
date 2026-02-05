import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { trackError } from '@/lib/error-tracking';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  componentName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });

    // Track error with context
    trackError(error, {
      component: this.props.componentName ?? 'ErrorBoundary',
      action: 'component_crash',
      extra: {
        componentStack: errorInfo.componentStack,
      },
    });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-background text-foreground">
          <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mb-4">
            <AlertTriangle className="w-8 h-8 text-red-400" />
          </div>
          <h1 className="text-xl font-semibold mb-2">Tiştek çewt çêbû</h1>
          <p className="text-sm text-muted-foreground text-center mb-6 max-w-xs">
            Bibore, pirsgirêkek teknîkî derket. Ji kerema xwe dîsa biceribîne.
          </p>
          <button
            onClick={this.handleRetry}
            className="flex items-center gap-2 px-4 py-2 bg-primary rounded-lg text-primary-foreground font-medium"
          >
            <RefreshCw className="w-4 h-4" />
            Dîsa biceribîne
          </button>
          {import.meta.env.DEV && this.state.error && (
            <div className="mt-6 w-full max-w-lg">
              <pre className="p-4 bg-secondary rounded-lg text-xs text-red-400 overflow-auto max-h-48">
                <strong>Error:</strong> {this.state.error.message}
                {'\n\n'}
                <strong>Stack:</strong>
                {'\n'}
                {this.state.error.stack}
              </pre>
              {this.state.errorInfo?.componentStack && (
                <pre className="mt-2 p-4 bg-secondary rounded-lg text-xs text-yellow-400 overflow-auto max-h-32">
                  <strong>Component Stack:</strong>
                  {this.state.errorInfo.componentStack}
                </pre>
              )}
            </div>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
