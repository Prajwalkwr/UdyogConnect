import React from 'react';

const APP_CACHE_KEYS = ['token', 'user', 'cart'];

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, recoveryCount: 0 };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('App rendering error:', error, errorInfo);
  }

  clearAppStorage = () => {
    if (typeof window === 'undefined') return;
    APP_CACHE_KEYS.forEach((key) => window.localStorage.removeItem(key));
    this.setState({ hasError: false, error: null, recoveryCount: this.state.recoveryCount + 1 });
  };

  recover = () => {
    this.setState({ hasError: false, error: null, recoveryCount: this.state.recoveryCount + 1 });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-6">
          <div className="max-w-xl rounded-3xl border border-slate-800 bg-slate-900/90 p-8 text-center shadow-2xl">
            <h1 className="text-2xl font-bold text-amber-400">Something went wrong</h1>
            <p className="mt-4 text-sm text-slate-300">
              The application hit an unexpected runtime issue. You can recover the UI without restarting the app.
            </p>
            {this.state.error?.message && (
              <p className="mt-3 text-xs text-slate-500 break-all">{this.state.error.message}</p>
            )}
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={this.recover}
                className="rounded-full bg-amber-400 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-300"
              >
                Try Again
              </button>
              <button
                type="button"
                onClick={this.clearAppStorage}
                className="rounded-full border border-slate-700 bg-slate-900 px-6 py-3 text-sm font-semibold text-slate-100 transition hover:border-slate-500 hover:bg-slate-800"
              >
                Clear Cache & Recover
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
