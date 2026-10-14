import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Napaka v uporabniškem vmesniku:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const chunkError = /Failed to fetch dynamically imported module|Importing a module script failed/i.test(this.state.error.message);
    return (
      <div className="system-page">
        <div className="system-card">
          <span className="system-code">{chunkError ? 'Posodobitev' : 'Napaka'}</span>
          <h1>{chunkError ? 'Na voljo je nova različica' : 'Nekaj je šlo narobe'}</h1>
          <p>
            {chunkError
              ? 'Aplikacija je bila medtem posodobljena. Osvežite stran za nadaljevanje.'
              : 'Prišlo je do nepričakovane napake pri prikazu strani. Vaši podatki so varno shranjeni.'}
          </p>
          <div className="row gap-2">
            <button className="btn btn-primary btn-md" onClick={() => window.location.reload()}>
              Osveži stran
            </button>
            <a className="btn btn-ghost btn-md" href="/">
              Na nadzorno ploščo
            </a>
          </div>
        </div>
      </div>
    );
  }
}
