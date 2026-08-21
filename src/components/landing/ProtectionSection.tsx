import {
  AlertTriangle,
  Camera,
  Scale,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import { SnapCarousel } from "@/components/ui/snap-carousel";

const DISPUTE_PROMISE: { icon: LucideIcon; title: string; line: string }[] = [
  {
    icon: Camera,
    title: "Evidence, not opinions",
    line: "Both sides upload photos, video and delivery proof against the locked terms.",
  },
  {
    icon: Scale,
    title: "Reviewed before any payout",
    line: "While a dispute is open, the money stays in escrow. Nothing is released.",
  },
  {
    icon: ShieldAlert,
    title: "A real way out",
    line: "Outcomes are refund, release, or partial resolution. Recorded on the transaction.",
  },
];

export function ProtectionSection() {
  return (
    <section id="protection" className="section-y bg-background">
      <div className="container-x mx-auto max-w-5xl">
        <div className="mb-5 text-center sm:mb-8">
          <h2 className="h-section mb-2 font-bold text-foreground">
            Payment follows the recorded transaction outcome
          </h2>
          <p className="body-lead mx-auto max-w-xl text-left text-muted-foreground sm:text-center">
            You pay SafeDeal, not the seller. The money only moves when the item checks out.
          </p>
        </div>

        {/* Dispute promise */}
        <SnapCarousel
          ariaLabel="How SafeDeal handles disputes"
          trackClassName="sm:grid-cols-3"
        >
          {DISPUTE_PROMISE.map((d) => (
            <div
              key={d.title}
              className="tap-press flex h-full flex-col rounded-2xl border bg-card p-4 shadow-sm transition-shadow duration-300 hover:shadow-lg sm:p-5"
            >
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <d.icon className="h-5 w-5" />
              </div>
              <h3 className="mb-1.5 text-base font-bold text-foreground">{d.title}</h3>
              <p className="text-sm text-muted-foreground">{d.line}</p>
            </div>
          ))}
        </SnapCarousel>

        <div className="mx-auto mt-6 max-w-3xl rounded-2xl border border-destructive/30 bg-destructive/5 p-4 sm:mt-8">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <p className="text-sm font-semibold text-foreground">
              Do not pay outside SafeDeal. Outside payments are not part of the recorded transaction.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
