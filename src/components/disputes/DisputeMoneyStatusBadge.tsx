import { Lock, Clock, ArrowLeftRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { resolveDisputeMoneyLabel, TONE_CLASSNAMES, type Tone } from "@/lib/status-labels";
import {
  deriveDisputeDisplay,
  type DisputeOutcomeInput,
  type DisputeDisplayTone,
} from "@/lib/dispute-display-status";

const ICON_BY_MONEY: Record<string, typeof Lock> = {
  funds_frozen: Lock,
  refund_pending: Clock,
  refund_issued: ArrowLeftRight,
  funds_releasing: ArrowLeftRight,
  funds_released: ArrowLeftRight,
  funds_held_in_escrow: Lock,
  funds_pending_release: Clock,
};

interface DisputeMoneyStatusBadgeProps {
  status: string | null;
  /** When provided + dispute is resolved, render the derived label. */
  disputeStatus?: string | null;
  outcome?: DisputeOutcomeInput | null;
  escrow?: { heldAmount?: number | null; frozenAmount?: number | null } | null;
}

const DISPLAY_TONE_TO_TONE: Record<DisputeDisplayTone, Tone> = {
  neutral: "muted",
  info: "info",
  warning: "warning",
  success: "success",
  danger: "destructive",
};

export function DisputeMoneyStatusBadge({
  status,
  disputeStatus,
  outcome,
  escrow,
}: DisputeMoneyStatusBadgeProps) {
  const derived =
    disputeStatus === "resolved"
      ? deriveDisputeDisplay({ disputeStatus, outcome, moneyStatus: status, escrow })
      : null;
  const entry = derived
    ? { label: derived.label, tone: DISPLAY_TONE_TO_TONE[derived.tone] }
    : resolveDisputeMoneyLabel(status);
  if (!entry) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const moneyKey = derived?.moneyStatus ?? status;
  const Icon = ICON_BY_MONEY[moneyKey as string] ?? Lock;

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
