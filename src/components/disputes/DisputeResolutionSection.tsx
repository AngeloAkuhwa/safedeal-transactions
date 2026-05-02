import { CheckCircle, Scale } from "lucide-react";
import { format } from "date-fns";
import { formatMoney } from "@/lib/format";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { DisputeDetailResponse } from "@/services/disputes.service";

interface DisputeResolutionSectionProps {
  outcome: NonNullable<DisputeDetailResponse["outcome"]>;
  currencyCode: string;
}

const OUTCOME_LABELS: Record<string, { label: string; className: string }> = {
  refund_buyer: {
    label: "Refund to Buyer",
    className: "bg-success/15 text-success border-success/30",
  },
  release_funds_to_seller: {
    label: "Funds Released to Seller",
    className: "bg-warning/15 text-warning border-warning/30",
  },
  close_case_without_resolution: {
    label: "Case Closed",
    className: "bg-muted text-muted-foreground border-border",
  },
};

const formatAmount = (amount: number, currency: string) =>
  formatMoney(amount, currency);

export function DisputeResolutionSection({ outcome, currencyCode }: DisputeResolutionSectionProps) {
  const outcomeConfig = OUTCOME_LABELS[outcome.outcome_type] ?? {
    label: outcome.outcome_type.replace(/_/g, " "),
    className: "bg-muted text-muted-foreground border-border",
  };

  return (
    <Card className="border-success/30">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-success/10 rounded-lg flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-success" />
            </div>
            <h3 className="text-lg font-bold text-foreground">Final Resolution</h3>
          </div>
          <Badge variant="outline" className={outcomeConfig.className}>
            {outcomeConfig.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Decision</p>
          <p className="text-sm text-foreground">{outcome.decision_summary}</p>
        </div>

        <div className="grid sm:grid-cols-3 gap-4 pt-2 border-t border-border">
          {outcome.refund_amount > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Refund Amount</p>
              <p className="text-base font-bold text-success">
                {formatAmount(outcome.refund_amount, currencyCode)}
              </p>
            </div>
          )}
          {outcome.release_amount > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Released to Seller</p>
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
