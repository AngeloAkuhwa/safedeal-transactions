import { Check, Clock, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

type Step = {
  label: string;
  done: boolean;
  icon: typeof Check;
};

interface TransactionConfirmationProgressProps {
  buyerConfirmedAt?: string | null;
  sellerConfirmedAt?: string | null;
  moneyStatus: string;
  className?: string;
}

/**
 * Shows the dual-confirmation handshake state so neither party reads
 * a "completed" status as "money has moved".
 *
 * - funds_held_in_escrow + buyer_confirmed_at + !seller_confirmed_at
 *     → Buyer Confirmed / Awaiting Seller / Funds Held
 * - funds_pending_release
 *     → Both Parties Confirmed / Awaiting Release / Funds Held
 */
export function TransactionConfirmationProgress({
  buyerConfirmedAt,
  sellerConfirmedAt,
  moneyStatus,
  className,
}: TransactionConfirmationProgressProps) {
  // Only render in the dual-confirmation window.
  const isAwaitingSeller =
    moneyStatus === "funds_held_in_escrow" && !!buyerConfirmedAt && !sellerConfirmedAt;
  const isPendingRelease = moneyStatus === "funds_pending_release";

  if (!isAwaitingSeller && !isPendingRelease) return null;

  const steps: Step[] = isAwaitingSeller
    ? [
        { label: "Buyer Confirmed", done: true, icon: Check },
        { label: "Awaiting Seller Confirmation", done: false, icon: Clock },
        { label: "Funds Held Securely", done: true, icon: Lock },
      ]
    : [
        { label: "Both Parties Confirmed", done: true, icon: Check },
        { label: "Awaiting Release", done: false, icon: Clock },
        { label: "Funds Held Securely", done: true, icon: Lock },
      ];

  return (
    <div
      className={cn(
        "rounded-2xl border-2 border-primary/20 bg-primary/5 p-4 sm:p-5",
        className,
      )}
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {steps.map((s) => {
          const Icon = s.icon;
          return (
            <div
              key={s.label}
              className="flex items-center gap-3 rounded-xl bg-card border border-border px-3 py-2.5"
            >
              <div
                className={cn(
                  "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                  s.done
                    ? "bg-primary/15 text-primary"
                    : "bg-warning/15 text-warning",
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
              <span className="text-sm font-semibold text-foreground leading-tight">
                {s.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}