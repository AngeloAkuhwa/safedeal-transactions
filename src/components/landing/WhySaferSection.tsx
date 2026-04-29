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
      className="rounded-2xl border bg-card p-4 sm:p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${t.wrap}`}>
        <r.icon className={`h-5 w-5 ${t.icon}`} />
      </div>
      <h3 className="mb-1 text-base font-bold text-foreground sm:text-lg">{r.title}</h3>
      <p className="text-[13px] leading-relaxed text-muted-foreground">{r.description}</p>
    </div>
  );
}

export function WhySaferSection() {
  return (
    <section id="why-safer" className="section-y bg-muted/30">
      <div className="container-x mx-auto max-w-6xl">
        <div className="mb-5 text-center sm:mb-7">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-semibold text-primary">Why SafeDeal</span>
          </div>
          <h2 className="h-section mb-2 font-bold text-foreground">
            Why SafeDeal feels safer
          </h2>
          <p className="body-lead mx-auto max-w-xl text-muted-foreground">
            Built specifically for trust between buyers and sellers — not just a payment processor.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {reasons.map((r) => (
            <ReasonCard key={r.title} r={r} />
          ))}
        </div>
      </div>
    </section>
  );
}
