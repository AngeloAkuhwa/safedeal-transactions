/**
 * Canonical payout-account readiness badge. Maps the 4 `PayoutAccountState`
 * values from the `v_payout_account_state` DB view to a single badge so
 * seller and admin surfaces look identical for the same seller.
 */

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PayoutAccountState } from "@/types/payment-flow.types";

interface Props {
  state: PayoutAccountState | null | undefined;
  className?: string;
}

const COPY: Record<
  PayoutAccountState,
  { label: string; tone: "success" | "warning" | "muted"; explainer: string }
> = {
  verified_ready: {
    label: "Payout Ready",
    tone: "success",
    explainer: "Verified bank account with active transfer recipient.",
  },
  verified_no_recipient: {
    label: "Finish Payout Setup",
    tone: "warning",
    explainer: "Account verified but transfer recipient is missing.",
  },
  unverified: {
    label: "Account Unverified",
    tone: "warning",
    explainer: "Bank account has not been verified.",
  },
  no_account: {
    label: "No Payout Account",
    tone: "muted",
    explainer: "Seller has not added a payout account yet.",
  },
};

const TONE_CLASS: Record<"success" | "warning" | "muted", string> = {
  success:
    "bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100",
  warning:
    "bg-amber-100 text-amber-900 border-amber-200 hover:bg-amber-100",
  muted:
    "bg-muted text-muted-foreground border-border hover:bg-muted",
};

export function PayoutAccountStateBadge({ state, className }: Props) {
  const key: PayoutAccountState = state ?? "no_account";
  const meta = COPY[key];
  return (
    <Badge
      variant="outline"
      className={cn(TONE_CLASS[meta.tone], "font-medium", className)}
      title={meta.explainer}
      aria-label={`${meta.label}: ${meta.explainer}`}
    >
      {meta.label}
    </Badge>
  );
}

export function payoutAccountStateExplainer(
  state: PayoutAccountState | null | undefined,
): string {
  return COPY[state ?? "no_account"].explainer;
}

export default PayoutAccountStateBadge;