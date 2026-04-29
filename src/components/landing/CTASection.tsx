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
    <section className="section-y relative overflow-hidden bg-gradient-to-br from-primary via-primary to-success">
      {/* Decorative blurs */}
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-15">
        <div className="absolute left-0 top-0 h-96 w-96 rounded-full bg-primary-foreground blur-3xl" />
        <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-primary-foreground blur-3xl" />
      </div>

      <div className="container-x relative mx-auto max-w-5xl text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-primary-foreground/15 px-4 py-1.5 backdrop-blur">
          <Rocket className="h-4 w-4 text-primary-foreground" />
          <span className="text-xs font-semibold text-primary-foreground sm:text-sm">
            Get Started Today
          </span>
        </div>

        <h2 className="h-section mb-5 font-bold text-primary-foreground">
          Ready to shop or sell with protection?
        </h2>
        <p className="body-lead mx-auto mb-10 max-w-2xl text-primary-foreground/90">
          Browse public listings, buy from verified sellers, or create your own protected
          transaction in minutes.
        </p>

        <div className="mb-12 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
          <Link
            to="/marketplace"
            className="tap-target inline-flex items-center justify-center gap-2 rounded-xl bg-background px-7 py-4 text-base font-bold text-primary shadow-xl transition-all hover:-translate-y-0.5 hover:shadow-2xl"
          >
            <Store className="h-5 w-5" />
            Browse Marketplace
          </Link>
          <Link
            to="/auth?role=seller"
            className="tap-target inline-flex items-center justify-center gap-2 rounded-xl bg-success px-7 py-4 text-base font-bold text-success-foreground shadow-xl transition-all hover:-translate-y-0.5 hover:bg-success/90 hover:shadow-2xl"
          >
            <Shield className="h-5 w-5" />
            Start Selling
          </Link>
          <Link
            to="/auth?role=seller&intent=create-transaction"
            className="tap-target inline-flex items-center justify-center gap-2 rounded-xl border-2 border-primary-foreground/40 bg-primary-foreground/10 px-7 py-4 text-base font-bold text-primary-foreground shadow-xl backdrop-blur transition-all hover:-translate-y-0.5 hover:bg-primary-foreground/20"
          >
            <Handshake className="h-5 w-5" />
            Create Protected Transaction
          </Link>
        </div>

        <div className="mx-auto grid max-w-4xl gap-3 sm:grid-cols-3 sm:gap-4">
          {trustStats.map((stat) => (
            <div
              key={stat.label}
              className="flex items-center justify-center gap-2.5 rounded-xl border border-primary-foreground/20 bg-primary-foreground/10 px-4 py-3.5 backdrop-blur"
            >
              <stat.icon className="h-5 w-5 shrink-0 text-primary-foreground" />
              <span className="text-sm font-semibold text-primary-foreground">
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
