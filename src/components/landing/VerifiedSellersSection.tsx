import { Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { Shield, Star, MapPin, ArrowRight, BadgeCheck, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { DEMO_SELLERS, formatCount, type DemoSeller } from "./demo-data";

function RevealPulse({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || shown) return;
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShown(true);
            io.disconnect();
            break;
          }
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown]);
  return (
    <span ref={ref} className={`${className ?? ""} ${shown ? "sd-pulse-once" : ""}`}>
      {children}
    </span>
  );
}

function SellerCard({ seller, index }: { seller: DemoSeller; index: number }) {
  const ref = useScrollReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${index * 90}ms` }}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border bg-card transition-all duration-300 hover:-translate-y-1.5 hover:border-primary/40 hover:shadow-xl"
    >
      {/* Banner */}
      <div className={`h-10 bg-gradient-to-br ${seller.bannerGradient}`} />

      {/* Body */}
      <div className="-mt-6 flex flex-1 flex-col px-4 pb-4">
        {/* Avatar */}
        <div className="relative mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl border-4 border-card bg-card shadow-md">
          <div
            className={`flex h-full w-full items-center justify-center rounded-xl bg-gradient-to-br text-base font-bold text-primary-foreground ${seller.initialsGradient}`}
          >
            {seller.initials}
          </div>
        </div>

        {/* Name + verified pill */}
        <div className="mb-2.5 text-center">
          <h3 className="mb-1 truncate text-sm font-bold text-foreground">{seller.name}</h3>
          <RevealPulse className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">
            <BadgeCheck className="h-3 w-3" />
            Verified Seller
          </RevealPulse>
        </div>

        {/* Compact stats row — rating · deals · location */}
        <div className="mb-3 flex items-center justify-center gap-2.5 border-t pt-2.5 text-[11px] font-semibold">
          <span className="inline-flex items-center gap-1 text-warning">
            <Star className="h-3 w-3 fill-current" />
            {seller.rating}
          </span>
          <span className="h-3 w-px bg-border" />
          <span className="inline-flex items-center gap-1 text-foreground">
            <ShoppingBag className="h-3 w-3 text-primary" />
            {formatCount(seller.completed)}
          </span>
          <span className="h-3 w-px bg-border" />
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <MapPin className="h-3 w-3" />
            {seller.location}
          </span>
        </div>

        <Button asChild size="sm" className="mt-auto h-9 w-full text-[13px]">
          <Link to={`/store/${seller.slug}`}>
            View Store
            <ArrowRight className="ml-1 h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
          </Link>
        </Button>
      </div>
    </div>
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {DEMO_SELLERS.map((s, i) => (
            <SellerCard key={s.id} seller={s} index={i} />
          ))}
        </div>

        <div className="mt-6 text-center">
          <Button
            asChild
            variant="outline"
            className="group gap-2 rounded-xl border-2 px-5 py-2.5 text-sm font-semibold"
          >
            <Link to="/marketplace">
              View all verified sellers
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
