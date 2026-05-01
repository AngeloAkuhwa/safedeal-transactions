import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Shield,
  ShoppingBag,
  Store,
  Link2,
  MapPin,
  CheckCircle,
  Truck,
  CircleCheck,
  ShieldCheck,
  ArrowRightLeft,
  Check,
  type LucideIcon,
} from "lucide-react";

type Tone = "primary" | "success" | "warning";

const STEPS: {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  tone: Tone;
}[] = [
  { title: "Product selected", subtitle: "iPhone 15 Pro · ₦1,450,000", icon: ShoppingBag, tone: "primary" },
  { title: "Payment received", subtitle: "₦1,450,000 secured", icon: CheckCircle, tone: "success" },
  { title: "Funds held", subtitle: "Protected in escrow", icon: ShieldCheck, tone: "warning" },
  { title: "Seller dispatches", subtitle: "Courier picked up", icon: Truck, tone: "primary" },
  { title: "Buyer verifies", subtitle: "Confirm item matches", icon: CircleCheck, tone: "primary" },
  { title: "Funds released", subtitle: "Paid to seller", icon: ArrowRightLeft, tone: "success" },
];

const TONE_STYLES: Record<Tone, { activeWrap: string; activeIcon: string }> = {
  primary: {
    activeWrap: "border-primary/40 bg-primary/10 ring-2 ring-primary/30",
    activeIcon: "bg-primary text-primary-foreground",
  },
  success: {
    activeWrap: "border-success/40 bg-success/10 ring-2 ring-success/30",
    activeIcon: "bg-success text-success-foreground",
  },
  warning: {
    activeWrap: "border-warning/40 bg-warning/10 ring-2 ring-warning/30",
    activeIcon: "bg-warning text-warning-foreground",
  },
};

export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-primary/5 via-background to-success/5 py-8 sm:py-10 lg:py-12">
      {/* Decorative blobs */}
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-40">
        <div className="absolute -top-10 left-0 h-44 w-44 rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute -bottom-10 right-0 h-56 w-56 rounded-full bg-success/15 blur-3xl" />
      </div>

      <div className="container-x relative mx-auto max-w-6xl">
        <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-10">
          {/* Left */}
          <div className="text-center lg:text-left">
            <div className="mb-3 inline-flex animate-fade-in items-center gap-2 rounded-full border border-border bg-card px-3 py-1 shadow-sm">
              <MapPin className="h-3.5 w-3.5 text-success sm:h-4 sm:w-4" />
              <span className="text-[11px] font-semibold text-foreground sm:text-xs">
                Available in Lagos, Nigeria — expanding soon
              </span>
            </div>

            <h1 className="animate-fade-in mb-3 text-4xl font-extrabold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-[3.5rem] xl:text-[4rem]">
              Buy safely.
              <br />
              <span className="text-primary">Sell confidently.</span>
            </h1>

            <p className="animate-fade-in mx-auto mb-5 max-w-lg text-[15px] leading-relaxed text-muted-foreground lg:mx-0 [animation-delay:80ms]">
              Pay safely. We hold the money until the item matches.
            </p>

            <div className="grid grid-cols-3 gap-1.5 sm:gap-2 lg:justify-start">
              <CTA to="/marketplace" icon={ShoppingBag} label="Browse Marketplace" variant="primary" delay="120ms" />
              <CTA to="/auth?role=seller" icon={Store} label="Start Selling" variant="success" delay="180ms" />
              <CTA
                to="/auth?role=seller&intent=create-transaction"
                icon={Link2}
                label="Create Protected Deal"
                variant="dark"
                delay="240ms"
              />
            </div>

          </div>

          {/* Right — Animated transaction demo */}
          <div className="relative mx-auto hidden w-full max-w-sm animate-slide-in-right lg:block lg:mx-0 lg:ml-auto">
            <div aria-hidden className="absolute -left-4 -top-4 h-16 w-16 rounded-2xl bg-success/15" />
            <div aria-hidden className="absolute -bottom-4 -right-4 h-20 w-20 rounded-2xl bg-primary/15" />
            <AnimatedTransactionCard />
          </div>
        </div>
      </div>
    </section>
  );
}

function AnimatedTransactionCard() {
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
    <div className="relative rounded-2xl border border-border bg-card p-4 shadow-2xl sm:p-5">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between border-b border-border pb-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <Shield className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-[13px] font-bold text-foreground">Transaction #SD-4829</p>
            <p className="text-[10px] text-muted-foreground">Protected by SafeDeal</p>
          </div>
        </div>
        <span className="rounded-full border border-success/30 bg-success/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-success">
          Protected
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
                  done
                    ? "bg-success"
                    : current
                      ? "bg-gradient-to-r from-primary to-success"
                      : "bg-transparent"
                }`}
              />
            );
          })}
        </div>
        <span className="shrink-0 text-[10px] font-semibold text-muted-foreground">
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
  const tone = TONE_STYLES[step.tone];

  let wrapClass = "border bg-muted/30 opacity-50";
  let iconWrapClass = "bg-muted text-muted-foreground";
  let titleClass = "text-muted-foreground";

  if (isDone) {
    wrapClass = "border-success/30 bg-success/10";
    iconWrapClass = "bg-success text-success-foreground";
    titleClass = "text-foreground";
  } else if (isActive) {
    wrapClass = `${tone.activeWrap} scale-[1.02] shadow-sm`;
    iconWrapClass = tone.activeIcon;
    titleClass = "text-foreground";
  }

  return (
    <li
      className={`flex items-center gap-2 rounded-lg p-2 transition-all duration-500 ease-out ${wrapClass}`}
    >
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors duration-500 ${iconWrapClass}`}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-[12px] font-bold leading-tight transition-colors duration-500 ${titleClass}`}>
          {step.title}
        </p>
        <p className="text-[10px] font-medium leading-tight text-muted-foreground">
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

function CTA({
  to,
  icon: Icon,
  label,
  variant,
  delay,
  className = "",
}: {
  to: string;
  icon: LucideIcon;
  label: string;
  variant: "primary" | "success" | "dark";
  delay: string;
  className?: string;
}) {
  const styles = {
    primary: "bg-primary text-primary-foreground hover:bg-primary/90",
    success: "bg-success text-success-foreground hover:bg-success/90",
    dark: "bg-foreground text-background hover:bg-foreground/90",
  }[variant];
  return (
    <Link
      to={to}
      style={{ animationDelay: delay, minHeight: "44px" }}
      className={`animate-fade-in inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-2.5 text-center text-[11px] font-bold leading-tight shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg sm:gap-2 sm:px-3 sm:text-[13px] lg:px-4 ${styles} ${className}`}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </Link>
  );
}
