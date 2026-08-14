/**
 * Canonical buyer-facing pricing breakdown. Renders the 5 lines defined in
 * `BUYER_PRICING_ORDER`. Missing values render as `—` (never fake ₦0.00).
 *
 * Forbidden labels — see `FORBIDDEN_PRICING_LABELS` in payment-labels.ts —
 * MUST NEVER appear; do not add Delivery Fee / Shipping Fee / Platform
 * Processing Fee / Protection & Processing Fee / USD / $.
 */

import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  BUYER_PRICING_ORDER,
  PRICING_HELPER_COPY,
  PRICING_LINE_LABELS,
  type PricingLineKey,
} from "@/lib/payment/payment-labels";
import { formatMoneyOrDash } from "@/lib/payment/money-format";
import type { PricingSnapshotView } from "@/types/payment-flow.types";
import { cn } from "@/lib/utils";

type Audience = "buyer" | "seller-preview" | "admin";

interface Props {
  snapshot: PricingSnapshotView | null;
  audience?: Audience;
  className?: string;
}

export function PricingBreakdown({ snapshot, audience = "buyer", className }: Props) {
  const currency = snapshot?.currency ?? "NGN";

  const value = (key: PricingLineKey): number | null => {
    if (!snapshot) return null;
    const v = snapshot[key as keyof PricingSnapshotView];
    return typeof v === "number" ? v : null;
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div className={cn("space-y-2 text-sm", className)} data-audience={audience}>
        {BUYER_PRICING_ORDER.map((key) => {
          const isTotal = key === "total_amount";
          const helper = PRICING_HELPER_COPY[key];
          return (
            <div
              key={key}
              className={cn(
                "flex items-center justify-between gap-3",
                isTotal && "border-t pt-2 mt-2 font-semibold text-base",
              )}
            >
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className={cn(isTotal && "text-foreground")}>
                  {PRICING_LINE_LABELS[key]}
                </span>
                {helper ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex text-muted-foreground hover:text-foreground"
                        aria-label={`About ${PRICING_LINE_LABELS[key]}`}
                      >
                        <Info className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-xs">
                      {helper}
                    </TooltipContent>
                  </Tooltip>
                ) : null}
              </span>
              <span className={cn("tabular-nums", isTotal ? "text-foreground" : "text-foreground/90")}>
                {formatMoneyOrDash(value(key), currency)}
              </span>
            </div>
          );
        })}

        {snapshot?.is_estimate ? (
          <p className="text-xs text-muted-foreground pt-1">
            Final fees confirmed at checkout.
          </p>
        ) : snapshot?.is_total_service_fee_capped ? (
          <p className="text-xs text-muted-foreground pt-1">
            {snapshot.applied_cap
              ? `${PRICING_LINE_LABELS.service_fee_amount} capped at ${formatMoneyOrDash(
                  snapshot.applied_cap.amount,
                  currency,
                )}.`
              : `${PRICING_LINE_LABELS.service_fee_amount} capped for this transaction.`}
          </p>
        ) : null}
      </div>
    </TooltipProvider>
  );
}

export default PricingBreakdown;