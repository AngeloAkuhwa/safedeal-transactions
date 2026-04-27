import { Link } from "react-router-dom";
import { Store, Link2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useScrollReveal } from "@/hooks/useScrollReveal";

const marketplacePerks = [
  "Browse thousands of protected listings",
  "Buy from verified seller storefronts",
  "Public listings — no signup needed to browse",
  "Cart, checkout and escrow built in",
];

const directPerks = [
  "Create a protected transaction in minutes",
  "Share via WhatsApp, Instagram, or DMs",
  "Buyer reviews terms before paying",
  "Funds held until buyer confirms delivery",
];

function FlowCard({
  variant,
  icon: Icon,
  title,
  desc,
  perks,
  cta,
  href,
}: {
  variant: "primary" | "success";
  icon: typeof Store;
  title: string;
  desc: string;
  perks: string[];
  cta: string;
  href: string;
}) {
  const ref = useScrollReveal<HTMLDivElement>();
  const wrap =
    variant === "primary"
      ? "border-primary/20 bg-gradient-to-br from-primary/5 via-card to-primary/10"
      : "border-success/20 bg-gradient-to-br from-success/5 via-card to-success/10";
  const iconWrap =
    variant === "primary"
      ? "bg-primary text-primary-foreground"
      : "bg-success text-success-foreground";
  const checkColor = variant === "primary" ? "text-primary" : "text-success";
  return (
    <div
      ref={ref}
      className={`flex flex-col rounded-2xl border-2 p-6 sm:p-8 ${wrap}`}
    >
      <div className="mb-5 flex items-center gap-3">
        <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${iconWrap}`}>
          <Icon className="h-6 w-6" />
        </div>
        <h3 className="text-xl font-bold text-foreground sm:text-2xl">{title}</h3>
      </div>
      <p className="mb-5 text-sm text-muted-foreground sm:text-base">{desc}</p>
      <ul className="mb-7 space-y-2.5">
        {perks.map((p) => (
          <li key={p} className="flex items-start gap-2.5 text-sm text-foreground sm:text-base">
            <Check className={`mt-0.5 h-4 w-4 shrink-0 ${checkColor}`} />
            <span>{p}</span>
          </li>
        ))}
      </ul>
      <Button
        asChild
        className={`mt-auto w-full ${
          variant === "primary"
            ? ""
            : "bg-success text-success-foreground hover:bg-success/90"
        }`}
        size="lg"
      >
        <Link to={href}>{cta}</Link>
      </Button>
    </div>
  );
}

export function MarketplaceVsDirectSection() {
  return (
    <section className="bg-background py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 text-center sm:mb-12">
          <h2 className="mb-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            Built for marketplace and direct deals
          </h2>
          <p className="mx-auto max-w-2xl text-base text-muted-foreground">
            Whether you shop publicly or close deals privately, every transaction is protected.
          </p>
        </div>

        <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-2">
          <FlowCard
            variant="primary"
            icon={Store}
            title="Marketplace Purchase"
            desc="Browse public listings from verified sellers and buy with one-click escrow protection."
            perks={marketplacePerks}
            cta="Browse Marketplace"
            href="/marketplace"
          />
          <FlowCard
            variant="success"
            icon={Link2}
            title="Direct Protected Deal"
            desc="Already negotiating on WhatsApp or Instagram? Lock the terms and protect the payment."
            perks={directPerks}
            cta="Create Protected Deal"
            href="/auth?role=seller&intent=create-transaction"
          />
        </div>
      </div>
    </section>
  );
}
