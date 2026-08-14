import { Link } from "react-router";
import { Rocket, Store, Shield, Handshake, Lock, BadgeCheck, Camera } from "lucide-react";
import { useScrollReveal } from "@/hooks/useScrollReveal";

const trustStats = [
  { icon: Lock, label: "Escrow protected payments" },
  { icon: BadgeCheck, label: "Verified seller storefronts" },
  { icon: Camera, label: "Evidence-backed dispute support" },
];

export function CTASection() {
  const ref = useScrollReveal<HTMLDivElement>();

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-primary via-primary to-success py-8 sm:py-12 lg:py-16">
      {/* Subtle animated gradient drift */}
      <style>{`
        @keyframes sd-cta-drift {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
          50%      { transform: translate3d(20px, -14px, 0) scale(1.08); }
        }
        @keyframes sd-cta-drift-2 {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
          50%      { transform: translate3d(-22px, 16px, 0) scale(1.1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .sd-cta-blur { animation: none !important; }
        }
      `}</style>
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.12]">
        <div
          className="sd-cta-blur absolute left-0 top-0 h-56 w-56 rounded-full bg-primary-foreground blur-3xl"
          style={{ animation: "sd-cta-drift 14s ease-in-out infinite" }}
        />
        <div
          className="sd-cta-blur absolute bottom-0 right-0 h-56 w-56 rounded-full bg-primary-foreground blur-3xl"
          style={{ animation: "sd-cta-drift-2 16s ease-in-out infinite" }}
        />
      </div>

      <div ref={ref} className="container-x relative mx-auto max-w-4xl text-center">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary-foreground/15 px-3 py-1 backdrop-blur">
          <Rocket className="h-3.5 w-3.5 text-primary-foreground" />
          <span className="text-xs font-semibold text-primary-foreground">
            Get Started Today
          </span>
        </div>

        <h2 className="h-section mb-2 font-bold text-primary-foreground">
          Ready to shop or sell with protection?
        </h2>
        <p className="body-lead mx-auto mb-5 max-w-xl text-primary-foreground/90">
          Browse protected listings or create your own deal in minutes.
        </p>

        <div className="mb-6 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:justify-center sm:gap-3">
          <Link
            to="/marketplace"
            className="tap-press inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-background px-4 text-sm font-bold text-primary shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl sm:h-11 sm:w-auto"
          >
            <Store className="h-4 w-4" />
            Browse Marketplace
          </Link>
          <Link
            to="/auth?role=seller"
            className="tap-press inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-success px-4 text-sm font-bold text-success-foreground shadow-lg transition-all hover:-translate-y-0.5 hover:bg-success/90 hover:shadow-xl sm:h-11 sm:w-auto"
          >
            <Shield className="h-4 w-4" />
            Start Selling
          </Link>
          <Link
            to="/auth?role=seller&intent=create-transaction"
            className="tap-press inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-primary-foreground/40 bg-primary-foreground/10 px-4 text-sm font-bold text-primary-foreground shadow-lg backdrop-blur transition-all hover:-translate-y-0.5 hover:bg-primary-foreground/20 sm:h-11 sm:w-auto"
          >
            <Handshake className="h-4 w-4" />
            Create Protected Transaction
          </Link>
        </div>

        <div className="mx-auto grid max-w-4xl gap-2.5 sm:grid-cols-3 sm:gap-3">
          {trustStats.map((stat, i) => (
            <ChipReveal key={stat.label} index={i}>
              <stat.icon className="h-4 w-4 shrink-0 text-primary-foreground" />
              <span className="text-xs font-semibold text-primary-foreground">
                {stat.label}
              </span>
            </ChipReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function ChipReveal({ children, index }: { children: React.ReactNode; index: number }) {
  const ref = useScrollReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${index * 110}ms` }}
      className="flex items-center justify-center gap-2 rounded-xl border border-primary-foreground/20 bg-primary-foreground/10 px-3 py-2.5 backdrop-blur"
    >
      {children}
    </div>
  );
}
