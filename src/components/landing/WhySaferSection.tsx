import { ShieldCheck, Lock, BadgeCheck, Camera, Receipt, Truck } from "lucide-react";
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
        className={`relative mb-3 flex h-24 items-center justify-center overflow-hidden rounded-xl ring-1 ${t.wrap} ${t.ring}`}
      >
        {children}
      </div>
      <h3 className="mb-1 text-base font-bold text-foreground">{title}</h3>
      <p className="text-[13px] leading-snug text-muted-foreground">{caption}</p>
    </div>
  );
}

/* Visual 1 — Funds held in escrow */
function EscrowVisual() {
  return (
    <div className="relative">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-success text-success-foreground shadow-lg ring-4 ring-success/20 transition-transform duration-500 group-hover:scale-110">
        <ShieldCheck className="h-6 w-6" />
      </div>
      <span className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-card text-primary shadow ring-2 ring-primary/30 transition-transform duration-500 group-hover:rotate-12">
        <Lock className="h-3 w-3" />
      </span>
    </div>
  );
}

/* Visual 2 — Verified sellers only */
function VerifiedVisual() {
  return (
    <div className="relative">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg ring-4 ring-primary/20 transition-transform duration-500 group-hover:scale-110">
        <BadgeCheck className="h-7 w-7" />
      </div>
      <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-success text-success-foreground shadow ring-2 ring-card">
        <BadgeCheck className="h-3 w-3" />
      </span>
    </div>
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
    Visual: EscrowVisual,
  },
  {
    tone: "primary",
    title: "Verified sellers only",
    caption: "Sellers pass key verification checks before listing protected products.",
    Visual: VerifiedVisual,
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
