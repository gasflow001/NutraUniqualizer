import { Component, ErrorInfo, ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null; info: ErrorInfo | null };

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ info });
    // eslint-disable-next-line no-console
    console.error("UI crashed:", error, info?.componentStack);
  }

  reset = () => this.setState({ error: null, info: null });

  render() {
    if (!this.state.error) return this.props.children;
    const e = this.state.error;
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="card max-w-3xl w-full space-y-3">
          <h2 className="text-lg font-semibold text-red-400">UI упал</h2>
          <div className="text-sm">
            <div className="font-mono text-red-300">
              {e.name}: {e.message}
            </div>
          </div>
          <details className="text-xs text-zinc-400" open>
            <summary className="cursor-pointer text-zinc-300">stack</summary>
            <pre className="overflow-auto max-h-80 whitespace-pre-wrap">
              {e.stack}
              {"\n\n"}
              {this.state.info?.componentStack}
            </pre>
          </details>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={() => location.reload()}>
              Перезагрузить страницу
            </button>
            <button className="btn-secondary" onClick={this.reset}>
              Попробовать снова
            </button>
          </div>
        </div>
      </div>
    );
  }
}
