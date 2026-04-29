import { Lock, BadgeCheck, Camera, ShieldCheck } from "lucide-react";
import { useScrollReveal } from "@/hooks/useScrollReveal";

const reasons = [
  {
    icon: Lock,
    title: "Funds held in escrow",
    description:
      "SafeDeal holds payment securely until the buyer confirms the item matches the agreement.",
    tone: "primary" as const,
  },
  {
    icon: BadgeCheck,
    title: "Verified sellers only",
    description:
      "Every seller passes email, phone, and identity verification before listing on SafeDeal.",
    tone: "success" as const,
  },
  {
    icon: Camera,
    title: "Evidence-backed disputes",
    description:
      "If something goes wrong, our team reviews photos, videos, and receipts before releasing funds.",
    tone: "warning" as const,
  },
];

const toneMap = {
  primary: { wrap: "bg-primary/10", icon: "text-primary" },
  success: { wrap: "bg-success/10", icon: "text-success" },
  warning: { wrap: "bg-warning/10", icon: "text-warning" },
};

function ReasonCard({ r }: { r: (typeof reasons)[number] }) {
  const ref = useScrollReveal<HTMLDivElement>();
  const t = toneMap[r.tone];
  return (
    <div
      ref={ref}
      className="rounded-2xl border bg-card p-6 transition-all hover:-translate-y-0.5 hover:shadow-lg sm:p-8"
    >
      <div className={`mb-5 flex h-14 w-14 items-center justify-center rounded-2xl ${t.wrap}`}>
        <r.icon className={`h-7 w-7 ${t.icon}`} />
      </div>
      <h3 className="mb-2 text-xl font-bold text-foreground">{r.title}</h3>
      <p className="text-sm text-muted-foreground sm:text-base">{r.description}</p>
    </div>
  );
}

export function WhySaferSection() {
  return (
    <section id="why-safer" className="section-y bg-muted/30">
      <div className="container-x mx-auto max-w-7xl">
        <div className="mb-10 text-center sm:mb-14">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-semibold text-primary">Why SafeDeal</span>
          </div>
          <h2 className="h-section mb-3 font-bold text-foreground">
            Why SafeDeal feels safer
          </h2>
          <p className="body-lead mx-auto max-w-2xl text-muted-foreground">
            Built specifically for trust between buyers and sellers — not just a payment processor.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3 lg:gap-8">
          {reasons.map((r) => (
            <ReasonCard key={r.title} r={r} />
          ))}
        </div>
      </div>
    </section>
  );
}
