import { useEffect, useRef, useState } from "react";
import {
  ShoppingBag,
  CreditCard,
  ShieldCheck,
  Truck,
  CircleCheck,
  Wallet,
  Check,
  type LucideIcon,
} from "lucide-react";

interface Step {
  icon: LucideIcon;
  title: string;
  helper: string;
}

const STEPS: Step[] = [
  { icon: ShoppingBag, title: "Choose or create deal", helper: "Pick a product or send a link" },
  { icon: CreditCard, title: "Pay through SafeDeal", helper: "Secure escrow checkout" },
  { icon: ShieldCheck, title: "Funds held securely", helper: "Money locked in escrow" },
  { icon: Truck, title: "Seller delivers", helper: "Shipped with proof" },
  { icon: CircleCheck, title: "Buyer verifies", helper: "Confirm item matches" },
  { icon: Wallet, title: "Seller gets paid", helper: "Funds released" },
];

export function HowItWorks() {
  const [active, setActive] = useState(0);
  const sectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
      setActive(STEPS.length - 1);
      return;
    }

    const itemEls = Array.from(
      el.querySelectorAll<HTMLElement>("[data-step-index]"),
    );

    const io = new IntersectionObserver(
      (entries) => {
        let highest = -1;
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const idx = Number((entry.target as HTMLElement).dataset.stepIndex);
            if (idx > highest) highest = idx;
          }
        });
        if (highest >= 0) {
          setActive((prev) => (highest > prev ? highest : prev));
        }
      },
      { threshold: 0.5, rootMargin: "0px 0px -20% 0px" },
    );

    itemEls.forEach((node) => io.observe(node));
    return () => io.disconnect();
  }, []);

  // Progress bar percentage
  const progress = ((active + 1) / STEPS.length) * 100;

  return (
    <section
      id="how-it-works"
      ref={sectionRef}
      className="section-y bg-muted/30"
    >
      <div className="container-x mx-auto max-w-6xl">
        <div className="mb-6 text-center sm:mb-10">
          <h2 className="h-section mb-2 font-bold text-foreground">How SafeDeal Works</h2>
          <p className="body-lead mx-auto max-w-xl text-left text-muted-foreground sm:text-center">
            Six steps. One recorded transaction.
          </p>
        </div>

        {/* Desktop horizontal timeline */}
        <div className="relative hidden lg:block">
          {/* Track */}
          <div className="absolute left-0 right-0 top-7 h-1 rounded-full bg-muted" />
          {/* Filled */}
          <div
            className="absolute left-0 top-7 h-1 rounded-full bg-primary transition-all duration-700 ease-out"
            style={{ width: `${progress}%` }}
          />
          <ol className="relative grid grid-cols-6 gap-2">
            {STEPS.map((step, i) => (
              <DesktopStep key={step.title} step={step} index={i} active={active} />
            ))}
          </ol>
        </div>

        {/* Mobile/tablet vertical timeline */}
        <div className="relative lg:hidden">
          <div className="absolute bottom-0 left-[18px] top-0 w-0.5 rounded-full bg-muted" />
          <div
            className="absolute left-[18px] top-0 w-0.5 rounded-full bg-primary transition-all duration-700 ease-out"
            style={{ height: `${progress}%` }}
          />
          <ol className="relative space-y-4">
            {STEPS.map((step, i) => (
              <MobileStep key={step.title} step={step} index={i} active={active} />
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

function stateOf(index: number, active: number): "done" | "current" | "pending" {
  if (index < active) return "done";
  if (index === active) return "current";
  return "pending";
}

function DesktopStep({ step, index, active }: { step: Step; index: number; active: number }) {
  const state = stateOf(index, active);
  const Icon = step.icon;
  return (
    <li
      data-step-index={index}
      className="relative flex flex-col items-center text-center transition-all duration-500"
    >
      <span
        className={`relative z-rail flex h-14 w-14 items-center justify-center rounded-full border-4 border-background shadow-md transition-all duration-500 ${
          state === "done"
            ? "bg-muted text-success"
            : state === "current"
              ? "scale-110 bg-primary text-primary-foreground ring-4 ring-primary/25"
              : "bg-muted text-muted-foreground"
        }`}
      >
        {state === "done" ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
      </span>
      <span
        className={`mt-1.5 text-xs font-bold uppercase tracking-wide transition-colors ${
          state === "pending" ? "text-muted-foreground" : "text-foreground"
        }`}
      >
        Step {index + 1}
      </span>
      <h3
        className={`mt-1 text-[13px] font-bold leading-tight transition-colors ${
          state === "pending" ? "text-muted-foreground" : "text-foreground"
        }`}
      >
        {step.title}
      </h3>
      <p className="mt-0.5 text-xs leading-tight text-muted-foreground">{step.helper}</p>
    </li>
  );
}

function MobileStep({ step, index, active }: { step: Step; index: number; active: number }) {
  const state = stateOf(index, active);
  const Icon = step.icon;
  return (
    <li
      data-step-index={index}
      className="relative flex items-start gap-3 transition-all duration-500"
    >
      <span
        className={`relative z-rail flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-[3px] border-background shadow-md transition-all duration-500 ${
          state === "done"
            ? "bg-muted text-success"
            : state === "current"
              ? "scale-110 bg-primary text-primary-foreground ring-4 ring-primary/25"
              : "bg-muted text-muted-foreground"
        }`}
      >
        {state === "done" ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
      </span>
      <div
        className={`min-w-0 flex-1 rounded-xl border bg-card p-3 transition-all duration-500 ${
          state === "current" ? "border-primary/30 shadow-md" : "border-border"
        } ${state === "pending" ? "opacity-70" : ""}`}
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[14px] font-bold leading-tight text-foreground">{step.title}</h3>
          <span className="text-xs font-bold text-muted-foreground">{index + 1}/6</span>
        </div>
        <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{step.helper}</p>
      </div>
    </li>
  );
}
