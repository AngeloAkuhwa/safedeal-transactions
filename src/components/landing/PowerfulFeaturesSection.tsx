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
  type LucideIcon,
} from "lucide-react";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { SnapCarousel } from "@/components/ui/snap-carousel";
import { alwaysClaim } from "@/lib/trust/trust-claims";

type Tone = "primary" | "neutral";

interface MiniStep {
  icon: LucideIcon;
  label: string;
}

interface FeatureBase {
  icon: LucideIcon;
  title: string;
  line: string;
  tone: Tone;
}

interface OrdinaryFeature extends FeatureBase {
  hero?: false;
  steps?: undefined;
  chips?: undefined;
}

/** Only the hero (Dispute Agent) card renders a MiniFlow + chips. */
interface HeroFeature extends FeatureBase {
  hero: true;
  steps: MiniStep[];
  chips: string[];
}

type Feature = OrdinaryFeature | HeroFeature;

const FEATURES: Feature[] = [
  {
    icon: ShoppingBag,
    title: "Protected Marketplace",
    line: "Browse public listings where every deal can be escrow-protected.",
    tone: "neutral",
  },
  {
    icon: Link2,
    title: "Direct Deal Links",
    line: "Create a private protected link for deals that start in chat, DMs, or email.",
    tone: "neutral",
  },
  {
    icon: ShieldCheck,
    title: "Funds Held Securely",
    line: "Buyer payment stays safely held until verification or resolution.",
    tone: "neutral",
  },
  {
    icon: Store,
    title: "Seller Storefronts",
    line: "Every seller gets a storefront, with their real verification status shown on each listing.",
    tone: "neutral",
  },
  {
    icon: Lock,
    title: "Locked Agreement",
    line: "Item details, price, and delivery terms are locked after payment.",
    tone: "neutral",
  },
  {
    icon: Truck,
    title: "Delivery Tracking",
    line: "Sellers upload courier details, tracking numbers, and delivery proof.",
    tone: "neutral",
  },
  {
    icon: CircleCheck,
    title: "Buyer Confirmation",
    line: "Funds release only after the buyer confirms the item matches.",
    tone: "neutral",
  },
  {
    icon: Camera,
    title: "Evidence Uploads",
    line: "Photos, videos, receipts, and delivery proof support dispute reviews.",
    tone: "neutral",
  },
  {
    icon: Bot,
    title: "Smart Dispute Resolution Agent",
    line: "Automatically reviews claims, evidence, and missing proof to speed up fair resolutions.",
    tone: "primary",
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
    chipActive: "border-primary/40 bg-primary/10 text-foreground ring-1 ring-primary/25",
    chipDone: "border-primary/20 bg-primary/5 text-foreground",
    border: "hover:border-primary/40",
  },
  neutral: {
    iconWrap: "bg-muted",
    iconColor: "text-muted-foreground",
    iconHover: "group-hover:bg-primary group-hover:text-primary-foreground",
    chipActive: "border-border bg-muted text-foreground ring-1 ring-border",
    chipDone: "border-border bg-muted/60 text-muted-foreground",
    border: "hover:border-primary/40",
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
  // Four-step flows wrap to 2x2 on narrow cards so text-xs labels still fit.
  const wide = steps.length > 3;
  const smCols =
    wide || steps.length === 2
      ? "sm:grid-cols-4"
      : steps.length === 3
        ? "sm:grid-cols-3"
        : "sm:grid-cols-2";
  const oddTail = !wide && steps.length % 2 === 1;
  return (
    <div className={`grid grid-cols-2 items-stretch gap-1 ${smCols}`}>
      {steps.map((s, i) => {
        const done = i < step;
        const current = i === step && shouldPlay;
        const StepIcon = s.icon;
        return (
          <div
            key={s.label}
            className={`flex min-w-0 items-center justify-center gap-1 rounded-xl border px-2 py-1.5 transition-all duration-500 ${
              oddTail && i === steps.length - 1 ? "col-span-2 sm:col-span-1" : ""
            } ${
              done
                ? tone.chipDone
                : current
                  ? `${tone.chipActive} scale-[1.02]`
                  : "border-border bg-card/50 text-muted-foreground opacity-70"
            }`}
            title={s.label}
          >
            <span className="flex h-3 w-3 shrink-0 items-center justify-center">
              {done ? (
                <Check className="h-3 w-3" />
              ) : (
                <StepIcon className="h-3 w-3" />
              )}
            </span>
            <span className="min-w-0 truncate text-xs font-bold leading-tight">
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
  className,
}: {
  f: Feature;
  index: number;
  isActive: boolean;
  forceHeroOnce: boolean;
  className?: string;
}) {
  const ref = useScrollReveal<HTMLDivElement>({ delay: index * 70 });
  const { ref: inViewRef, seen } = useInView<HTMLDivElement>(0.35);
  const [hovered, setHovered] = useState(false);
  const [step, setStep] = useState(0);
  const total = f.steps?.length ?? 0;

  const shouldPlay = isActive || hovered || (f.hero && forceHeroOnce && seen);

  useEffect(() => {
    if (!shouldPlay || total === 0) {
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
      className={`group relative flex h-full flex-col overflow-hidden rounded-2xl border bg-card p-4 outline-none transition-all duration-300 hover:-translate-y-1 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-primary/40 ${className ?? ""} ${
        f.hero
          ? "border-2 border-primary/30 bg-gradient-to-br from-primary/5 via-card to-card shadow-md"
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
              "radial-gradient(60% 80% at 20% 0%, hsl(var(--primary)/0.14), transparent 60%), radial-gradient(50% 80% at 90% 100%, hsl(var(--primary)/0.10), transparent 60%)",
          }}
        />
      )}

      <div className="relative z-rail flex h-full min-w-0 flex-col">
        {/* Header */}
        <div className="mb-3 flex items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all duration-300 group-hover:scale-110 ${t.iconWrap} ${t.iconHover}`}
          >
            <f.icon className={`h-5 w-5 transition-colors ${t.iconColor} group-hover:text-current`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h3 className="min-w-0 text-balance text-[14px] font-bold leading-tight text-foreground sm:text-[15px]">
                {f.title}
              </h3>
              {f.hero && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-1.5 py-0.5 text-xs font-bold uppercase tracking-wide text-primary-foreground">
                  <Sparkles className="h-3 w-3" />
                  AI
                </span>
              )}
            </div>
            <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted-foreground">
              {f.line}
            </p>
          </div>
        </div>

        {/* Hero status chips: always visible (no sd-reveal opacity trap) */}
        {f.hero && f.chips && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {f.chips.map((c, i) => (
              <ChipReveal key={c} delay={i * 90}>
                <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-xs font-semibold text-foreground">
                  <Check className="h-3 w-3" />
                  {c}
                </span>
              </ChipReveal>
            ))}
          </div>
        )}

        {/* Mini-flow: hero (dispute agent) only */}
        {f.hero && f.steps && (
          <div className="mt-auto rounded-xl border border-border/70 bg-muted/30 p-1.5">
            <MiniFlow steps={f.steps} step={step} shouldPlay={shouldPlay} tone={t} />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Small wrapper that applies a one-shot fade-up reveal and is GUARANTEED to
 * end visible: uses the project's useScrollReveal hook, which falls back to
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
    { icon: ShieldCheck, label: alwaysClaim("ESCROW_PROTECTED") },
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
      className="mx-auto mb-6 mt-6 max-w-4xl rounded-2xl border bg-card/60 p-2 shadow-sm backdrop-blur sm:mb-0"
    >
      <div className="grid grid-cols-2 items-stretch gap-1.5 sm:grid-cols-4">
        {items.map((it, i) => {
          const reached = i <= step;
          const Icon = it.icon;
          return (
            <div
              key={it.label}
              className={`flex min-w-0 items-center justify-center gap-1.5 rounded-xl border px-2 py-2 transition-all duration-500 ${
                reached
                  ? "border-border bg-muted/60 text-foreground"
                  : "border-border bg-muted/30 text-muted-foreground opacity-70"
              }`}
            >
              <span className="flex h-3 w-3 shrink-0 items-center justify-center">
                {reached ? <Check className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
              </span>
              <span className="min-w-0 truncate text-xs font-bold sm:text-xs">
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
          <h2 className="h-section mb-2 font-bold text-foreground">
            Powerful features for secure transactions
          </h2>
          <p className="body-lead mx-auto max-w-2xl text-left text-muted-foreground sm:text-center">
            Everything needed to protect buyers, verify sellers, track delivery, and resolve
            disputes faster.
          </p>
        </div>

        {/* Mobile: hero feature showcased full-width, the rest swipeable */}
        <div ref={setGridRefs} className="sm:hidden">
          {FEATURES.filter((f) => f.hero).map((f) => (
            <div key={`m-${f.title}`} className="mb-4">
              <FeatureCard
                f={f}
                index={FEATURES.indexOf(f)}
                isActive={activeIndex === FEATURES.indexOf(f)}
                forceHeroOnce={seen}
              />
            </div>
          ))}
          <SnapCarousel ariaLabel="More SafeDeal features">
            {FEATURES.filter((f) => !f.hero).map((f) => (
              <FeatureCard
                key={`m-${f.title}`}
                f={f}
                index={FEATURES.indexOf(f)}
                isActive={activeIndex === FEATURES.indexOf(f)}
                forceHeroOnce={seen}
              />
            ))}
          </SnapCarousel>
        </div>

        {/* Desktop: even rows of ordinary cards, hero deliberately spans the full row */}
        <div className="hidden gap-3 sm:grid sm:grid-cols-2 sm:items-stretch sm:gap-3.5 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <FeatureCard
              key={f.title}
              f={f}
              index={i}
              isActive={activeIndex === i}
              forceHeroOnce={seen}
              className={f.hero ? "sm:col-span-2 lg:col-span-4" : undefined}
            />
          ))}
        </div>

        <ProtectionStrip />
      </div>
    </section>
  );
}
