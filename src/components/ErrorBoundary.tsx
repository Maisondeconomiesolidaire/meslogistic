import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  /** Optional custom fallback. Receives the error and a reset callback. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /** Compact inline style (e.g. inside a modal/overlay) instead of full screen. */
  compact?: boolean;
  /** Called when the boundary catches an error. */
  onError?: (error: Error) => void;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-time and lazy-chunk-load errors so a single broken feature
 * can't blank out the whole app. Without this, a failed dynamic import (e.g.
 * the camera scanner) unmounts React and leaves a white screen.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("ErrorBoundary caught:", error);
    this.props.onError?.(error);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) return this.props.fallback(error, this.reset);

    // A failed code-split chunk usually means a new deploy invalidated the old
    // hashed file — a hard reload fetches the fresh assets.
    const isChunkError =
      /chunk|dynamically imported module|failed to fetch/i.test(error.message);

    const container = this.props.compact
      ? "flex flex-col items-center justify-center gap-4 p-8 text-center"
      : "flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-950 p-8 text-center";

    return (
      <div className={container}>
        <AlertTriangle className="h-10 w-10 text-amber-400" />
        <div>
          <p className="text-base font-bold text-zinc-100">Une erreur est survenue</p>
          <p className="mt-1 max-w-sm text-sm text-zinc-400">
            {isChunkError
              ? "L'application a été mise à jour. Rechargez la page pour continuer."
              : "Cette section n'a pas pu s'afficher correctement."}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
          >
            <RefreshCw className="h-4 w-4" />
            Recharger
          </button>
          {!isChunkError && (
            <button
              type="button"
              onClick={this.reset}
              className="rounded-xl border border-zinc-700 px-4 py-2.5 text-sm font-semibold text-zinc-300 transition hover:bg-zinc-800"
            >
              Réessayer
            </button>
          )}
        </div>
      </div>
    );
  }
}
