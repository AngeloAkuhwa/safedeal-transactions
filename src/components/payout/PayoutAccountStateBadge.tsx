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
    "border-success/30 bg-success/10 text-foreground hover:bg-success/15",
  warning:
    "border-warning/30 bg-warning/10 text-foreground hover:bg-warning/15",
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