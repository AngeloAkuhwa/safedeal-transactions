import { Check } from "lucide-react";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { usePublicPricing } from "@/hooks/usePublicPricing";

const POINTS = [
  "No listing fees",
  "No subscriptions required",
  "You only pay when a deal completes",
] as const;

export function FeesSection() {
  const ref = useScrollReveal<HTMLDivElement>();
  const { copy } = usePublicPricing();

  return (
    <section id="fees" className="section-y bg-muted/30">
      <div className="container-x mx-auto max-w-3xl">
        <div className="mb-5 text-center sm:mb-8">
          <h2 className="h-section font-bold text-foreground">Transparent fees</h2>
        </div>

        <div
          ref={ref}
          className="tap-press mx-auto max-w-xl rounded-2xl border bg-card p-4 text-left shadow-sm transition-shadow duration-300 hover:shadow-lg sm:p-8 sm:text-center"
        >
          <p className="text-center text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            The SafeDeal fee
          </p>
          <p className="mt-2 text-center text-2xl font-extrabold leading-tight text-foreground sm:text-3xl">
            {copy.safedealFeeHeadline}
          </p>
          <p className="mt-2 text-base text-muted-foreground">
            when a deal completes: capped at {copy.safedealFeeCap}.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">{copy.feeDisclosure}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Nigeria pricing shown in ₦. Local pricing announced as each new region goes live.
          </p>

          <ul className="mt-5 grid gap-1.5 text-left sm:mt-6 sm:grid-cols-3 sm:gap-2">
            {POINTS.map((p) => (
              <li
                key={p}
                className="flex items-center gap-2 rounded-xl border bg-background px-3 py-2 text-sm text-muted-foreground sm:items-start sm:p-3"
              >
                <Check className="h-4 w-4 shrink-0 text-muted-foreground sm:mt-0.5" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}