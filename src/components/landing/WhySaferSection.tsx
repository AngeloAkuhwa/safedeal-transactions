import { ShieldCheck, Lock, BadgeCheck, Camera, Receipt, Truck, Coins, FileText, User, Check } from "lucide-react";
import { useScrollReveal } from "@/hooks/useScrollReveal";

type Tone = "primary" | "success" | "warning";

const toneMap: Record<Tone, { wrap: string; ring: string; icon: string }> = {
  primary: { wrap: "bg-primary/10", ring: "ring-primary/20", icon: "text-primary" },
  success: { wrap: "bg-success/10", ring: "ring-success/20", icon: "text-success" },
  warning: { wrap: "bg-warning/10", ring: "ring-warning/20", icon: "text-warning" },
};

function ProofShell({
  index,
  tone,
  title,
  caption,
  children,
}: {
  index: number;
  tone: Tone;
  title: string;
  caption: string;
  children: React.ReactNode;
}) {
  const ref = useScrollReveal<HTMLDivElement>();
  const t = toneMap[tone];
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${index * 90}ms` }}
      className="group flex flex-col rounded-2xl border bg-card p-4 transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-lg"
    >
      {/* Visual */}
      <div
        className={`relative mb-3 flex h-28 items-center justify-center overflow-hidden rounded-xl ring-1 ${t.wrap} ${t.ring}`}
      >
        {children}
      </div>
      <h3 className="mb-1 text-base font-bold text-foreground">{title}</h3>
      <p className="text-[13px] leading-snug text-muted-foreground">{caption}</p>
    </div>
  );
}

/**
 * Visual 1 — Funds moving into an escrow safe.
 * Two coin pucks slide rightward into a shield/safe; safe scales softly on arrival.
 */
function EscrowSafeVisual() {
  return (
    <>
      <style>{`
        @keyframes sd-coin-flow {
          0%   { transform: translateX(-44px) translateY(0) scale(0.85); opacity: 0; }
          15%  { opacity: 1; }
          70%  { transform: translateX(28px) translateY(0) scale(0.9); opacity: 1; }
          85%  { transform: translateX(36px) translateY(0) scale(0.4); opacity: 0; }
          100% { transform: translateX(36px) translateY(0) scale(0.4); opacity: 0; }
        }
        @keyframes sd-safe-pulse {
          0%, 60%, 100% { transform: scale(1); }
          75%           { transform: scale(1.08); }
        }
        @media (prefers-reduced-motion: reduce) {
          .sd-coin, .sd-safe { animation: none !important; }
        }
      `}</style>
      <div className="relative flex h-full w-full items-center justify-center">
        {/* Coin 1 */}
        <span
          className="sd-coin absolute left-3 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full bg-warning text-warning-foreground shadow-md ring-2 ring-warning/30"
          style={{ animation: "sd-coin-flow 2.6s cubic-bezier(.4,0,.2,1) infinite" }}
        >
          <Coins className="h-3.5 w-3.5" />
        </span>
        {/* Coin 2 — staggered */}
        <span
          className="sd-coin absolute left-3 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full bg-warning text-warning-foreground shadow-md ring-2 ring-warning/30"
          style={{ animation: "sd-coin-flow 2.6s cubic-bezier(.4,0,.2,1) infinite", animationDelay: "1.3s" }}
        >
          <Coins className="h-3.5 w-3.5" />
        </span>

        {/* Safe / shield */}
        <span
          className="sd-safe relative ml-10 flex h-14 w-14 items-center justify-center rounded-2xl bg-success text-success-foreground shadow-lg ring-4 ring-success/20"
          style={{ animation: "sd-safe-pulse 2.6s ease-in-out infinite" }}
        >
          <ShieldCheck className="h-6 w-6" />
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-card text-primary shadow ring-2 ring-primary/30">
            <Lock className="h-2.5 w-2.5" />
          </span>
        </span>
      </div>
    </>
  );
}

/**
 * Visual 2 — Seller submitting verification documents.
 * Person icon slides a document toward a verification badge that ticks.
 */
function VerificationVisual() {
  return (
    <>
      <style>{`
        @keyframes sd-doc-slide {
          0%   { transform: translateX(0) rotate(-4deg); opacity: 0; }
          15%  { opacity: 1; }
          60%  { transform: translateX(28px) rotate(2deg); opacity: 1; }
          80%  { transform: translateX(36px) rotate(0deg); opacity: 0; }
          100% { transform: translateX(36px) rotate(0deg); opacity: 0; }
        }
        @keyframes sd-check-pop {
          0%, 60%, 100% { transform: scale(1); }
          75%           { transform: scale(1.18); }
        }
        @media (prefers-reduced-motion: reduce) {
          .sd-doc, .sd-check { animation: none !important; }
        }
      `}</style>
      <div className="relative flex h-full w-full items-center justify-center gap-2">
        {/* Seller */}
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary ring-2 ring-primary/20">
          <User className="h-5 w-5" />
        </span>

        {/* Animated document in flight */}
        <span
          className="sd-doc absolute left-[52px] top-1/2 -translate-y-1/2 flex h-7 w-6 items-center justify-center rounded-md border border-border bg-card text-primary shadow"
          style={{ animation: "sd-doc-slide 2.4s ease-in-out infinite" }}
        >
          <FileText className="h-3.5 w-3.5" />
        </span>

        {/* Verification badge */}
        <span
          className="sd-check ml-2 relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg ring-4 ring-primary/20"
          style={{ animation: "sd-check-pop 2.4s ease-in-out infinite" }}
        >
          <BadgeCheck className="h-6 w-6" />
          <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-success text-success-foreground shadow ring-2 ring-card">
            <Check className="h-2.5 w-2.5" />
          </span>
        </span>
      </div>
    </>
  );
}

/* Visual 3 — Evidence-backed disputes */
function EvidenceVisual() {
  return (
    <div className="relative h-16 w-24">
      <div className="absolute left-0 top-2 flex h-12 w-10 -rotate-6 items-center justify-center rounded-md border border-border bg-card shadow transition-transform duration-500 group-hover:-translate-x-1 group-hover:-rotate-12">
        <Receipt className="h-4 w-4 text-warning" />
      </div>
      <div className="absolute left-7 top-1 flex h-12 w-10 items-center justify-center rounded-md border border-border bg-card shadow-md">
        <Truck className="h-4 w-4 text-primary" />
      </div>
      <div className="absolute left-14 top-0 flex h-12 w-10 rotate-6 items-center justify-center rounded-md border border-border bg-card shadow-lg transition-transform duration-500 group-hover:translate-x-1 group-hover:rotate-12">
        <Camera className="h-4 w-4 text-success" />
      </div>
    </div>
  );
}

const proofs: {
  tone: Tone;
  title: string;
  caption: string;
  Visual: () => JSX.Element;
}[] = [
  {
    tone: "success",
    title: "Funds held in escrow",
    caption: "SafeDeal holds payment until the buyer confirms the item matches the agreement.",
    Visual: EscrowSafeVisual,
  },
  {
    tone: "primary",
    title: "Verified sellers only",
    caption: "Sellers pass key verification checks before listing protected products.",
    Visual: VerificationVisual,
  },
  {
    tone: "warning",
    title: "Evidence-backed disputes",
    caption: "Photos, videos, receipts, and delivery proof help resolve issues fairly.",
    Visual: EvidenceVisual,
  },
];

export function WhySaferSection() {
  return (
    <section id="why-safer" className="section-y bg-muted/30">
      <div className="container-x mx-auto max-w-6xl">
        <div className="mb-5 text-center sm:mb-7">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-semibold text-primary">Why SafeDeal</span>
          </div>
          <h2 className="h-section mb-2 font-bold text-foreground">Why SafeDeal feels safer</h2>
          <p className="body-lead mx-auto max-w-xl text-muted-foreground">
            Trust, locked into every step.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {proofs.map((p, i) => (
            <ProofShell key={p.title} index={i} tone={p.tone} title={p.title} caption={p.caption}>
              <p.Visual />
            </ProofShell>
          ))}
        </div>
      </div>
    </section>
  );
}
