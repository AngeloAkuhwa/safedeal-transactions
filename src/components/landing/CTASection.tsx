import { Link } from "react-router-dom";
import { ArrowRight, Clock, CreditCard, Headphones } from "lucide-react";
import { Button } from "@/components/ui/button";

const highlights = [
  { icon: Clock, value: "2 min", label: "Setup time" },
  { icon: CreditCard, value: "₦0", label: "Setup fees" },
  { icon: Headphones, value: "24/7", label: "Support" },
];

export function CTASection() {
  return (
    <section className="bg-primary py-14 sm:py-16">
      <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
        <h2 className="mb-2 text-2xl font-bold text-primary-foreground sm:text-3xl">
          Get Started Today
        </h2>
        <p className="mb-2 text-lg text-primary-foreground/90">
          Ready to transact with confidence?
        </p>
        <p className="mx-auto mb-8 max-w-xl text-sm text-primary-foreground/70">
          Join thousands of users who trust SafeDeal to protect their online transactions. No setup fees, instant protection.
        </p>
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button
            size="lg"
            variant="secondary"
            asChild
            className="gap-2"
          >
            <Link to="/auth?role=buyer">
              Start as Buyer
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button
            size="lg"
            variant="outline"
            asChild
            className="gap-2 border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10"
          >
            <Link to="/auth?role=seller">
              Start as Seller
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-8">
          {highlights.map((h) => (
            <div key={h.label} className="flex items-center gap-2 text-primary-foreground/90">
              <h.icon className="h-5 w-5" />
              <div className="text-left">
                <p className="text-sm font-bold">{h.value}</p>
                <p className="text-xs text-primary-foreground/70">{h.label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
