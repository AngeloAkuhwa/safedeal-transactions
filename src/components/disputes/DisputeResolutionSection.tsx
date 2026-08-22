import { CheckCircle, Scale } from "lucide-react";
import { format } from "date-fns";
import { formatMoney } from "@/lib/format";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { resolveDisputeOutcomeLabel, TONE_CLASSNAMES } from "@/lib/status-labels";
import type { DisputeDetailResponse } from "@/services/disputes.service";

interface DisputeResolutionSectionProps {
  outcome: NonNullable<DisputeDetailResponse["outcome"]>;
  currencyCode: string;
}

const formatAmount = (amount: number, currency: string) =>
  formatMoney(amount, currency);

export function DisputeResolutionSection({ outcome, currencyCode }: DisputeResolutionSectionProps) {
  const outcomeEntry = resolveDisputeOutcomeLabel(outcome.outcome_type);
  const isPartial = outcome.outcome_type === "partial_refund_release";

  return (
    <Card className="border-success/30">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-success" />
            <h3 className="text-lg font-bold text-foreground">Final Resolution</h3>
          </div>
          <Badge variant="outline" className={TONE_CLASSNAMES[outcomeEntry.tone]}>
            {outcomeEntry.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Decision</p>
          <p className="text-sm text-foreground">{outcome.decision_summary}</p>
        </div>

        <div className="grid sm:grid-cols-3 gap-4 pt-2 border-t border-border">
          {(outcome.refund_amount > 0 || isPartial) && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                {isPartial ? "Refund Pending" : "Refund Amount"}
              </p>
              <p className="text-base font-bold text-success">
                {formatAmount(outcome.refund_amount, currencyCode)}
              </p>
            </div>
          )}
          {(outcome.release_amount > 0 || isPartial) && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                {isPartial ? "Release Pending" : "Released to Seller"}
              </p>
              <p className="text-base font-bold text-foreground">
                {formatAmount(outcome.release_amount, currencyCode)}
              </p>
            </div>
          )}
          <div>
            <p className="text-xs text-muted-foreground mb-1">Resolved</p>
            <p className="text-sm font-medium text-foreground">
              {format(new Date(outcome.resolved_at), "MMM d, yyyy")}
            </p>
          </div>
        </div>

        {outcome.resolved_by_name && (
          <div className="pt-2 border-t border-border flex items-center gap-2">
            <Scale className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              Resolved by <span className="font-medium text-foreground">{outcome.resolved_by_name}</span>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
