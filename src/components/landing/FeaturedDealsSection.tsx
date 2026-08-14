import { Shield, Lock, Truck, CircleCheck } from "lucide-react";
import { AnimatedTransactionCard } from "./AnimatedTransactionCard";
import { useScrollReveal } from "@/hooks/useScrollReveal";

const BULLETS = [
  {
    icon: Lock,
    title: "Money held safely",
    line: "The buyer pays SafeDeal, not the seller. Funds sit in escrow.",
    tone: "bg-primary/10 text-primary",
  },
  {
    icon: Truck,
    title: "Seller delivers",
    line: "The seller ships or hands over the item against locked terms.",
    tone: "bg-warning/10 text-warning",
  },
  {
    icon: CircleCheck,
    title: "Buyer confirms, funds released",
    line: "Once the buyer confirms the item matches, the seller gets paid.",
    tone: "bg-success/10 text-success",
  },
] as const;

export function FeaturedDealsSection() {
  const ref = useScrollReveal<HTMLDivElement>();

  return (
    <section id="protected-deal" className="bg-background py-10 sm:py-12 lg:py-14">
      <div className="container-x mx-auto max-w-4xl">
        <div className="mb-6 text-center sm:mb-10">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-success/20 bg-success/10 px-3 py-1">
            <Shield className="h-3.5 w-3.5 text-success" />
            <span className="text-xs font-semibold text-success">Escrow in action</span>
          </div>
          <h2 className="h-section mb-2 font-bold text-foreground">See a protected deal happen</h2>
          <p className="body-lead mx-auto max-w-xl text-muted-foreground">
            Every SafeDeal transaction follows the same protected path — from payment to payout.
          </p>
        </div>

        <div ref={ref} className="mx-auto w-full max-w-md">
          <AnimatedTransactionCard />
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {BULLETS.map((b) => (
            <div key={b.title} className="rounded-xl border bg-card p-4 shadow-sm">
              <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${b.tone}`}>
                <b.icon className="h-5 w-5" />
              </div>
              <h3 className="mb-1 text-sm font-bold text-foreground">{b.title}</h3>
              <p className="text-sm text-muted-foreground">{b.line}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
