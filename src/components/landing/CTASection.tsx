import { Link } from "react-router-dom";
import { Rocket, Store, Shield, Handshake, Lock, BadgeCheck, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";

const trustStats = [
  { icon: Lock, label: "Escrow protected payments" },
  { icon: BadgeCheck, label: "Verified seller storefronts" },
  { icon: Camera, label: "Evidence-backed dispute support" },
];

export function CTASection() {
  return (
    <section className="relative overflow-hidden bg-primary py-16 sm:py-20">
      {/* Decorative blurs */}
      <div className="pointer-events-none absolute inset-0 opacity-20">
        <div className="absolute left-0 top-0 h-96 w-96 rounded-full bg-primary-foreground/40 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-success/40 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-primary-foreground/15 px-4 py-1.5 backdrop-blur">
          <Rocket className="h-4 w-4 text-primary-foreground" />
          <span className="text-xs font-semibold text-primary-foreground sm:text-sm">
            Get Started Today
          </span>
        </div>

        <h2 className="mb-4 text-3xl font-bold text-primary-foreground sm:text-4xl lg:text-5xl">
          Ready to shop or sell with protection?
        </h2>
        <p className="mx-auto mb-10 max-w-2xl text-base text-primary-foreground/85 sm:text-lg">
          Browse public listings, buy from verified sellers, or create your own protected
          transaction in minutes.
        </p>

        <div className="mb-12 flex flex-col flex-wrap items-stretch justify-center gap-3 sm:flex-row sm:items-center">
          <Button
            size="lg"
            variant="secondary"
            asChild
            className="gap-2 shadow-lg"
          >
            <Link to="/marketplace">
              <Store className="h-4 w-4" />
              Browse Marketplace
            </Link>
          </Button>
          <Button
            size="lg"
            asChild
            className="gap-2 bg-success text-success-foreground shadow-lg hover:bg-success/90"
          >
            <Link to="/auth?role=seller">
              <Shield className="h-4 w-4" />
              Start Selling
            </Link>
          </Button>
          <Button
            size="lg"
            variant="outline"
            asChild
            className="gap-2 border-primary-foreground/40 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
          >
            <Link to="/auth?role=seller&intent=create-transaction">
              <Handshake className="h-4 w-4" />
              Create Protected Transaction
            </Link>
          </Button>
        </div>

        <div className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-3">
          {trustStats.map((stat) => (
            <div
              key={stat.label}
              className="flex items-center justify-center gap-2.5 rounded-xl border border-primary-foreground/20 bg-primary-foreground/10 px-4 py-3 backdrop-blur"
            >
              <stat.icon className="h-4 w-4 shrink-0 text-primary-foreground" />
              <span className="text-sm font-medium text-primary-foreground">
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
