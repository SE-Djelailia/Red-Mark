import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
  /**
   * Compact inline fallback instead of the full-page one. Use for a boundary
   * wrapping a section of a screen, so the rest of the screen stays usable.
   */
  variant?: "page" | "section";
  /** Shown above the error in the section variant, e.g. "l'activité". */
  label?: string;
  /**
   * Changing any value here resets the boundary automatically. Pass the
   * route path at the app level so navigating away clears a crash instead
   * of stranding the user on the fallback.
   */
  resetKeys?: unknown[];
}

interface State {
  error: Error | null;
}

// React only surfaces render-phase errors to class components — there is no
// hook equivalent, so this stays a class by necessity, not by preference.
//
// Scope: catches errors thrown while RENDERING children (plus their
// lifecycles/constructors). It does NOT catch errors inside event handlers,
// async callbacks, or promise rejections — those never unmount the tree, so
// they keep using toast/inline error state as the rest of the app does.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prevProps: Props) {
    // Auto-recover when the caller's reset keys change (e.g. the user
    // navigated to a different route). Without this, a crashed boundary
    // would keep showing the fallback even on a healthy new screen.
    const { resetKeys } = this.props;
    if (!this.state.error || !resetKeys) return;
    const prev = prevProps.resetKeys;
    if (!prev || prev.length !== resetKeys.length) {
      this.reset();
      return;
    }
    if (resetKeys.some((key, i) => !Object.is(key, prev[i]))) {
      this.reset();
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Full stack + component stack, so a field crash is diagnosable from
    // the device console (or a remote debugging session) rather than being
    // a silent white screen.
    console.error(
      "❌ Uncaught render error:",
      error,
      "\nComponent stack:",
      errorInfo.componentStack,
    );

    // If we ever add remote error reporting (Sentry et al.), this is the
    // hook point — e.g. Sentry.captureException(error, { contexts: {
    // react: { componentStack: errorInfo.componentStack } } }).
    // Deliberately not wired up: it would send site data off-device, which
    // is a decision to make explicitly rather than by default.
  }

  reset = () => this.setState({ error: null });

  handleReload = () => {
    // Full document load rather than a client-side navigation: the crash
    // may have left module-level or context state inconsistent, and a
    // route change alone would not clear it.
    window.location.assign("/app/dashboard");
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const message = error.message || "Erreur inconnue";

    if (this.props.variant === "section") {
      return (
        <div className="bg-surface border border-line rounded-[4px] p-5 text-center">
          <AlertTriangle size={32} className="mx-auto text-warn mb-2.5" aria-hidden="true" />
          <p className="text-sm font-medium text-ink mb-1">
            Impossible d'afficher {this.props.label || "cette section"}
          </p>
          <p className="text-xs text-muted mb-4">
            Le reste de la page reste utilisable.
          </p>
          <p className="text-xs text-muted font-mono bg-subtle border border-line rounded-[4px] px-3 py-2 mb-4 break-words text-left">
            {message}
          </p>
          <button
            onClick={this.reset}
            className="h-10 px-4 rounded-[4px] bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 active:bg-brand-800 transition-colors min-h-[44px]"
          >
            Réessayer
          </button>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center px-6">
        <div className="max-w-md w-full text-center">
          <AlertTriangle size={40} className="mx-auto text-brand-600 mb-3" aria-hidden="true" />
          <h1 className="text-lg font-semibold text-ink mb-2">Une erreur est survenue</h1>
          <p className="text-sm text-muted mb-5">
            Désolé — l'application a rencontré un problème inattendu. Vos données enregistrées
            ne sont pas affectées.
          </p>

          {/* The message is shown rather than hidden: this app is used on
              site, where being able to read what broke (and relay it) is
              worth more than a polished-but-opaque apology. */}
          <p className="text-xs text-muted font-mono bg-subtle border border-line rounded-[4px] px-3 py-2.5 mb-6 break-words text-left">
            {message}
          </p>

          <div className="flex gap-3 justify-center">
            <button
              onClick={this.reset}
              className="h-11 px-4 rounded-[4px] border border-line bg-surface text-ink text-sm font-medium hover:bg-canvas transition-colors min-h-[44px]"
            >
              Réessayer
            </button>
            <button
              onClick={this.handleReload}
              className="h-11 px-4 rounded-[4px] bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 active:bg-brand-800 transition-colors min-h-[44px]"
            >
              Recharger
            </button>
          </div>
        </div>
      </div>
    );
  }
}
