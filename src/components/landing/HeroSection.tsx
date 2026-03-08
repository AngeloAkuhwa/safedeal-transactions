import { Link } from "react-router-dom";
import { Shield, CheckCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-background py-16 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          {/* Left */}
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
              <Shield className="h-4 w-4" />
              Trusted by 50,000+ users
            </div>
            <h1 className="mb-4 text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              Buy safely.{" "}
              <span className="text-primary">Sell confidently.</span>
            </h1>
            <p className="mb-8 max-w-lg text-lg text-muted-foreground">
              SafeDeal protects buyers and sellers from "what I ordered versus what I got" disputes. Funds are held until the buyer confirms the item matches the agreement.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button size="lg" asChild className="gap-2">
                <Link to="/auth?role=buyer">
                  Start as Buyer
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="gap-2">
                <Link to="/auth?role=seller">
                  Start as Seller
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
            <div className="mt-6 flex flex-wrap gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <CheckCircle className="h-4 w-4 text-success" />
                No setup fees
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle className="h-4 w-4 text-success" />
                Instant protection
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle className="h-4 w-4 text-success" />
                Lagos, Nigeria
              </span>
            </div>
          </div>

          {/* Right — Transaction card mockup */}
          <div className="flex justify-center lg:justify-end">
            <div className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Transaction Preview</span>
                <span className="rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-semibold text-success">
                  Protected
                </span>
              </div>
              <div className="mb-4 space-y-3">
                <div className="rounded-lg bg-muted p-3">
                  <p className="text-xs text-muted-foreground">Item</p>
                  <p className="text-sm font-medium text-foreground">iPhone 15 Pro Max</p>
                </div>
                <div className="flex gap-3">
                  <div className="flex-1 rounded-lg bg-muted p-3">
                    <p className="text-xs text-muted-foreground">Amount</p>
                    <p className="text-sm font-bold text-foreground">₦850,000</p>
                  </div>
                  <div className="flex-1 rounded-lg bg-muted p-3">
                    <p className="text-xs text-muted-foreground">Status</p>
                    <p className="text-sm font-semibold text-primary">Funds Held</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
                <Shield className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-xs font-semibold text-foreground">Payment Protected</p>
                  <p className="text-xs text-muted-foreground">Funds held until buyer confirms delivery</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
