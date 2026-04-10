import { Wallet, Lock, ArrowLeftRight, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { SellerDisputePayoutImpact } from "@/services/seller-dispute-detail.service";

interface SellerPayoutImpactCardProps {
  impact: SellerDisputePayoutImpact;
}

function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
  }).format(amount);
}

const escrowStateConfig: Record<string, { label: string; className: string }> = {
  awaiting_payment: { label: "Awaiting Payment", className: "bg-muted text-muted-foreground" },
  funds_held: { label: "Funds Held", className: "bg-warning/15 text-warning" },
  funds_frozen: { label: "Funds Frozen", className: "bg-destructive/15 text-destructive" },
  releasing: { label: "Releasing", className: "bg-success/15 text-success" },
  released: { label: "Released", className: "bg-success/15 text-success" },
  refunded: { label: "Refunded", className: "bg-muted text-muted-foreground" },
};

const payoutStatusConfig: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-warning/15 text-warning" },
  processing: { label: "Processing", className: "bg-primary/15 text-primary" },
  completed: { label: "Completed", className: "bg-success/15 text-success" },
  failed: { label: "Failed", className: "bg-destructive/15 text-destructive" },
};

export function SellerPayoutImpactCard({ impact }: SellerPayoutImpactCardProps) {
  const { payout, escrow } = impact;
  const hasImpact = payout || escrow;

  if (!hasImpact) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-muted-foreground" />
            <h3 className="font-bold text-foreground">Payout Impact</h3>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No payout data available for this transaction.</p>
        </CardContent>
      </Card>
    );
  }

  const isFrozen = escrow?.state === "funds_frozen" || escrow?.frozen_amount > 0;
  const currency = payout?.currency_code ?? "NGN";

  return (
    <Card className={cn(isFrozen && "border-warning/30")}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          {isFrozen ? (
            <AlertTriangle className="h-5 w-5 text-warning" />
          ) : (
            <Wallet className="h-5 w-5 text-primary" />
          )}
          <h3 className="font-bold text-foreground">Payout Impact</h3>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Escrow state */}
        {escrow && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Escrow State</span>
              <Badge
                variant="outline"
                className={cn(
                  "text-xs font-bold",
                  escrowStateConfig[escrow.state]?.className ?? "bg-muted text-muted-foreground"
                )}
              >
                <Lock className="h-3 w-3 mr-1" />
                {escrowStateConfig[escrow.state]?.label ?? escrow.state.replace(/_/g, " ")}
              </Badge>
            </div>
            {escrow.frozen_amount > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Frozen Amount</span>
                <span className="text-sm font-bold text-warning">
                  {formatAmount(escrow.frozen_amount, currency)}
                </span>
              </div>
            )}
            {escrow.held_amount > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Held in Escrow</span>
                <span className="text-sm font-medium text-foreground">
                  {formatAmount(escrow.held_amount, currency)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Payout status */}
        {payout && (
          <div className="space-y-2 pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Payout Status</span>
              <Badge
                variant="outline"
                className={cn(
                  "text-xs font-bold",
                  payoutStatusConfig[payout.status]?.className ?? "bg-muted text-muted-foreground"
                )}
              >
                <ArrowLeftRight className="h-3 w-3 mr-1" />
                {payoutStatusConfig[payout.status]?.label ?? payout.status}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Payout Amount</span>
              <span className="text-sm font-bold text-foreground">
                {formatAmount(payout.amount, payout.currency_code)}
              </span>
            </div>
            {payout.failure_reason && (
              <p className="text-xs text-destructive">{payout.failure_reason}</p>
            )}
          </div>
        )}

        {isFrozen && (
          <div className="bg-warning/5 border border-warning/20 rounded-lg p-3">
            <p className="text-xs text-foreground">
              Funds are frozen while this dispute is under review. Resolution will determine whether funds are released to you or refunded to the buyer.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
