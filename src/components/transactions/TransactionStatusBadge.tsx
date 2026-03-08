import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Clock,
  Truck,
  Package,
  CheckCircle,
  Scale,
  XCircle,
  CreditCard,
  Eye,
  FileText,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const statusConfig: Record<string, { label: string; className: string; icon: LucideIcon }> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground border-border", icon: FileText },
  awaiting_buyer: { label: "Awaiting Buyer", className: "bg-muted text-muted-foreground border-border", icon: Clock },
  awaiting_payment: { label: "Awaiting Payment", className: "bg-warning/15 text-warning border-warning/30", icon: CreditCard },
  payment_secured: { label: "Payment Secured", className: "bg-success/15 text-success border-success/30", icon: CheckCircle },
  seller_preparing_delivery: { label: "Preparing Delivery", className: "bg-primary/15 text-primary border-primary/30", icon: Package },
  seller_dispatched: { label: "In Transit", className: "bg-primary/15 text-primary border-primary/30", icon: Truck },
  delivered_awaiting_verification: { label: "Awaiting Verification", className: "bg-warning/15 text-warning border-warning/30", icon: Eye },
  disputed: { label: "Disputed", className: "bg-destructive/15 text-destructive border-destructive/30", icon: Scale },
  completed: { label: "Completed", className: "bg-success/15 text-success border-success/30", icon: CheckCircle },
  cancelled: { label: "Cancelled", className: "bg-muted text-muted-foreground border-border", icon: XCircle },
  timed_out: { label: "Timed Out", className: "bg-muted text-muted-foreground border-border", icon: Clock },
};

interface TransactionStatusBadgeProps {
  status: string;
}

export function TransactionStatusBadge({ status }: TransactionStatusBadgeProps) {
  const config = statusConfig[status] ?? {
    label: status.replace(/_/g, " "),
    className: "bg-muted text-muted-foreground border-border",
    icon: Clock,
  };

  const Icon = config.icon;

  return (
    <Badge
      variant="outline"
      className={cn("text-xs font-medium capitalize whitespace-nowrap gap-1", config.className)}
    >
      <Icon className="h-3.5 w-3.5" />
      {config.label}
    </Badge>
  );
}
