import { UserCheck, Lock, Shield, Camera } from "lucide-react";

const items = [
  {
    icon: UserCheck,
    title: "Verified Sellers",
    description:
      "Shop from sellers with email, phone, and identity checks. Every storefront is reviewed before going live.",
    accent: "primary",
  },
  {
    icon: Lock,
    title: "Locked Agreement",
    description:
      "Product details, price, and delivery terms are locked after payment. Sellers cannot change what was agreed.",
    accent: "success",
  },
  {
    icon: Shield,
    title: "Escrow Protection",
    description:
      "Your money stays protected until you confirm the item matches. No early release, no surprises.",
    accent: "warning",
  },
  {
    icon: Camera,
    title: "Evidence-Based Disputes",
    description:
      "If something goes wrong, both sides can submit evidence for review. Our team ensures fair outcomes.",
    accent: "primary",
  },
] as const;

const accentClasses: Record<string, string> = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
};

export function BuyerTrustSection() {
  return (
    <section className="bg-muted/40 py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 text-center sm:mb-12">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-success/10 px-4 py-1.5">
            <Shield className="h-3.5 w-3.5 text-success" />
            <span className="text-xs font-semibold text-success">Buyer Protection</span>
          </div>
          <h2 className="mb-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Why buyers trust SafeDeal Marketplace
          </h2>
          <p className="mx-auto max-w-2xl text-sm text-muted-foreground sm:text-base">
            Paying directly to a seller means losing control. SafeDeal keeps your money safe until
            you're satisfied.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item) => (
            <div
              key={item.title}
              className="rounded-xl border bg-card p-6 transition-all hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div
                className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl ${accentClasses[item.accent]}`}
              >
                <item.icon className="h-6 w-6" />
              </div>
              <h3 className="mb-2 text-base font-bold text-foreground">{item.title}</h3>
              <p className="text-sm text-muted-foreground">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}