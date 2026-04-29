import {
  ShoppingBag,
  Link2,
  ShieldCheck,
  Store,
  Lock,
  Truck,
  CircleCheck,
  Camera,
  Gavel,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { useScrollReveal } from "@/hooks/useScrollReveal";

type Tone = "primary" | "success" | "warning" | "danger";

interface Feature {
  icon: LucideIcon;
  title: string;
  line: string;
  tone: Tone;
}

const FEATURES: Feature[] = [
  { icon: ShoppingBag, title: "Protected Marketplace", line: "Every listing is escrow-backed.", tone: "primary" },
  { icon: Link2, title: "Direct Deal Links", line: "Share via WhatsApp or DMs.", tone: "success" },
  { icon: ShieldCheck, title: "Funds Held Securely", line: "Money locked until verified.", tone: "primary" },
  { icon: Store, title: "Verified Seller Storefronts", line: "Real, vetted sellers.", tone: "success" },
  { icon: Lock, title: "Locked Agreement", line: "Terms can't change after pay.", tone: "warning" },
  { icon: Truck, title: "Delivery Tracking", line: "Follow the item end-to-end.", tone: "primary" },
  { icon: CircleCheck, title: "Buyer Confirmation", line: "Funds release on approval.", tone: "success" },
  { icon: Camera, title: "Evidence Uploads", line: "Photos, receipts, proof.", tone: "warning" },
  { icon: Gavel, title: "Dispute Resolution", line: "Reviewed by SafeDeal team.", tone: "danger" },
];

const toneMap: Record<Tone, { wrap: string; icon: string; hover: string }> = {
  primary: {
    wrap: "bg-primary/10",
    icon: "text-primary",
    hover: "group-hover:bg-primary group-hover:text-primary-foreground",
  },
  success: {
    wrap: "bg-success/10",
    icon: "text-success",
    hover: "group-hover:bg-success group-hover:text-success-foreground",
  },
  warning: {
    wrap: "bg-warning/10",
    icon: "text-warning",
    hover: "group-hover:bg-warning group-hover:text-warning-foreground",
  },
  danger: {
    wrap: "bg-destructive/10",
    icon: "text-destructive",
    hover: "group-hover:bg-destructive group-hover:text-destructive-foreground",
  },
};

function FeatureCard({ f, index }: { f: Feature; index: number }) {
  const ref = useScrollReveal<HTMLDivElement>();
  const t = toneMap[f.tone];
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${index * 50}ms` }}
      className="group flex items-start gap-3 rounded-xl border bg-card p-3.5 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg sm:p-4"
    >
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-all duration-300 group-hover:scale-110 ${t.wrap} ${t.hover}`}
      >
        <f.icon className={`h-5 w-5 transition-colors ${t.icon} group-hover:text-current`} />
      </div>
      <div className="min-w-0">
        <h3 className="text-[14px] font-bold leading-tight text-foreground sm:text-[15px]">
          {f.title}
        </h3>
        <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{f.line}</p>
      </div>
    </div>
  );
}

export function PowerfulFeaturesSection() {
  return (
    <section id="features" className="section-y bg-muted/30">
      <div className="container-x mx-auto max-w-6xl">
        <div className="mb-5 text-center sm:mb-7">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-semibold text-primary">Features</span>
          </div>
          <h2 className="h-section mb-2 font-bold text-foreground">
            Powerful features for secure transactions
          </h2>
          <p className="body-lead mx-auto max-w-xl text-muted-foreground">
            Nine guarantees. Built into every deal.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 sm:gap-3.5 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <FeatureCard key={f.title} f={f} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
