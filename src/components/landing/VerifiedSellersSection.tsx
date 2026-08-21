import { Link } from "react-router";
import { Share2, Store, Globe2, Shield, BadgeCheck, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { SnapCarousel } from "@/components/ui/snap-carousel";

const AUDIENCES = [
  {
    icon: Share2,
    title: "Social sellers",
    line: "Selling through Instagram, WhatsApp, TikTok or Facebook? Send a SafeDeal checkout link instead of your account number.",
    tone: "bg-muted text-muted-foreground",
  },
  {
    icon: Store,
    title: "Independent stores",
    line: "No website? Get a free SafeDeal storefront to list your products.",
    tone: "bg-muted text-muted-foreground",
  },
  {
    icon: Globe2,
    title: "Marketplace & cross-border sellers",
    line: "Dealing with buyers you've never met? Record the item, payment, and delivery terms before checkout.",
    tone: "bg-muted text-muted-foreground",
  },
] as const;

function AudienceCard({ item, index }: { item: (typeof AUDIENCES)[number]; index: number }) {
  const ref = useScrollReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${index * 90}ms` }}
      className="tap-press flex h-full flex-col rounded-2xl border bg-card p-4 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg sm:p-5"
    >
      <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl ${item.tone}`}>
        <item.icon className="h-5 w-5" />
      </div>
      <h3 className="mb-1.5 text-base font-bold text-foreground">{item.title}</h3>
      <p className="text-sm text-muted-foreground">{item.line}</p>
    </div>
  );
}

export function VerifiedSellersSection() {
  return (
    <section id="for-sellers" className="section-y bg-background">
      <div className="container-x mx-auto max-w-6xl">
        <div className="mb-5 text-center sm:mb-10">
          <h2 className="h-section mb-2 font-bold text-foreground">
            Built for anyone who sells online
          </h2>
          <p className="body-lead mx-auto max-w-xl text-left text-muted-foreground sm:text-center">
            If your customers find you in DMs, SafeDeal gives both sides one place to record and close the deal.
          </p>
          <p className="mx-auto mt-3 max-w-xl text-left text-sm font-semibold text-foreground sm:text-center">
            Your own store link, free forever. We only earn when you get paid.
          </p>
        </div>

        <SnapCarousel ariaLabel="Who SafeDeal is built for" trackClassName="sm:grid-cols-3">
          {AUDIENCES.map((a, i) => (
            <AudienceCard key={a.title} item={a} index={i} />
          ))}
        </SnapCarousel>

        {/* Truthful trust strip: no invented numbers */}
        <div className="mt-6 rounded-2xl border bg-muted/40 p-4 sm:mt-8">
          <ul className="flex flex-col items-start justify-center gap-2 text-left text-sm font-semibold text-muted-foreground sm:flex-row sm:items-center sm:gap-5 sm:text-center">
            <li className="inline-flex items-center gap-1.5">
              <Lock className="h-4 w-4 text-muted-foreground" />
              Payments secured by Paystack
            </li>
            <li aria-hidden className="hidden h-3 w-px bg-border sm:block" />
            <li className="inline-flex items-center gap-1.5">
              <Shield className="h-4 w-4 text-muted-foreground" />
              Payment release follows recorded transaction states
            </li>
            <li aria-hidden className="hidden h-3 w-px bg-border sm:block" />
            <li className="inline-flex items-center gap-1.5">
              <BadgeCheck className="h-4 w-4 text-muted-foreground" />
              Seller identity status shown where available
            </li>
          </ul>
        </div>

        <div className="mt-6 text-center">
          <Button
            asChild
            variant="outline"
            className="tap-press group h-12 w-full gap-2 rounded-xl border-2 px-5 text-sm font-semibold sm:h-11 sm:w-auto"
          >
            <Link to="/auth?role=seller">
              Open your free store
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
