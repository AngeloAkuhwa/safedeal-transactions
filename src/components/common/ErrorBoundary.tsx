import { Component, type ErrorInfo, type ReactNode } from "react";
import { RefreshCw, Home, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reportError, newId } from "@/lib/errorLog";

interface Props {
  children: ReactNode;
  /** Names the region that failed, so one boundary's report is
   *  distinguishable from another's in the log. */
  boundary?: string;
  /** Replaces the default surface. A checkout step may want to fail into
   *  something smaller than a full page. */
  fallback?: (reset: () => void) => ReactNode;
}

interface State {
  hasError: boolean;
  reference: string | null;
}

/**
 * Catches a render error, reports it, and gives the person something to do.
 *
 * Without this, a thrown error in render unmounts the whole React tree and the
 * buyer gets a white page: no message, no way back, and no record that it
 * happened. On a product that holds money in escrow that is the worst possible
 * failure mode, because the buyer cannot tell whether their payment went
 * through.
 *
 * The reference shown to the person is the correlation id sent with the report,
 * so "it broke, the code was c3f2a1" is enough for an operator to find the
 * exact stack rather than asking them to describe the screen.
 *
 * Class component because there is still no hook equivalent: error boundaries
 * are one of the two things React only exposes to classes.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, reference: null };

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const reference = newId();
    this.setState({ reference });
    reportError({
      kind: "react_render",
      message: error.message || "Render error",
      stack: error.stack ?? null,
      severity: "fatal",
      correlationId: reference,
      context: {
        boundary: this.props.boundary ?? "root",
        // The component stack names the tree that failed, which is usually
        // more useful than the JS stack for a render error.
        componentStack: (info.componentStack ?? "").slice(0, 2_000),
      },
    });
  }

  private reset = () => this.setState({ hasError: false, reference: null });

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback(this.reset);

    return (
      <div
        role="alert"
        className="flex min-h-[60dvh] flex-col items-center justify-center gap-5 px-6 py-12 text-center"
      >
        <AlertTriangle className="h-10 w-10 text-warning" aria-hidden="true" />

        <div className="flex flex-col gap-2">
          <h1 className="h-card text-foreground">This screen ran into a problem</h1>
          <p className="max-w-prose text-sm text-muted-foreground">
            Nothing you were doing was lost. Your transactions and payments are unaffected by
            this, and the problem has been reported to us automatically.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button onClick={this.reset} className="min-h-11 gap-2">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Try again
          </Button>
          <Button asChild variant="outline" className="min-h-11 gap-2">
            <a href="/">
              <Home className="h-4 w-4" aria-hidden="true" />
              Go to home
            </a>
          </Button>
        </div>

        {this.state.reference ? (
          <p className="text-xs text-muted-foreground">
            Reference for support:{" "}
            <span className="font-mono text-foreground">{this.state.reference.slice(0, 8)}</span>
          </p>
        ) : null}
      </div>
    );
  }
}
