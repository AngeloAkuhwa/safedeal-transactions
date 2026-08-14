import { Receipt, Check } from "lucide-react";
import { useScrollReveal } from "@/hooks/useScrollReveal";

const POINTS = [
  "No listing fees",
  "No subscriptions required",
  "You only pay when a deal completes",
] as const;

export function FeesSection() {
  const ref = useScrollReveal<HTMLDivElement>();

  return (
    <section id="fees" className="bg-muted/30 py-8 sm:py-12 lg:py-16">
      <div className="container-x mx-auto max-w-3xl">
        <div className="mb-5 text-center sm:mb-8">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1">
            <Receipt className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold text-primary">Pricing</span>
          </div>
          <h2 className="h-section font-bold text-foreground">Transparent fees</h2>
        </div>

        <div
          ref={ref}
          className="tap-press mx-auto max-w-xl rounded-2xl border bg-card p-4 text-center shadow-sm transition-shadow duration-300 hover:shadow-lg sm:p-8"
        >
          <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            One simple fee
          </p>
          <p className="mt-2 text-2xl font-extrabold leading-tight text-foreground sm:text-3xl">
            2% + ₦100
          </p>
          <p className="mt-2 text-base text-muted-foreground">
            when a deal completes — capped at ₦5,000.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Nigeria pricing shown in ₦. Local pricing announced as each new region goes live.
          </p>

          <ul className="mt-5 grid gap-1.5 text-left sm:mt-6 sm:grid-cols-3 sm:gap-2">
            {POINTS.map((p) => (
              <li
                key={p}
                className="flex items-center gap-2 rounded-xl border bg-background px-3 py-2 text-sm text-muted-foreground sm:items-start sm:p-3"
              >
                <Check className="h-4 w-4 shrink-0 text-success sm:mt-0.5" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}