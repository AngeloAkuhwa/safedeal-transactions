import { Scale, Clock, Hourglass, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { resolveDisputeLabel, TONE_CLASSNAMES } from "@/lib/status-labels";

interface DisputeStatusBadgeProps {
  status: string;
  audience?: "seller" | "buyer";
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

export function DisputeStatusBadge({ status, audience = "seller" }: DisputeStatusBadgeProps) {
  const entry = resolveDisputeLabel(status, audience);
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
