import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const moneyConfig: Record<string, { label: string; className: string }> = {
  not_secured: { label: "Not Secured", className: "bg-muted text-muted-foreground border-border" },
  payment_pending: { label: "Payment Pending", className: "bg-warning/15 text-warning border-warning/30" },
  funds_held_in_escrow: { label: "Funds in Escrow", className: "bg-primary/15 text-primary border-primary/30" },
  funds_frozen: { label: "Funds Frozen", className: "bg-destructive/15 text-destructive border-destructive/30" },
  funds_releasing: { label: "Pending Release", className: "bg-success/15 text-success border-success/30" },
  funds_released: { label: "Released to You", className: "bg-success/15 text-success border-success/30" },
  refund_pending: { label: "Refund Pending", className: "bg-warning/15 text-warning border-warning/30" },
  refund_issued: { label: "Refunded", className: "bg-muted text-muted-foreground border-border" },
};

interface MoneyStatusBadgeProps {
  status: string;
}

export function MoneyStatusBadge({ status }: MoneyStatusBadgeProps) {
  const config = moneyConfig[status] ?? {
    label: status.replace(/_/g, " "),
    className: "bg-muted text-muted-foreground border-border",
  };

  return (
    <Badge
      variant="outline"
      className={cn("text-xs font-medium capitalize whitespace-nowrap", config.className)}
    >
      {config.label}
    </Badge>
  );
}
