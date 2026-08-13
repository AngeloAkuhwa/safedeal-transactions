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
import {
  resolveTransactionLabel,
  TONE_CLASSNAMES,
  type Audience,
  type TxStatus,
} from "@/lib/status-labels";

const ICONS: Record<string, LucideIcon> = {
  draft: FileText,
  awaiting_buyer: Clock,
  awaiting_payment: CreditCard,
  payment_secured: CheckCircle,
  seller_preparing_delivery: Package,
  seller_dispatched: Truck,
  delivered_awaiting_verification: Eye,
  disputed: Scale,
  completed: CheckCircle,
  cancelled: XCircle,
  timed_out: Clock,
  refunded: XCircle,
  resolved: CheckCircle,
};

interface TransactionStatusBadgeProps {
  status: string;
  /** Defaults to "seller" so legacy call sites keep their existing copy. */
  audience?: Audience;
  /**
   * Money status for the same transaction. When supplied, a receipt-confirmed
   * transaction whose funds are still in escrow reads "Awaiting Release"
   * instead of the misleading "Completed".
   */
  moneyStatus?: string | null;
  className?: string;
}

export function TransactionStatusBadge({
  status,
  audience = "seller",
  moneyStatus,
  className,
}: TransactionStatusBadgeProps) {
  const entry = resolveTransactionLabel(status as TxStatus, audience, { moneyStatus });
  const base = resolveTransactionLabel(status as TxStatus, audience);
  const Icon = entry.label === base.label ? (ICONS[status] ?? Clock) : Clock;
  const display = entry.short ?? entry.label;

  return (
    <Badge
      variant="outline"
      title={entry.label}
      className={cn(
        "text-xs font-medium whitespace-nowrap gap-1",
        TONE_CLASSNAMES[entry.tone],
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {display}
    </Badge>
  );
}
