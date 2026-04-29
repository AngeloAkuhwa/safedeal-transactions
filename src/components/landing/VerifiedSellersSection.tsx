import { Link } from "react-router-dom";
import { Shield, Star, MapPin, CheckCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { DEMO_SELLERS, formatCount, type DemoSeller } from "./demo-data";

function SellerCard({ seller }: { seller: DemoSeller }) {
  const ref = useScrollReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className="group flex flex-col overflow-hidden rounded-2xl border-2 bg-card transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-2xl"
    >
      <div className={`h-24 bg-gradient-to-br ${seller.bannerGradient}`} />
      <div className="-mt-12 px-6 pb-6">
        <div className="relative mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-card bg-card shadow-md">
          <div
            className={`flex h-full w-full items-center justify-center rounded-xl bg-gradient-to-br text-lg font-bold text-primary-foreground ${seller.initialsGradient}`}
          >
            {seller.initials}
          </div>
          <span className="absolute -bottom-1.5 -right-1.5 flex h-8 w-8 items-center justify-center rounded-xl border-4 border-card bg-primary shadow-md">
            <CheckCircle className="h-3.5 w-3.5 text-primary-foreground" />
          </span>
        </div>

        <div className="mb-5 text-center">
          <h3 className="mb-2 text-base font-bold text-foreground sm:text-lg">{seller.name}</h3>
          <span className="inline-flex items-center gap-1.5 rounded-xl border border-success/30 bg-success/10 px-3 py-1 text-xs font-semibold text-success">
            <Shield className="h-3 w-3" />
            Verified Seller
          </span>
        </div>

        <div className="mb-5 space-y-2.5 border-t pt-4 text-sm">
          <Row label="Rating">
            <div className="flex items-center gap-1.5">
              <Star className="h-3.5 w-3.5 fill-warning text-warning" />
              <span className="font-bold text-foreground">{seller.rating}</span>
            </div>
          </Row>
          <Row label="Completed">
            <span className="font-bold text-foreground">{formatCount(seller.completed)}</span>
          </Row>
          <Row label="Products">
            <span className="font-bold text-foreground">{formatCount(seller.products)}</span>
          </Row>
          <Row label="Location">
            <span className="inline-flex items-center gap-1 font-semibold text-foreground">
              <MapPin className="h-3 w-3 text-muted-foreground" />
              {seller.location}
            </span>
          </Row>
        </div>

        <Button asChild className="w-full">
          <Link to={`/store/${seller.slug}`}>View Store</Link>
        </Button>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

export function VerifiedSellersSection() {
  return (
    <section id="verified-sellers" className="section-y bg-background">
      <div className="container-x mx-auto max-w-7xl">
        <div className="mb-10 text-center sm:mb-14">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-success/20 bg-success/10 px-4 py-1.5">
            <Shield className="h-3.5 w-3.5 text-success" />
            <span className="text-xs font-semibold text-success">Trusted Sellers</span>
          </div>
          <h2 className="h-section mb-3 font-bold text-foreground">
            Shop from verified sellers
          </h2>
          <p className="body-lead mx-auto max-w-2xl text-muted-foreground">
            Buy from sellers with verified profiles, strong ratings, and completed deals.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4 lg:gap-8">
          {DEMO_SELLERS.map((s) => (
            <SellerCard key={s.id} seller={s} />
          ))}
        </div>

        <div className="mt-10 text-center sm:mt-12">
          <Button asChild variant="outline" size="lg" className="tap-target gap-2 rounded-xl border-2 px-8 font-semibold">
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
