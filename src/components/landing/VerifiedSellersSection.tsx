import { Link } from "react-router";
import { Instagram, Briefcase, Store, Shield, ArrowRight, BadgeCheck, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useScrollReveal } from "@/hooks/useScrollReveal";

const AUDIENCES = [
  {
    icon: Instagram,
    title: "Instagram & WhatsApp vendors",
    line: "Selling through DMs and status updates? Send a protected link instead of your account number.",
    tone: "bg-primary/10 text-primary",
  },
  {
    icon: Briefcase,
    title: "Side hustlers",
    line: "Building a business after work hours. Take payments safely without a website or storefront rent.",
    tone: "bg-warning/10 text-warning",
  },
  {
    icon: Store,
    title: "Small shops",
    line: "Serving walk-in and online customers. Give remote buyers a reason to trust you before they pay.",
    tone: "bg-success/10 text-success",
  },
] as const;

function AudienceCard({ item, index }: { item: (typeof AUDIENCES)[number]; index: number }) {
  const ref = useScrollReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${index * 90}ms` }}
      className="flex h-full flex-col rounded-2xl border bg-card p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg"
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
    <section id="built-for-lagos" className="bg-background py-12 sm:py-16">
      <div className="container-x mx-auto max-w-6xl">
        <div className="mb-6 text-center sm:mb-10">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-success/20 bg-success/10 px-3 py-1">
            <Shield className="h-4 w-4 text-success" />
            <span className="text-xs font-semibold text-success">For sellers</span>
          </div>
          <h2 className="h-section mb-2 font-bold text-foreground">Built for Lagos vendors</h2>
          <p className="body-lead mx-auto max-w-xl text-muted-foreground">
            If your customers find you in DMs, SafeDeal gives both sides a safe way to close the deal.
          </p>
          <p className="mx-auto mt-3 max-w-xl text-sm font-semibold text-foreground">
            Your own store link, free forever — we only earn when you get paid.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {AUDIENCES.map((a, i) => (
            <AudienceCard key={a.title} item={a} index={i} />
          ))}
        </div>

        {/* Truthful trust strip — no invented numbers */}
        <div className="mt-8 rounded-2xl border bg-muted/40 p-4">
          <ul className="flex flex-col items-center justify-center gap-2 text-center text-sm font-semibold text-muted-foreground sm:flex-row sm:gap-5">
            <li className="inline-flex items-center gap-1.5">
              <Lock className="h-4 w-4 text-primary" />
              Payments secured by Paystack
            </li>
            <li aria-hidden className="hidden h-3 w-px bg-border sm:block" />
            <li className="inline-flex items-center gap-1.5">
              <Shield className="h-4 w-4 text-warning" />
              Funds held in secure escrow
            </li>
            <li aria-hidden className="hidden h-3 w-px bg-border sm:block" />
            <li className="inline-flex items-center gap-1.5">
              <BadgeCheck className="h-4 w-4 text-success" />
              Verified sellers only
            </li>
          </ul>
        </div>

        <div className="mt-6 text-center">
          <Button
            asChild
            variant="outline"
            className="group gap-2 rounded-xl border-2 px-5 py-2.5 text-sm font-semibold"
          >
            <Link to="/auth?role=seller">
              Open your free store
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
