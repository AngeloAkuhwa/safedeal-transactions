import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusConfig: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground border-border" },
  awaiting_buyer: { label: "Awaiting Buyer", className: "bg-muted text-muted-foreground border-border" },
  awaiting_payment: { label: "Awaiting Payment", className: "bg-warning/15 text-warning border-warning/30" },
  payment_secured: { label: "Payment Secured", className: "bg-success/15 text-success border-success/30" },
  seller_preparing_delivery: { label: "Preparing Delivery", className: "bg-primary/15 text-primary border-primary/30" },
  seller_dispatched: { label: "In Transit", className: "bg-primary/15 text-primary border-primary/30" },
  delivered_awaiting_verification: { label: "Awaiting Verification", className: "bg-warning/15 text-warning border-warning/30" },
  disputed: { label: "Disputed", className: "bg-destructive/15 text-destructive border-destructive/30" },
  completed: { label: "Completed", className: "bg-success/15 text-success border-success/30" },
  cancelled: { label: "Cancelled", className: "bg-muted text-muted-foreground border-border" },
  timed_out: { label: "Timed Out", className: "bg-muted text-muted-foreground border-border" },
};

interface TransactionStatusBadgeProps {
  status: string;
}

export function TransactionStatusBadge({ status }: TransactionStatusBadgeProps) {
  const config = statusConfig[status] ?? {
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
