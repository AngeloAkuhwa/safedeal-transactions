import { Link } from "react-router-dom";
import {
  Shield,
  CheckCircle,
  Store,
  Handshake,
  MapPin,
  Truck,
  CircleCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-primary/5 via-background to-success/5 py-14 sm:py-20 lg:py-24">
      {/* Decorative blobs */}
      <div className="pointer-events-none absolute inset-0 opacity-50">
        <div className="absolute -top-10 left-0 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-10 right-0 h-96 w-96 rounded-full bg-success/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-12">
          {/* Left */}
          <div className="text-center lg:text-left">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/80 px-4 py-1.5 shadow-sm backdrop-blur">
              <Shield className="h-4 w-4 text-success" />
              <span className="text-xs font-semibold text-foreground sm:text-sm">
                Trusted by 50,000+ users
              </span>
            </div>

            <h1 className="mb-5 text-4xl font-extrabold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              Buy safely.
              <br />
              <span className="text-primary">Sell confidently.</span>
            </h1>

            <p className="mx-auto mb-5 max-w-xl text-base text-muted-foreground sm:text-lg lg:mx-0">
              SafeDeal protects buyers and sellers from "what I ordered versus what I got"
              disputes. Funds are held until the buyer confirms the item matches the agreement.
            </p>

            <div className="mb-7 flex items-center justify-center gap-2 text-sm text-muted-foreground lg:justify-start">
              <MapPin className="h-4 w-4 text-primary" />
              <span>Currently available in Lagos, Nigeria — expanding soon</span>
            </div>

            {/* Three CTAs */}
            <div className="flex flex-col flex-wrap items-stretch justify-center gap-3 sm:flex-row sm:items-center lg:justify-start">
              <Button size="lg" asChild className="gap-2">
                <Link to="/marketplace">
                  <Store className="h-4 w-4" />
                  Browse Marketplace
                </Link>
              </Button>
              <Button
                size="lg"
                asChild
                className="gap-2 bg-success text-success-foreground hover:bg-success/90"
              >
                <Link to="/auth?role=seller">
                  <Shield className="h-4 w-4" />
                  Start Selling
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="gap-2 border-primary/40 text-primary hover:bg-primary/5">
                <Link to="/auth?role=seller&intent=create-transaction">
                  <Handshake className="h-4 w-4" />
                  Create Protected Transaction
                </Link>
              </Button>
            </div>

            <div className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground lg:justify-start">
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle className="h-4 w-4 text-success" />
                No setup fees
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle className="h-4 w-4 text-success" />
                Instant protection
              </span>
            </div>
          </div>

          {/* Right — Transaction preview card */}
          <div className="relative mx-auto w-full max-w-md lg:mx-0 lg:ml-auto">
            <div className="absolute -left-4 -top-4 h-20 w-20 rounded-2xl bg-success/15 lg:-left-6 lg:-top-6 lg:h-24 lg:w-24" />
            <div className="absolute -bottom-4 -right-4 h-24 w-24 rounded-2xl bg-primary/15 lg:-bottom-6 lg:-right-6 lg:h-28 lg:w-28" />

            <div className="relative rounded-2xl border bg-card p-5 shadow-2xl sm:p-6">
              <div className="mb-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                    <Shield className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Transaction #SD-4829</p>
                    <p className="text-xs text-muted-foreground">Protected by SafeDeal</p>
                  </div>
                </div>
                <span className="rounded-full bg-warning/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-warning">
                  Funds held
                </span>
              </div>

              <ul className="mb-5 space-y-3">
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success">
                    <CheckCircle className="h-3.5 w-3.5 text-success-foreground" />
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">Payment Received</p>
                    <p className="text-xs text-muted-foreground">₦850,000 held securely</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary">
                    <Truck className="h-3.5 w-3.5 text-primary-foreground" />
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">In Transit</p>
                    <p className="text-xs text-muted-foreground">Expected delivery: Dec 24</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
                    <CircleCheck className="h-3.5 w-3.5 text-muted-foreground" />
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-muted-foreground">Buyer Verification</p>
                    <p className="text-xs text-muted-foreground/70">Awaiting confirmation</p>
                  </div>
                </li>
              </ul>

              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3.5">
                <div className="flex items-start gap-3">
                  <Shield className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Your payment is protected</p>
                    <p className="text-xs text-muted-foreground">
                      Funds will only be released after you confirm the item matches what was agreed.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
