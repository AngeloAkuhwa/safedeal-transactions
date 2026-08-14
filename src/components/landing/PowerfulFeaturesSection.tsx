import { useEffect, useRef, useState } from "react";
import {
  ShoppingBag,
  Link2,
  ShieldCheck,
  Store,
  Lock,
  Truck,
  CircleCheck,
  Camera,
  Sparkles,
  Bot,
  Search,
  AlertCircle,
  Lightbulb,
  UserCheck,
  Check,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { useScrollReveal } from "@/hooks/useScrollReveal";

type Tone = "primary" | "success" | "warning" | "danger";

interface MiniStep {
  icon: LucideIcon;
  label: string;
}

interface Feature {
  icon: LucideIcon;
  title: string;
  line: string;
  tone: Tone;
  steps: MiniStep[];
  hero?: boolean;
  chips?: string[];
}

const FEATURES: Feature[] = [
  {
    icon: ShoppingBag,
    title: "Protected Marketplace",
    line: "Browse public listings where every deal can be escrow-protected.",
    tone: "primary",
    steps: [
      { icon: CircleCheck, label: "Listing verified" },
      { icon: ShieldCheck, label: "Protection on" },
      { icon: ShoppingBag, label: "Checkout ready" },
    ],
  },
  {
    icon: Link2,
    title: "Direct Deal Links",
    line: "Create a private protected link for WhatsApp, Instagram, or DM transactions.",
    tone: "success",
    steps: [
      { icon: Link2, label: "Create link" },
      { icon: ChevronRight, label: "Share" },
      { icon: UserCheck, label: "Buyer opens" },
    ],
  },
  {
    icon: ShieldCheck,
    title: "Funds Held Securely",
    line: "Buyer payment stays safely held until verification or resolution.",
    tone: "primary",
    steps: [
      { icon: CircleCheck, label: "Payment in" },
      { icon: Lock, label: "In escrow" },
      { icon: Check, label: "Awaiting OK" },
    ],
  },
  {
    icon: Store,
    title: "Verified Seller Storefronts",
    line: "Buy from sellers with verified profiles, ratings, and completed deals.",
    tone: "success",
    steps: [
      { icon: UserCheck, label: "ID checked" },
      { icon: Store, label: "Store verified" },
      { icon: ShieldCheck, label: "Trusted" },
    ],
  },
  {
    icon: Lock,
    title: "Locked Agreement",
    line: "Item details, price, and delivery terms are locked after payment.",
    tone: "warning",
    steps: [
      { icon: Check, label: "Price agreed" },
      { icon: Lock, label: "Terms locked" },
      { icon: ShieldCheck, label: "No edits" },
    ],
  },
  {
    icon: Truck,
    title: "Delivery Tracking",
    line: "Sellers upload courier details, tracking numbers, and delivery proof.",
    tone: "primary",
    steps: [
      { icon: ShoppingBag, label: "Dispatched" },
      { icon: Search, label: "Tracking on" },
      { icon: Truck, label: "In transit" },
    ],
  },
  {
    icon: CircleCheck,
    title: "Buyer Confirmation",
    line: "Funds release only after the buyer confirms the item matches.",
    tone: "success",
    steps: [
      { icon: Truck, label: "Received" },
      { icon: Search, label: "Reviewed" },
      { icon: CircleCheck, label: "Confirmed" },
    ],
  },
  {
    icon: Camera,
    title: "Evidence Uploads",
    line: "Photos, videos, receipts, and delivery proof support dispute reviews.",
    tone: "warning",
    steps: [
      { icon: Camera, label: "Photos" },
      { icon: Check, label: "Receipt" },
      { icon: ShieldCheck, label: "Proof ready" },
    ],
  },
  {
    icon: Bot,
    title: "Smart Dispute Resolution Agent",
    line: "Automatically reviews claims, evidence, and missing proof to speed up fair resolutions.",
    tone: "danger",
    hero: true,
    chips: [
      "Reviews evidence",
      "Flags missing proof",
      "Suggests next action",
      "Escalates to human",
    ],
    steps: [
      { icon: AlertCircle, label: "Claim" },
      { icon: Search, label: "Scanned" },
      { icon: Lightbulb, label: "Suggested" },
      { icon: UserCheck, label: "Human review" },
    ],
  },
];

const toneMap: Record<
  Tone,
  {
    iconWrap: string;
    iconColor: string;
    iconHover: string;
    chipActive: string;
    chipDone: string;
    border: string;
  }
> = {
  primary: {
    iconWrap: "bg-primary/10",
    iconColor: "text-primary",
    iconHover: "group-hover:bg-primary group-hover:text-primary-foreground",
    chipActive: "border-primary/40 bg-primary/15 text-primary ring-1 ring-primary/25",
    chipDone: "border-primary/20 bg-primary/5 text-primary",
    border: "hover:border-primary/40",
  },
  success: {
    iconWrap: "bg-success/10",
    iconColor: "text-success",
    iconHover: "group-hover:bg-success group-hover:text-success-foreground",
    chipActive: "border-success/40 bg-success/15 text-success ring-1 ring-success/25",
    chipDone: "border-success/20 bg-success/5 text-success",
    border: "hover:border-success/40",
  },
  warning: {
    iconWrap: "bg-warning/10",
    iconColor: "text-warning",
    iconHover: "group-hover:bg-warning group-hover:text-warning-foreground",
    chipActive: "border-warning/40 bg-warning/15 text-warning ring-1 ring-warning/25",
    chipDone: "border-warning/20 bg-warning/5 text-warning",
    border: "hover:border-warning/40",
  },
  danger: {
    iconWrap: "bg-destructive/10",
    iconColor: "text-destructive",
    iconHover: "group-hover:bg-destructive group-hover:text-destructive-foreground",
    chipActive: "border-destructive/40 bg-destructive/15 text-destructive ring-1 ring-destructive/25",
    chipDone: "border-destructive/20 bg-destructive/5 text-destructive",
    border: "hover:border-destructive/40",
  },
};

/** One-shot in-view observer. */
function useInView<T extends HTMLElement>(threshold = 0.3) {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setSeen(true);
            io.disconnect();
            break;
          }
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen, threshold]);
  return { ref, seen };
}

function MiniFlow({
  steps,
  step,
  shouldPlay,
  tone,
}: {
  steps: MiniStep[];
  step: number;
  shouldPlay: boolean;
  tone: ReturnType<typeof toneMapGetter>;
}) {
  // Use a CSS grid so columns share width evenly and content cannot overflow.
  // Connectors are subtle dots between cells, not arrows that consume space.
  return (
    <div
      className="grid items-stretch gap-1"
      style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
    >
      {steps.map((s, i) => {
        const done = i < step;
        const current = i === step && shouldPlay;
        const StepIcon = s.icon;
        return (
          <div
            key={s.label}
            className={`flex min-w-0 items-center justify-center gap-1 rounded-lg border px-1.5 py-1.5 transition-all duration-500 ${
              done
                ? tone.chipDone
                : current
                  ? `${tone.chipActive} scale-[1.02]`
                  : "border-border bg-card/50 text-muted-foreground opacity-70"
            }`}
            title={s.label}
          >
            <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
              {done ? (
                <Check className="h-3 w-3" />
              ) : (
                <StepIcon className="h-3 w-3" />
              )}
            </span>
            <span className="min-w-0 truncate text-[10px] font-bold leading-tight">
              {s.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// helper for typing of toneMap tone object
function toneMapGetter(tone: Tone) {
  return toneMap[tone];
}

function FeatureCard({
  f,
  index,
  isActive,
  forceHeroOnce,
}: {
  f: Feature;
  index: number;
  isActive: boolean;
  forceHeroOnce: boolean;
}) {
  const ref = useScrollReveal<HTMLDivElement>({ delay: index * 70 });
  const { ref: inViewRef, seen } = useInView<HTMLDivElement>(0.35);
  const [hovered, setHovered] = useState(false);
  const [step, setStep] = useState(0);
  const total = f.steps.length;

  const shouldPlay = isActive || hovered || (f.hero && forceHeroOnce && seen);

  useEffect(() => {
    if (!shouldPlay) {
      setStep(0);
      return;
    }
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setStep(total - 1);
      return;
    }
    setStep(0);
    const tick = f.hero ? 700 : 600;
    const id = window.setInterval(() => {
      setStep((s) => (s >= total - 1 ? s : s + 1));
    }, tick);
    return () => window.clearInterval(id);
  }, [shouldPlay, total, f.hero]);

  const t = toneMap[f.tone];
  const setRefs = (node: HTMLDivElement | null) => {
    (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
    (inViewRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
  };

  return (
    <div
      ref={setRefs}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      tabIndex={0}
      className={`group relative flex h-full flex-col overflow-hidden rounded-2xl border bg-card p-4 outline-none transition-all duration-300 hover:-translate-y-1 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-primary/40 ${
        f.hero
          ? "border-2 border-destructive/30 bg-gradient-to-br from-destructive/5 via-card to-card shadow-md"
          : t.border
      }`}
    >
      {/* Hero soft moving glow */}
      {f.hero && (
        <span
          aria-hidden
          className="sd-hero-glow pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(60% 80% at 20% 0%, hsl(var(--destructive)/0.12), transparent 60%), radial-gradient(50% 80% at 90% 100%, hsl(var(--primary)/0.10), transparent 60%)",
          }}
        />
      )}

      <div className="relative z-10 flex h-full min-w-0 flex-col">
        {/* Header */}
        <div className="mb-3 flex items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all duration-300 group-hover:scale-110 ${t.iconWrap} ${t.iconHover}`}
          >
            <f.icon className={`h-5 w-5 transition-colors ${t.iconColor} group-hover:text-current`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h3 className="min-w-0 truncate text-[14px] font-bold leading-tight text-foreground sm:text-[15px]">
                {f.title}
              </h3>
              {f.hero && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-destructive">
                  <Sparkles className="h-2.5 w-2.5" />
                  AI
                </span>
              )}
            </div>
            <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-muted-foreground">
              {f.line}
            </p>
          </div>
        </div>

        {/* Hero status chips — always visible (no sd-reveal opacity trap) */}
        {f.hero && f.chips && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {f.chips.map((c, i) => (
              <ChipReveal key={c} delay={i * 90}>
                <span className="inline-flex items-center gap-1 rounded-full border border-destructive/20 bg-destructive/5 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                  <Check className="h-2.5 w-2.5" />
                  {c}
                </span>
              </ChipReveal>
            ))}
          </div>
        )}

        {/* Mini-flow */}
        <div className="mt-auto rounded-xl border border-border/70 bg-muted/30 p-1.5">
          <MiniFlow steps={f.steps} step={step} shouldPlay={shouldPlay} tone={t} />
        </div>
      </div>
    </div>
  );
}

/**
 * Small wrapper that applies a one-shot fade-up reveal and is GUARANTEED to
 * end visible — uses the project's useScrollReveal hook, which falls back to
 * immediately visible when IO/reduced-motion is unavailable.
 */
function ChipReveal({ children, delay }: { children: React.ReactNode; delay: number }) {
  const ref = useScrollReveal<HTMLSpanElement>({ delay });
  return <span ref={ref}>{children}</span>;
}

function ProtectionStrip() {
  const ref = useScrollReveal<HTMLDivElement>();
  const { ref: inViewRef, seen } = useInView<HTMLDivElement>(0.5);
  const [step, setStep] = useState(-1);
  const items = [
    { icon: Lock, label: "Locked terms" },
    { icon: ShieldCheck, label: "Escrow protected" },
    { icon: Truck, label: "Delivery tracked" },
    { icon: Bot, label: "Dispute agent ready" },
  ];

  useEffect(() => {
    if (!seen) return;
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setStep(items.length - 1);
      return;
    }
    let i = 0;
    setStep(0);
    const id = window.setInterval(() => {
      i += 1;
      if (i >= items.length) {
        window.clearInterval(id);
        return;
      }
      setStep(i);
    }, 550);
    return () => window.clearInterval(id);
  }, [seen, items.length]);

  const setRefs = (node: HTMLDivElement | null) => {
    (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
    (inViewRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
  };

  return (
    <div
      ref={setRefs}
      className="mx-auto mt-6 max-w-4xl rounded-2xl border bg-card/60 p-2 shadow-sm backdrop-blur"
    >
      <div
        className="grid items-stretch gap-1.5"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map((it, i) => {
          const reached = i <= step;
          const Icon = it.icon;
          return (
            <div
              key={it.label}
              className={`flex min-w-0 items-center justify-center gap-1.5 rounded-xl border px-2 py-2 transition-all duration-500 ${
                reached
                  ? "border-success/30 bg-success/10 text-success"
                  : "border-border bg-muted/30 text-muted-foreground opacity-70"
              }`}
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                {reached ? <Check className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
              </span>
              <span className="min-w-0 truncate text-[10px] font-bold sm:text-[11px]">
                {it.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PowerfulFeaturesSection() {
  const headerRef = useScrollReveal<HTMLDivElement>();
  const { ref: gridRef, seen } = useInView<HTMLDivElement>(0.15);
  const [activeIndex, setActiveIndex] = useState(-1);
  const cardCount = FEATURES.length;

  useEffect(() => {
    if (!seen) return;
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    const startDelay = 70 * cardCount + 600;
    const startId = window.setTimeout(() => {
      setActiveIndex(0);
    }, startDelay);

    const cycleId = window.setInterval(() => {
      setActiveIndex((i) => (i + 1) % cardCount);
    }, 2600);

    return () => {
      window.clearTimeout(startId);
      window.clearInterval(cycleId);
    };
  }, [seen, cardCount]);

  const setGridRefs = (node: HTMLDivElement | null) => {
    (gridRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
  };

  return (
    <section id="features" className="section-y bg-muted/30">
      <style>{`
        @keyframes sd-hero-glow-shift {
          0%, 100% { opacity: 0.85; transform: translate3d(0, 0, 0); }
          50%      { opacity: 1;    transform: translate3d(6px, -4px, 0); }
        }
        .sd-hero-glow {
          animation: sd-hero-glow-shift 6s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .sd-hero-glow { animation: none !important; }
        }
      `}</style>

      <div className="container-x mx-auto max-w-6xl">
        <div ref={headerRef} className="mb-6 text-center sm:mb-8">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-semibold text-primary">Features</span>
          </div>
          <h2 className="h-section mb-2 font-bold text-foreground">
            Powerful features for secure transactions
          </h2>
          <p className="body-lead mx-auto max-w-2xl text-muted-foreground">
            Everything needed to protect buyers, verify sellers, track delivery, and resolve
            disputes faster.
          </p>
        </div>

        <div
          ref={setGridRefs}
          className="grid gap-3 sm:grid-cols-2 sm:gap-3.5 lg:grid-cols-3"
        >
          {FEATURES.map((f, i) => (
            <FeatureCard
              key={f.title}
              f={f}
              index={i}
              isActive={activeIndex === i}
              forceHeroOnce={seen}
            />
          ))}
        </div>

        <ProtectionStrip />
      </div>
    </section>
  );
}
