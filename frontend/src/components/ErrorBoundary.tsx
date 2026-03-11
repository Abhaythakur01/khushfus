"use client";

import React from "react";
import { reportError } from "@/lib/errorTracking";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Optional fallback UI. If not provided, a default "Something went wrong" message is shown. */
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    reportError(error, {
      component: "ErrorBoundary",
      metadata: { componentStack: errorInfo.componentStack ?? undefined },
    });
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
          <div className="max-w-md w-full text-center space-y-6">
            <div className="mx-auto w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-red-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-slate-100 mb-2">
                Something went wrong
              </h2>
              <p className="text-slate-400 text-sm">
                An unexpected error occurred. Please try again or contact support if the
                problem persists.
              </p>
            </div>

            {this.state.error && (
              <details className="text-left">
                <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-400">
                  Error details
                </summary>
                <pre className="mt-2 p-3 bg-slate-900 rounded-lg text-xs text-slate-400 overflow-auto max-h-40 border border-slate-800">
                  {this.state.error.message}
                </pre>
              </details>
            )}

            <button
              onClick={this.handleRetry}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
