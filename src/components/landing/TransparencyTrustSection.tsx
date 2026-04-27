import { Activity, UserCheck, Lock, Camera, Gavel, Store } from "lucide-react";
import { useScrollReveal } from "@/hooks/useScrollReveal";

const pillars = [
  {
    icon: Activity,
    title: "Complete transaction timeline",
    desc: "Every step from payment to delivery is tracked and visible to both parties.",
    tone: "primary" as const,
  },
  {
    icon: UserCheck,
    title: "Identity verification",
    desc: "Sellers verify email, phone, and identity before listing products.",
    tone: "success" as const,
  },
  {
    icon: Lock,
    title: "Locked agreement records",
    desc: "Product details, price, and terms are locked after payment and cannot be changed.",
    tone: "primary" as const,
  },
  {
    icon: Camera,
    title: "Delivery evidence",
    desc: "Photos, videos, and receipts stored for transparency and verification.",
    tone: "warning" as const,
  },
  {
    icon: Gavel,
    title: "Dispute handling",
    desc: "Evidence-backed dispute resolution protects both buyers and sellers fairly.",
    tone: "danger" as const,
  },
  {
    icon: Store,
    title: "Seller storefront reputation",
    desc: "Transaction history and ratings build seller trust over time.",
    tone: "success" as const,
  },
];

const toneMap = {
  primary: { wrap: "bg-primary/10", icon: "text-primary" },
  success: { wrap: "bg-success/10", icon: "text-success" },
  warning: { wrap: "bg-warning/10", icon: "text-warning" },
  danger: { wrap: "bg-destructive/10", icon: "text-destructive" },
};

const stats = [
  { label: "First rollout", value: "Lagos", color: "text-primary" },
  { label: "Payments supported", value: "NGN", color: "text-success" },
  { label: "Seller storefronts", value: "Verified", color: "text-warning" },
  { label: "Protected checkout", value: "Escrow", color: "text-primary" },
  { label: "Backed disputes", value: "Evidence", color: "text-success" },
];

function PillarCard({ p }: { p: (typeof pillars)[number] }) {
  const ref = useScrollReveal<HTMLDivElement>();
  const t = toneMap[p.tone];
  return (
    <div
      ref={ref}
      className="rounded-2xl border bg-card p-6 transition-all hover:-translate-y-0.5 hover:shadow-xl sm:p-8"
    >
      <div className={`mb-4 flex h-14 w-14 items-center justify-center rounded-2xl ${t.wrap}`}>
        <p.icon className={`h-7 w-7 ${t.icon}`} />
      </div>
      <h3 className="mb-2 text-lg font-bold text-foreground sm:text-xl">{p.title}</h3>
      <p className="text-sm text-muted-foreground sm:text-base">{p.desc}</p>
    </div>
  );
}

export function TransparencyTrustSection() {
  return (
    <section id="transparency" className="bg-muted/40 py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 text-center sm:mb-12">
          <h2 className="mb-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            Built on transparency and trust
          </h2>
          <p className="mx-auto max-w-2xl text-base text-muted-foreground">
            Why buyers and sellers can trust SafeDeal with every transaction.
          </p>
        </div>

        <div className="mb-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {pillars.map((p) => (
            <PillarCard key={p.title} p={p} />
          ))}
        </div>

        <div className="rounded-2xl border-2 border-primary/20 bg-card p-6 shadow-sm sm:p-10">
          <div className="mb-6 text-center sm:mb-8">
            <h3 className="mb-1.5 text-xl font-bold text-foreground sm:text-2xl">
              SafeDeal Lagos Launch
            </h3>
            <p className="text-sm text-muted-foreground sm:text-base">
              Building trust in online transactions, one protected deal at a time.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {stats.map((s) => (
              <div
                key={s.label}
                className="rounded-xl bg-muted/60 p-5 text-center"
              >
                <div className={`mb-1 text-2xl font-bold sm:text-3xl ${s.color}`}>{s.value}</div>
                <div className="text-xs text-muted-foreground sm:text-sm">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
