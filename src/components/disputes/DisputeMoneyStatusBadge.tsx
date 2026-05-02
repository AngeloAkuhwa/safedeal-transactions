import { Lock, Clock, ArrowLeftRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { resolveDisputeMoneyLabel, TONE_CLASSNAMES } from "@/lib/status-labels";

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
}

export function DisputeMoneyStatusBadge({ status }: DisputeMoneyStatusBadgeProps) {
  const entry = resolveDisputeMoneyLabel(status);
  if (!entry) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const Icon = ICON_BY_MONEY[status as string] ?? Lock;

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
