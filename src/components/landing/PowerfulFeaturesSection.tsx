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
  type LucideIcon,
} from "lucide-react";
import { useScrollReveal } from "@/hooks/useScrollReveal";

type Tone = "primary" | "success" | "warning" | "danger";

const features: {
  icon: LucideIcon;
  title: string;
  desc: string;
  tone: Tone;
}[] = [
  {
    icon: ShoppingBag,
    title: "Protected Marketplace",
    desc: "Browse products from verified sellers with SafeDeal protection built in.",
    tone: "primary",
  },
  {
    icon: Link2,
    title: "Direct Deal Links",
    desc: "Create a protected transaction link for deals on WhatsApp, Instagram, or privately.",
    tone: "success",
  },
  {
    icon: ShieldCheck,
    title: "Funds Held Securely",
    desc: "Buyer payment stays protected until verification or a valid resolution.",
    tone: "primary",
  },
  {
    icon: Store,
    title: "Verified Seller Storefronts",
    desc: "Sellers build trust with verified profiles, ratings, and completed deals.",
    tone: "success",
  },
  {
    icon: Lock,
    title: "Locked Agreement",
    desc: "Item details, price, delivery terms, and evidence are locked after payment.",
    tone: "warning",
  },
  {
    icon: Truck,
    title: "Delivery Tracking",
    desc: "Track seller dispatch, courier details, delivery proof, and verification windows.",
    tone: "primary",
  },
  {
    icon: CircleCheck,
    title: "Buyer Confirmation",
    desc: "Funds release only after the buyer confirms the item matches the agreement.",
    tone: "success",
  },
  {
    icon: Camera,
    title: "Evidence Uploads",
    desc: "Photos, videos, receipts, and delivery proof are stored for dispute review.",
    tone: "warning",
  },
  {
    icon: Gavel,
    title: "Dispute Resolution",
    desc: "If something goes wrong, SafeDeal reviews evidence before funds are released.",
    tone: "danger",
  },
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

function FeatureCard({ f }: { f: (typeof features)[number] }) {
  const ref = useScrollReveal<HTMLDivElement>();
  const t = toneMap[f.tone];
  return (
    <div
      ref={ref}
      className="group rounded-2xl border bg-card p-6 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-xl sm:p-7"
    >
      <div
        className={`mb-5 flex h-14 w-14 items-center justify-center rounded-2xl transition-colors ${t.wrap} ${t.hover}`}
      >
        <f.icon className={`h-7 w-7 transition-colors ${t.icon} group-hover:text-current`} />
      </div>
      <h3 className="mb-2 text-lg font-bold text-foreground sm:text-xl">{f.title}</h3>
      <p className="text-sm text-muted-foreground sm:text-base">{f.desc}</p>
    </div>
  );
}

export function PowerfulFeaturesSection() {
  return (
    <section id="features" className="section-y bg-background">
      <div className="container-x mx-auto max-w-7xl">
        <div className="mb-10 text-center sm:mb-14">
          <h2 className="h-section mb-3 font-bold text-foreground">
            Powerful features for secure transactions
          </h2>
          <p className="body-lead mx-auto max-w-2xl text-muted-foreground">
            Everything buyers and sellers need to transact with confidence.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3 lg:gap-8">
          {features.map((f) => (
            <FeatureCard key={f.title} f={f} />
          ))}
        </div>
      </div>
    </section>
  );
}
