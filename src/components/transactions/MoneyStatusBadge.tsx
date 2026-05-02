import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  resolveMoneyLabel,
  TONE_CLASSNAMES,
  type Audience,
} from "@/lib/status-labels";

interface MoneyStatusBadgeProps {
  status: string;
  /** Defaults to "seller" so legacy call sites keep their existing copy. */
  audience?: Audience;
  /** When `audience="buyer"` and status is `funds_pending_release`, this
   *  toggles between "Awaiting Seller Confirmation" and "Awaiting Release". */
  sellerConfirmed?: boolean | null;
  className?: string;
}

export function MoneyStatusBadge({
  status,
  audience = "seller",
  sellerConfirmed,
  className,
}: MoneyStatusBadgeProps) {
  const entry = resolveMoneyLabel(status, audience, { sellerConfirmed });
  const display = entry.short ?? entry.label;

  return (
    <Badge
      variant="outline"
      title={entry.label}
      className={cn(
        "text-xs font-medium whitespace-nowrap",
        TONE_CLASSNAMES[entry.tone],
        className,
      )}
    >
      {display}
    </Badge>
  );
}
