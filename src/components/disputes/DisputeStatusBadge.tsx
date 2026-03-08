import { Scale, Clock, Hourglass, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusConfig: Record<string, { label: string; icon: typeof Scale; className: string }> = {
  open: {
    label: "Open",
    icon: Scale,
    className: "bg-destructive/15 text-destructive border-destructive/30",
  },
  seller_response_pending: {
    label: "Seller Response Pending",
    icon: Clock,
    className: "bg-warning/15 text-warning border-warning/30",
  },
  under_review: {
    label: "Under Review",
    icon: Hourglass,
    className: "bg-warning/15 text-warning border-warning/30",
  },
  resolved: {
    label: "Resolved",
    icon: CheckCircle,
    className: "bg-success/15 text-success border-success/30",
  },
};

interface DisputeStatusBadgeProps {
  status: string;
}

export function DisputeStatusBadge({ status }: DisputeStatusBadgeProps) {
  const config = statusConfig[status] ?? {
    label: status.replace(/_/g, " "),
    icon: Scale,
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
