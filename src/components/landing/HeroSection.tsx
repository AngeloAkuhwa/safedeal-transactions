import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import { AnimatedTransactionCard } from "./AnimatedTransactionCard";

export function HeroSection() {
  return (
    <section className="section-y relative overflow-hidden bg-gradient-to-b from-primary/5 to-background">

      <div className="container-x relative mx-auto max-w-6xl">
        <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-10">
          {/* Left */}
          <div className="text-center lg:text-left">
            <p className="mb-3 animate-fade-in text-xs font-semibold text-muted-foreground">
              Live in Lagos 🇳🇬: more cities rolling out
            </p>

            <h1 className="h-display animate-fade-in mb-3 text-balance font-extrabold text-foreground">
              Clear terms for every <span className="text-primary">online deal.</span>
            </h1>

            <p className="body-lead animate-fade-in mx-auto mb-6 max-w-lg text-left text-muted-foreground sm:text-center lg:mx-0 lg:text-left [animation-delay:80ms]">
              SafeDeal holds the buyer&apos;s payment until the item is delivered and confirmed. So
              both sides can review the item, delivery, and payment terms. Free for sellers.
            </p>

            <div className="animate-fade-in [animation-delay:140ms]">
              <Link
                to="/auth?role=seller"
                style={{ minHeight: "48px" }}
                className="tap-press inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 text-base font-bold text-primary-foreground shadow-md transition-all hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-lg sm:w-auto"
              >
                <span>Open your free store</span>
              </Link>

              <div className="mt-3">
                <Link
                  to="/marketplace"
                  className="group inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground underline-offset-4 transition-colors hover:text-primary hover:underline min-h-11"
                >
                  I&apos;m buying: check a deal
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>
            </div>

            {/* Mobile / tablet: the same protected-deal card, scaled to fit */}
            <div className="relative mx-auto mt-8 w-full max-w-sm animate-fade-in [animation-delay:200ms] lg:hidden">
              <AnimatedTransactionCard />
            </div>
          </div>

          {/* Right: Animated transaction demo (desktop side-by-side) */}
          <div className="relative mx-auto hidden w-full max-w-sm animate-slide-in-right lg:block lg:mx-0 lg:ml-auto">
            <div aria-hidden className="absolute -bottom-4 -right-4 h-20 w-20 rounded-2xl bg-primary/10" />
            <AnimatedTransactionCard />
          </div>
        </div>
      </div>
    </section>
  );
}
