/**
 * Single-line "Seller Payout" display. Reads from the canonical
 * PricingSnapshotView; renders `—` when missing.
 */

import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  PRICING_HELPER_COPY,
  PRICING_LINE_LABELS,
} from "@/lib/payment/payment-labels";
import { formatMoneyOrDash } from "@/lib/payment/money-format";
import type { PricingSnapshotView } from "@/types/payment-flow.types";
import { cn } from "@/lib/utils";

interface Props {
  snapshot: PricingSnapshotView | null;
  className?: string;
  /** Optional plain amount override when no full snapshot is available. */
  amount?: number | null;
  currency?: string;
}

export function SellerPayoutLine({ snapshot, amount, currency, className }: Props) {
  const value =
    typeof amount === "number"
      ? amount
      : snapshot?.seller_payout_amount ?? null;
  const c = currency ?? snapshot?.currency ?? "NGN";

  return (
    <TooltipProvider delayDuration={150}>
      <div className={cn("flex items-center justify-between gap-3 text-sm", className)}>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span>{PRICING_LINE_LABELS.seller_payout_amount}</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="inline-flex text-muted-foreground hover:text-foreground relative items-center justify-center before:absolute before:-inset-4 before:content-['']"
                aria-label="About Seller Payout"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">
              {PRICING_HELPER_COPY.seller_payout_amount}
            </TooltipContent>
          </Tooltip>
        </span>
        <span className="tabular-nums font-semibold text-foreground">
          {formatMoneyOrDash(value, c)}
        </span>
      </div>
    </TooltipProvider>
  );
}

export default SellerPayoutLine;