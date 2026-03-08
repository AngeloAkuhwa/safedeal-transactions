import { Lock, Clock, ArrowLeftRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const moneyConfig: Record<string, { label: string; icon: typeof Lock; className: string }> = {
  funds_frozen: {
    label: "Funds Frozen",
    icon: Lock,
    className: "bg-warning/15 text-warning border-warning/30",
  },
  refund_pending: {
    label: "Refund Pending",
    icon: Clock,
    className: "bg-warning/15 text-warning border-warning/30",
  },
  refund_issued: {
    label: "Refund Issued",
    icon: ArrowLeftRight,
    className: "bg-success/15 text-success border-success/30",
  },
  funds_releasing: {
    label: "Releasing",
    icon: ArrowLeftRight,
    className: "bg-success/15 text-success border-success/30",
  },
  funds_released: {
    label: "Funds Released",
    icon: ArrowLeftRight,
    className: "bg-muted text-muted-foreground border-border",
  },
};

interface DisputeMoneyStatusBadgeProps {
  status: string | null;
}

export function DisputeMoneyStatusBadge({ status }: DisputeMoneyStatusBadgeProps) {
  if (!status) {
    return (
      <span className="text-xs text-muted-foreground">—</span>
    );
  }

  const config = moneyConfig[status] ?? {
    label: status.replace(/_/g, " "),
    icon: Lock,
    className: "bg-muted text-muted-foreground border-border",
  };

  const Icon = config.icon;

  return (
    <Badge
      variant="outline"
      className={cn("text-xs font-bold capitalize whitespace-nowrap gap-1.5", config.className)}
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}
