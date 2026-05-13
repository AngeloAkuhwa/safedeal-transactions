import { Scale, Clock, Hourglass, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { resolveDisputeLabel, TONE_CLASSNAMES, type Tone } from "@/lib/status-labels";
import {
  deriveDisputeDisplay,
  type DisputeOutcomeInput,
  type DisputeDisplayTone,
} from "@/lib/dispute-display-status";

interface DisputeStatusBadgeProps {
  status: string;
  audience?: "seller" | "buyer";
  /** When provided + status is "resolved", render the derived outcome label. */
  outcome?: DisputeOutcomeInput | null;
  moneyStatus?: string | null;
  escrow?: { heldAmount?: number | null; frozenAmount?: number | null } | null;
}

const ICON_BY_STATUS: Record<string, typeof Scale> = {
  open: Scale,
  awaiting_seller_response: Clock,
  awaiting_buyer_response: Clock,
  seller_response_pending: Clock,
  under_review: Hourglass,
  resolved: CheckCircle,
  resolved_buyer_refund: CheckCircle,
  resolved_seller_release: CheckCircle,
  resolved_partial: CheckCircle,
  withdrawn: CheckCircle,
  closed: CheckCircle,
};

const DISPLAY_TONE_TO_TONE: Record<DisputeDisplayTone, Tone> = {
  neutral: "muted",
  info: "info",
  warning: "warning",
  success: "success",
  danger: "destructive",
};

export function DisputeStatusBadge({
  status,
  audience = "seller",
  outcome,
  moneyStatus,
  escrow,
}: DisputeStatusBadgeProps) {
  const derived =
    status === "resolved"
      ? deriveDisputeDisplay({ disputeStatus: status, outcome, moneyStatus, escrow })
      : null;

  const entry = derived
    ? { label: derived.label, tone: DISPLAY_TONE_TO_TONE[derived.tone] }
    : resolveDisputeLabel(status, audience);
  const Icon = ICON_BY_STATUS[status] ?? Scale;

  return (
    <Badge
      variant="outline"
      className={cn("text-xs font-bold capitalize whitespace-nowrap gap-1.5", TONE_CLASSNAMES[entry.tone])}
    >
      <Icon className="h-3 w-3" />
      {entry.label}
    </Badge>
  );
}
