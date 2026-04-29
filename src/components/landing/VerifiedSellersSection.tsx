import { Link } from "react-router-dom";
import { Shield, Star, MapPin, CheckCircle, ArrowRight, BadgeCheck, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { DEMO_SELLERS, formatCount, type DemoSeller } from "./demo-data";

function SellerCard({ seller, index }: { seller: DemoSeller; index: number }) {
  const ref = useScrollReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${index * 90}ms` }}
      className="group flex flex-col overflow-hidden rounded-2xl border-2 bg-card transition-all duration-300 hover:-translate-y-1.5 hover:border-primary/40 hover:shadow-2xl"
    >
      {/* Banner */}
      <div className={`h-12 bg-gradient-to-br sm:h-14 ${seller.bannerGradient}`} />

      {/* Avatar + verified */}
      <div className="-mt-7 px-4 pb-4">
        <div className="relative mx-auto mb-2.5 flex h-14 w-14 items-center justify-center rounded-2xl border-4 border-card bg-card shadow-md">
          <div
            className={`flex h-full w-full items-center justify-center rounded-xl bg-gradient-to-br text-base font-bold text-primary-foreground ${seller.initialsGradient}`}
          >
            {seller.initials}
          </div>
          <span
            className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-lg border-[3px] border-card bg-primary shadow-md animate-fade-in"
            style={{ animationDelay: `${index * 90 + 250}ms`, animationFillMode: "both" }}
            title="Verified"
          >
            <CheckCircle className="h-3 w-3 text-primary-foreground" />
          </span>
        </div>

        {/* Name + verified pill */}
        <div className="mb-2.5 text-center">
          <h3 className="mb-1 text-sm font-bold text-foreground">{seller.name}</h3>
          <span
            className="inline-flex items-center gap-1.5 rounded-xl border border-success/30 bg-success/10 px-2.5 py-0.5 text-[11px] font-semibold text-success animate-pulse [animation-iteration-count:2] [animation-duration:1.4s]"
          >
            <BadgeCheck className="h-3 w-3" />
            Verified
          </span>
        </div>

        {/* Visual stat pills */}
        <div className="mb-3 flex flex-wrap items-center justify-center gap-1.5 border-t pt-2.5">
          <Pill tone="warning" icon={Star} label={seller.rating.toString()} />
          <Pill
            tone="primary"
            icon={ShoppingBag}
            label={`${formatCount(seller.completed)} deals`}
          />
          <Pill tone="muted" icon={MapPin} label={seller.location} />
        </div>

        {/* Trusted seller badge */}
        <div className="mb-3 flex justify-center">
          <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary">
            <Shield className="h-3 w-3" />
            Trusted Seller
          </span>
        </div>

        <Button asChild size="sm" className="h-9 w-full text-[13px]">
          <Link to={`/store/${seller.slug}`}>
            View Store
            <ArrowRight className="ml-1 h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

function Pill({
  tone,
  icon: Icon,
  label,
}: {
  tone: "warning" | "primary" | "muted";
  icon: typeof Star;
  label: string;
}) {
  const styles = {
    warning: "border-warning/30 bg-warning/10 text-warning",
    primary: "border-primary/30 bg-primary/10 text-primary",
    muted: "border-border bg-muted text-foreground",
  }[tone];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${styles}`}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

export function VerifiedSellersSection() {
  return (
    <section id="verified-sellers" className="bg-background py-10 sm:py-12 lg:py-14">
      <div className="container-x mx-auto max-w-6xl">
        <div className="mb-6 text-center sm:mb-10">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-success/20 bg-success/10 px-3 py-1">
            <Shield className="h-3.5 w-3.5 text-success" />
            <span className="text-xs font-semibold text-success">Trusted Sellers</span>
          </div>
          <h2 className="h-section mb-2 font-bold text-foreground">Shop from verified sellers</h2>
          <p className="body-lead mx-auto max-w-xl text-muted-foreground">
            Verified profiles. Real ratings. Completed deals.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4 lg:gap-4">
          {DEMO_SELLERS.map((s, i) => (
            <SellerCard key={s.id} seller={s} index={i} />
          ))}
        </div>

        <div className="mt-6 text-center">
          <Button
            asChild
            variant="outline"
            className="gap-2 rounded-xl border-2 px-5 py-2.5 text-sm font-semibold"
          >
            <Link to="/marketplace">
              View all verified sellers
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
