import { useEffect, useState } from "react";
import {
  CreditCard,
  Truck,
  CircleCheck,
  ArrowRightLeft,
  AlertTriangle,
  ShieldCheck,
  CheckCircle,
  Check,
  Camera,
  Scale,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { SnapCarousel } from "@/components/ui/snap-carousel";

const STEPS: { icon: LucideIcon; title: string; helper: string }[] = [
  { icon: CreditCard, title: "Pay through SafeDeal", helper: "Money goes to escrow" },
  { icon: Truck, title: "Seller delivers", helper: "Item shipped with proof" },
  { icon: CircleCheck, title: "Buyer confirms", helper: "Verify item matches" },
  { icon: ArrowRightLeft, title: "Funds release", helper: "Seller paid instantly" },
];

const ESCROW_STATES: {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  tone: "success" | "warning" | "primary";
}[] = [
  { title: "Payment Secured", subtitle: "Buyer payment received", icon: CheckCircle, tone: "success" },
  { title: "Funds Held", subtitle: "Locked in escrow", icon: ShieldCheck, tone: "warning" },
  { title: "Delivery in Progress", subtitle: "Expected: Dec 28", icon: Truck, tone: "primary" },
  { title: "Buyer Verification", subtitle: "Awaiting confirmation", icon: CircleCheck, tone: "primary" },
  { title: "Funds Released", subtitle: "Paid to seller", icon: ArrowRightLeft, tone: "success" },
];

const DISPUTE_PROMISE: { icon: LucideIcon; title: string; line: string }[] = [
  {
    icon: Camera,
    title: "Evidence, not opinions",
    line: "Both sides upload photos, video and delivery proof against the locked terms.",
  },
  {
    icon: Scale,
    title: "Reviewed before any payout",
    line: "While a dispute is open, the money stays in escrow — nothing is released.",
  },
  {
    icon: ShieldAlert,
    title: "A real way out",
    line: "Outcomes are refund, release, or partial resolution — recorded on the transaction.",
  },
];

export function ProtectionSection() {
  return (
    <section id="protection" className="bg-background py-8 sm:py-12 lg:py-16">
      <div className="container-x mx-auto max-w-6xl">
        <div className="mb-5 text-center sm:mb-8">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold text-primary">For buyers</span>
          </div>
          <h2 className="h-section mb-2 font-bold text-foreground">
            Your money stays protected until you're satisfied
          </h2>
          <p className="body-lead mx-auto max-w-xl text-muted-foreground">
            You pay SafeDeal, not the seller. The money only moves when the item checks out.
          </p>
        </div>

        <div className="grid items-start gap-5 lg:grid-cols-2 lg:gap-8">
          {/* Left — 4 visual steps + warning */}
          <div className="space-y-3">
            {STEPS.map((s, i) => (
              <StepRow key={s.title} step={s} index={i} />
            ))}

            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <p className="text-sm font-semibold text-foreground">
                  Do not pay outside SafeDeal. Outside payments are not protected.
                </p>
              </div>
            </div>
          </div>

          {/* Right — Animated escrow demo */}
          <AnimatedEscrowCard />
        </div>

        {/* Dispute promise */}
        <SnapCarousel
          ariaLabel="How SafeDeal handles disputes"
          className="mt-6 sm:mt-8"
          trackClassName="sm:grid-cols-3"
        >
          {DISPUTE_PROMISE.map((d) => (
            <div
              key={d.title}
              className="tap-press flex h-full flex-col rounded-2xl border bg-card p-4 shadow-sm transition-shadow duration-300 hover:shadow-lg sm:p-5"
            >
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-warning/10 text-warning">
                <d.icon className="h-5 w-5" />
              </div>
              <h3 className="mb-1.5 text-base font-bold text-foreground">{d.title}</h3>
              <p className="text-sm text-muted-foreground">{d.line}</p>
            </div>
          ))}
        </SnapCarousel>
      </div>
    </section>
  );
}

function StepRow({
  step,
  index,
}: {
  step: (typeof STEPS)[number];
  index: number;
}) {
  const ref = useScrollReveal<HTMLDivElement>();
  const isLast = index === STEPS.length - 1;
  const wrap = isLast
    ? "bg-success text-success-foreground"
    : "bg-primary text-primary-foreground";
  return (
    <div
      ref={ref}
      className="group flex items-center gap-3 rounded-xl border bg-card p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-sm transition-transform group-hover:scale-110 ${wrap}`}
      >
        <step.icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <h4 className="text-sm font-bold leading-tight text-foreground sm:text-base">
          {step.title}
        </h4>
        <p className="text-xs leading-snug text-muted-foreground">{step.helper}</p>
      </div>
      <span className="ml-auto text-xs font-bold text-muted-foreground">
        {String(index + 1).padStart(2, "0")}
      </span>
    </div>
  );
}

function AnimatedEscrowCard() {
  const ref = useScrollReveal<HTMLDivElement>();
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setActive(2);
      return;
    }
    const id = window.setInterval(() => {
      setActive((p) => (p + 1) % ESCROW_STATES.length);
    }, 1700);
    return () => window.clearInterval(id);
  }, []);

  const progress = ((active + 1) / ESCROW_STATES.length) * 100;

  return (
    <div
      ref={ref}
      className="rounded-2xl border bg-card p-4 shadow-sm transition-shadow duration-300 hover:shadow-lg lg:ml-auto lg:max-w-[420px]"
    >
      {/* Header */}
      <div className="mb-3 flex items-center justify-between border-b pb-3">
        <div>
          <p className="text-sm font-bold text-foreground">Example protected transaction</p>
          <p className="text-xs text-muted-foreground">Illustration · not a real deal</p>
        </div>
        <span className="rounded-full bg-success/15 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-success">
          Protected
        </span>
      </div>

      {/* Status rows */}
      <div className="mb-3 space-y-1.5">
        {ESCROW_STATES.map((s, i) => (
          <EscrowRow key={s.title} state={s} index={i} active={active} />
        ))}
      </div>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary via-primary to-success transition-all duration-700 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-1 text-right text-xs font-semibold text-muted-foreground">
          Step {active + 1} of {ESCROW_STATES.length}
        </p>
      </div>

      {/* Protected amount */}
      <div className="rounded-2xl bg-primary p-3 text-center">
        <p className="text-lg font-bold text-primary-foreground sm:text-xl">Buyer's full payment</p>
        <p className="text-xs font-medium text-primary-foreground/80">
          Protected in Escrow
        </p>
      </div>
    </div>
  );
}

function EscrowRow({
  state,
  index,
  active,
}: {
  state: (typeof ESCROW_STATES)[number];
  index: number;
  active: number;
}) {
  const isDone = index < active;
  const isCurrent = index === active;
  const Icon = state.icon;

  let wrap = "border bg-muted/30 opacity-50";
  let iconColor = "text-muted-foreground";

  if (isDone) {
    wrap = "border-success/30 bg-success/10";
    iconColor = "text-success";
  } else if (isCurrent) {
    const tone = {
      success: "border-success/40 bg-success/15 ring-2 ring-success/30",
      warning: "border-warning/40 bg-warning/15 ring-2 ring-warning/30",
      primary: "border-primary/40 bg-primary/15 ring-2 ring-primary/30",
    }[state.tone];
    const ic = {
      success: "text-success",
      warning: "text-warning",
      primary: "text-primary",
    }[state.tone];
    wrap = `${tone} scale-[1.02] shadow-sm`;
    iconColor = ic;
  }

  return (
    <div
      className={`flex items-center gap-2.5 rounded-xl border p-2 transition-all duration-500 ${wrap}`}
    >
      <Icon className={`h-5 w-5 shrink-0 transition-colors duration-500 ${iconColor}`} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-bold leading-tight text-foreground">
          {state.title}
        </p>
        <p className="truncate text-xs leading-tight text-muted-foreground">
          {state.subtitle}
        </p>
      </div>
      <span className="flex h-4 w-4 items-center justify-center">
        {isDone ? (
          <Check className="h-4 w-4 text-success" />
        ) : isCurrent ? (
          <span className="sd-soft-glow h-2 w-2 rounded-full bg-primary" />
        ) : null}
      </span>
    </div>
  );
}
