import { Link } from "react-router";
import { Check, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { SellerOnboarding } from "@/services/seller-dashboard.service";

interface Props {
  onboarding: SellerOnboarding;
}

export function SellerOnboardingChecklist({ onboarding }: Props) {
  if (!onboarding?.show) return null;

  const total = onboarding.total_steps || onboarding.steps.length;
  const done = onboarding.completed_steps;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  // Find first incomplete step index for primary CTA emphasis
  const firstIncompleteIdx = onboarding.steps.findIndex((s) => !s.completed);

  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Set up your SafeDeal seller account</h2>
          <p className="text-sm text-muted-foreground">
            Complete these steps to start selling with protected payments.
          </p>
        </div>
        <span className="text-sm font-semibold text-foreground whitespace-nowrap">
          {done} of {total} completed
        </span>
      </div>

      <div className="mt-4">
        <Progress value={pct} className="h-2 transition-[width] duration-700 ease-out" />
      </div>

      <ol className="mt-5 space-y-2.5">
        {onboarding.steps.map((step, idx) => {
          const isPrimary = idx === firstIncompleteIdx;
          return (
            <li
              key={step.key}
              /* flex-wrap plus a real basis on the text: `min-w-0` alone lets
                 the label shrink to 18px and its glyphs then run straight
                 through the action button beside it. A basis wide enough to
                 read forces the action onto its own line instead. */
              className="flex flex-wrap items-start gap-3 rounded-lg border bg-background px-3 py-2.5 sm:items-center"
            >
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                  step.completed
                    ? "bg-success/15 text-success"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {step.completed ? <Check className="h-4 w-4" /> : idx + 1}
              </div>
              <div className="min-w-0 flex-1 basis-40">
                <p className={`text-sm font-semibold ${step.completed ? "text-muted-foreground line-through" : "text-foreground"}`}>
                  {step.title}
                </p>
                <p className="text-xs text-muted-foreground">{step.description}</p>
              </div>
              <div className="ms-auto shrink-0">
                {step.completed ? (
                  <span className="inline-flex items-center rounded-full bg-success/15 px-3 py-1 text-xs font-semibold text-success">
                    Done
                  </span>
                ) : (
                  <Button
                    asChild
                    size="sm"
                    variant={isPrimary ? "default" : "ghost"}
                  >
                    <Link to={step.action_href}>
                      {step.action_label}
                      <ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-4 text-center">
        {/* A standalone call to action on its own line, not a link inside a
            sentence — it was 15px tall. `inline-flex` + `min-h-11` gives it a
            real target; the centring is unchanged. */}
        <Link
          to="/#how-it-works"
          className="inline-flex min-h-11 items-center justify-center px-3 text-xs font-medium text-primary hover:underline"
        >
          Learn how SafeDeal works →
        </Link>
      </div>
    </div>
  );
}