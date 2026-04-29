import {
  Lock,
  ShieldCheck,
  FileCheck2,
  Camera,
  Receipt,
  Truck,
  Wallet,
  ArrowDown,
  Check,
  type LucideIcon,
} from "lucide-react";
import { useScrollReveal } from "@/hooks/useScrollReveal";

type Tone = "primary" | "success" | "warning";

const toneMap: Record<Tone, { wrap: string; ring: string; icon: string; bg: string }> = {
  primary: { wrap: "bg-primary/10", ring: "ring-primary/20", icon: "text-primary", bg: "bg-primary" },
  success: { wrap: "bg-success/10", ring: "ring-success/20", icon: "text-success", bg: "bg-success" },
  warning: { wrap: "bg-warning/10", ring: "ring-warning/20", icon: "text-warning", bg: "bg-warning" },
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
      style={{ transitionDelay: `${index * 100}ms` }}
      className="group flex flex-col rounded-2xl border bg-card p-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl sm:p-5"
    >
      {/* Visual */}
      <div
        className={`relative mb-4 flex h-32 items-center justify-center overflow-hidden rounded-xl ring-1 ${t.wrap} ${t.ring}`}
      >
        {children}
      </div>
      <h3 className="mb-1 text-base font-bold text-foreground sm:text-[17px]">{title}</h3>
      <p className="text-[13px] leading-snug text-muted-foreground">{caption}</p>
    </div>
  );
}

/* Visual 1 — Locked Agreement */
function LockedAgreementVisual() {
  return (
    <div className="relative">
      <div className="relative h-24 w-20 rounded-md border border-border bg-card shadow-md transition-transform duration-500 group-hover:-rotate-2">
        <div className="space-y-1 p-2">
          <div className="h-1.5 w-12 rounded bg-muted-foreground/30" />
          <div className="h-1 w-14 rounded bg-muted-foreground/20" />
          <div className="h-1 w-10 rounded bg-muted-foreground/20" />
          <div className="h-1 w-12 rounded bg-muted-foreground/20" />
          <div className="h-1 w-8 rounded bg-muted-foreground/20" />
        </div>
        <FileCheck2 className="absolute right-1 top-1 h-3 w-3 text-primary" />
      </div>
      {/* Lock badge */}
      <span className="absolute -bottom-1 -right-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-card transition-transform duration-500 group-hover:scale-110">
        <Lock className="h-4 w-4 animate-pulse" />
      </span>
    </div>
  );
}

/* Visual 2 — Escrow Protection */
function EscrowVisual() {
  return (
    <div className="relative flex items-center gap-3">
      {/* Coin */}
      <div className="flex h-9 w-9 animate-bounce items-center justify-center rounded-full bg-warning text-warning-foreground shadow-md [animation-duration:2s]">
        <Wallet className="h-4 w-4" />
      </div>
      {/* Arrow */}
      <ArrowDown className="h-4 w-4 -rotate-90 text-success" />
      {/* Vault / shield */}
      <div className="relative">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-success text-success-foreground shadow-lg ring-4 ring-success/20 transition-transform duration-500 group-hover:scale-105">
          <ShieldCheck className="h-7 w-7" />
        </div>
        <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-card text-success shadow ring-2 ring-success/30">
          <Check className="h-3 w-3" />
        </span>
      </div>
    </div>
  );
}

/* Visual 3 — Evidence Review */
function EvidenceVisual() {
  return (
    <div className="relative h-20 w-24">
      {/* Bottom card — receipt */}
      <div className="absolute left-0 top-2 flex h-14 w-12 -rotate-6 items-center justify-center rounded-md border border-border bg-card shadow transition-transform duration-500 group-hover:-translate-x-1 group-hover:-rotate-12">
        <Receipt className="h-5 w-5 text-warning" />
      </div>
      {/* Middle card — delivery */}
      <div className="absolute left-6 top-1 flex h-14 w-12 items-center justify-center rounded-md border border-border bg-card shadow-md">
        <Truck className="h-5 w-5 text-primary" />
      </div>
      {/* Top card — photo */}
      <div className="absolute left-12 top-0 flex h-14 w-12 rotate-6 items-center justify-center rounded-md border border-border bg-card shadow-lg transition-transform duration-500 group-hover:translate-x-1 group-hover:rotate-12">
        <Camera className="h-5 w-5 text-success" />
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
  { tone: "primary", title: "Locked Agreement", caption: "Terms cannot change after payment.", Visual: LockedAgreementVisual },
  { tone: "success", title: "Escrow Protection", caption: "Funds stay held until buyer verification.", Visual: EscrowVisual },
  { tone: "warning", title: "Evidence Review", caption: "Disputes are reviewed with evidence.", Visual: EvidenceVisual },
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
