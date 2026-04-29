import { ShieldCheck, UserCheck, MessageCircle, Check, Phone } from "lucide-react";
import { useScrollReveal } from "@/hooks/useScrollReveal";

const items = [
  {
    icon: ShieldCheck,
    title: "Secure Escrow",
    desc: "SafeDeal holds your payment until the buyer confirms the item matches what was agreed.",
    note: "100% secure",
    rightIcon: Check,
    tone: "primary" as const,
  },
  {
    icon: UserCheck,
    title: "Verified Sellers",
    desc: "Every seller is verified with email, phone, and identity checks before listing.",
    note: "100% verified",
    rightIcon: Check,
    tone: "success" as const,
  },
  {
    icon: MessageCircle,
    title: "24/7 Support",
    desc: "Get help with any transaction or issue through our dedicated support team.",
    note: "24/7 available",
    rightIcon: Phone,
    tone: "warning" as const,
  },
];

const toneMap = {
  primary: { wrap: "bg-primary/10", icon: "text-primary" },
  success: { wrap: "bg-success/10", icon: "text-success" },
  warning: { wrap: "bg-warning/10", icon: "text-warning" },
};

function TrustCard({ item }: { item: (typeof items)[number] }) {
  const ref = useScrollReveal<HTMLDivElement>();
  const t = toneMap[item.tone];
  return (
    <div
      ref={ref}
      className="group rounded-2xl border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-xl sm:p-6"
    >
      <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl ${t.wrap}`}>
        <item.icon className={`h-6 w-6 ${t.icon}`} />
      </div>
      <h3 className="mb-1.5 text-lg font-bold text-foreground">{item.title}</h3>
      <p className="mb-3.5 text-sm text-muted-foreground">{item.desc}</p>
      <div className="flex items-center justify-between border-t pt-3">
        <span className="text-xs font-semibold text-muted-foreground">{item.note}</span>
        <item.rightIcon className={`h-4 w-4 ${t.icon}`} />
      </div>
    </div>
  );
}

export function TrustSafetySection() {
  return (
    <section id="trust" className="section-y bg-muted/30">
      <div className="container-x mx-auto max-w-7xl">
        <div className="mb-8 text-center sm:mb-12">
          <h2 className="h-section mb-3 font-bold text-foreground">
            Trust & Safety
          </h2>
          <p className="body-lead mx-auto max-w-2xl text-muted-foreground">
            Your safety is our priority — at every step of the transaction.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 lg:gap-6">
          {items.map((item) => (
            <TrustCard key={item.title} item={item} />
          ))}
        </div>
      </div>
    </section>
  );
}
