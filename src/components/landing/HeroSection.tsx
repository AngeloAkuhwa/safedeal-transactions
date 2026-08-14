import { Link } from "react-router";
import { MapPin, Store, ArrowRight } from "lucide-react";
import { AnimatedTransactionCard } from "./AnimatedTransactionCard";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-primary/5 via-background to-success/5 py-8 sm:py-12 lg:py-16">
      {/* Decorative blobs */}
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-40">
        <div className="absolute -top-10 left-0 h-44 w-44 rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute -bottom-10 right-0 h-56 w-56 rounded-full bg-success/15 blur-3xl" />
      </div>

      <div className="container-x relative mx-auto max-w-6xl">
        <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-10">
          {/* Left */}
          <div className="text-center lg:text-left">
            <div className="mb-3 inline-flex animate-fade-in items-center gap-2 rounded-full border border-border bg-card px-3 py-1 shadow-sm">
              <MapPin className="h-4 w-4 text-success" />
              <span className="text-xs font-semibold text-foreground">
                Live in Lagos 🇳🇬 — more cities rolling out
              </span>
            </div>

            <h1 className="animate-fade-in mb-3 text-3xl font-extrabold leading-[1.08] tracking-tight text-foreground sm:text-4xl lg:text-5xl xl:text-[3.5rem]">
              Escrow for every <span className="text-primary">online deal.</span>
            </h1>

            <p className="animate-fade-in mx-auto mb-6 max-w-lg text-[15px] leading-relaxed text-muted-foreground lg:mx-0 [animation-delay:80ms]">
              SafeDeal holds the buyer&apos;s payment until the item is delivered and confirmed — so
              nobody has to trust a stranger. Free for verified sellers.
            </p>

            <div className="animate-fade-in [animation-delay:140ms]">
              <Link
                to="/auth?role=seller"
                style={{ minHeight: "48px" }}
                className="tap-press inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 text-base font-bold text-primary-foreground shadow-md transition-all hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-lg sm:w-auto"
              >
                <Store className="h-5 w-5" />
                <span>Open your free store</span>
              </Link>

              <div className="mt-3">
                <Link
                  to="/marketplace"
                  className="group inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground underline-offset-4 transition-colors hover:text-primary hover:underline"
                >
                  I&apos;m buying — check a deal
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>
            </div>

            {/* Mobile / tablet: the same protected-deal card, scaled to fit */}
            <div className="relative mx-auto mt-8 w-full max-w-sm animate-fade-in [animation-delay:200ms] lg:hidden">
              <AnimatedTransactionCard />
            </div>
          </div>

          {/* Right — Animated transaction demo (desktop side-by-side) */}
          <div className="relative mx-auto hidden w-full max-w-sm animate-slide-in-right lg:block lg:mx-0 lg:ml-auto">
            <div aria-hidden className="absolute -left-4 -top-4 h-16 w-16 rounded-2xl bg-success/15" />
            <div aria-hidden className="absolute -bottom-4 -right-4 h-20 w-20 rounded-2xl bg-primary/15" />
            <AnimatedTransactionCard />
          </div>
        </div>
      </div>
    </section>
  );
}
