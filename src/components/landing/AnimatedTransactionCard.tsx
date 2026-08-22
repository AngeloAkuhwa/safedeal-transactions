import { useEffect, useState } from "react";
import {
  Shield,
  ShoppingBag,
  CheckCircle,
  Truck,
  CircleCheck,
  ShieldCheck,
  ArrowRightLeft,
  Check,
  type LucideIcon,
} from "lucide-react";

const STEPS: {
  title: string;
  subtitle: string;
  icon: LucideIcon;
}[] = [
  { title: "Product selected", subtitle: "Buyer agrees to the terms", icon: ShoppingBag },
  { title: "Payment received", subtitle: "Paid through SafeDeal", icon: CheckCircle },
  { title: "Funds held", subtitle: "Protected in escrow", icon: ShieldCheck },
  { title: "Seller dispatches", subtitle: "Delivery on the way", icon: Truck },
  { title: "Buyer verifies", subtitle: "Confirm item matches", icon: CircleCheck },
  { title: "Funds released", subtitle: "Paid to seller", icon: ArrowRightLeft },
];

const ACTIVE_WRAP = "border-primary/40 bg-primary/10 ring-2 ring-primary/30";
const ACTIVE_ICON = "bg-primary text-primary-foreground";

export function AnimatedTransactionCard() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      setActive(2); // show an in-progress snapshot for reduced-motion users
      return;
    }
    const id = window.setInterval(() => {
      setActive((prev) => (prev + 1) % STEPS.length);
    }, 1600);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div
      className="relative rounded-2xl border border-border bg-card p-4 shadow-2xl sm:p-5"
      role="img"
      aria-label="Illustration of a SafeDeal transaction moving from payment to delivery confirmation and payout"
    >
      {/* Header */}
      <div className="mb-3 flex items-center justify-between border-b border-border pb-2.5">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <div>
            <p className="text-sm font-bold text-foreground">How a SafeDeal transaction works</p>
            <p className="text-xs text-muted-foreground">Example flow · not a real transaction</p>
          </div>
        </div>
        <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-foreground">
          Example
        </span>
      </div>

      {/* Step rows */}
      <ul className="mb-3 space-y-1.5">
        {STEPS.map((step, i) => (
          <StepRow key={step.title} step={step} index={i} active={active} />
        ))}
      </ul>

      {/* Progress bar */}
      <div className="flex items-center gap-2">
        <div className="flex h-1.5 flex-1 gap-0.5 overflow-hidden rounded-full bg-muted">
          {STEPS.map((_, i) => {
            const done = i < active;
            const current = i === active;
            return (
              <div
                key={i}
                className={`h-full flex-1 rounded-full transition-all duration-700 ease-out ${
                  done || current ? "bg-primary" : "bg-transparent"
                }`}
              />
            );
          })}
        </div>
        <span className="shrink-0 text-xs font-semibold text-muted-foreground">
          Step {active + 1}/{STEPS.length}
        </span>
      </div>
    </div>
  );
}

function StepRow({
  step,
  index,
  active,
}: {
  step: (typeof STEPS)[number];
  index: number;
  active: number;
}) {
  const Icon = step.icon;
  const isDone = index < active;
  const isActive = index === active;
  let wrapClass = "border bg-muted/30 opacity-50";
  let iconWrapClass = "bg-muted text-muted-foreground";
  let titleClass = "text-muted-foreground";

  if (isDone) {
    wrapClass = "border border-border bg-muted/50";
    iconWrapClass = "bg-muted text-muted-foreground";
    titleClass = "text-foreground";
  } else if (isActive) {
    wrapClass = `${ACTIVE_WRAP} scale-[1.02] shadow-sm`;
    iconWrapClass = ACTIVE_ICON;
    titleClass = "text-foreground";
  }

  return (
    <li
      className={`flex items-center gap-2 rounded-xl p-2 transition-all duration-500 ease-out ${wrapClass}`}
    >
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-xl transition-colors duration-500 ${iconWrapClass}`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-xs font-bold leading-tight transition-colors duration-500 ${titleClass}`}>
          {step.title}
        </p>
        <p className="text-xs font-medium leading-tight text-muted-foreground">
          {step.subtitle}
        </p>
      </div>
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">
        {isDone ? (
          <Check className="h-3.5 w-3.5 text-success" />
        ) : isActive ? (
          <span className="sd-soft-glow h-2 w-2 rounded-full bg-primary" />
        ) : null}
      </span>
    </li>
  );
}
