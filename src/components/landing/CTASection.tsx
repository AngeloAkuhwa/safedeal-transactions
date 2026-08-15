import { Link } from "react-router";
import { useScrollReveal } from "@/hooks/useScrollReveal";

export function CTASection() {
  const ref = useScrollReveal<HTMLDivElement>();

  return (
    <section className="section-y border-t bg-muted/30">
      <div ref={ref} className="container-x mx-auto max-w-3xl text-center">
        <h2 className="h-section mb-2 font-bold text-foreground">
          Ready to shop or sell with protection?
        </h2>
        <p className="body-lead mx-auto mb-6 max-w-xl text-left text-muted-foreground sm:text-center">
          Browse listings or create your own deal in minutes.
        </p>

        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-5">
          <Link
            to="/auth?role=seller"
            className="tap-press inline-flex h-12 w-full items-center justify-center rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground shadow-md transition-all hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-lg sm:h-11 sm:w-auto"
          >
            Open your free store
          </Link>
          <Link
            to="/marketplace"
            className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-muted-foreground underline-offset-4 transition-colors hover:text-primary hover:underline"
          >
            Browse marketplace
          </Link>
        </div>
      </div>
    </section>
  );
}
