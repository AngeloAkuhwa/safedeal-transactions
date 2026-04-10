import { Link } from "react-router-dom";
import { Wallet, Lock, ArrowLeftRight, AlertTriangle, ExternalLink, Info } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  const { payout, escrow, is_blocked, blocked_amount, block_reason, currency_code, partial_release_possible, payout_exists } = impact;

  return (
    <Card className={cn("rounded-2xl", is_blocked && "border-warning/30")} id="payout">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          {is_blocked ? (
            <AlertTriangle className="h-5 w-5 text-warning" />
          ) : (
            <Wallet className="h-5 w-5 text-primary" />
          )}
          <h3 className="font-bold text-foreground">Payout Impact</h3>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Blocked status */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Payout Status</span>
          <Badge
            variant="outline"
            className={cn(
              "text-xs font-bold",
              is_blocked
                ? "bg-destructive/15 text-destructive border-destructive/20"
                : "bg-success/15 text-success border-success/20"
            )}
          >
            {is_blocked ? (
              <>
                <Lock className="h-3 w-3 mr-1" />
                Blocked
              </>
            ) : (
              "Not Blocked"
            )}
          </Badge>
        </div>

        {/* Blocked amount */}
        {is_blocked && blocked_amount > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Blocked Amount</span>
            <span className="text-sm font-bold text-destructive">
              {formatAmount(blocked_amount, currency_code)}
            </span>
          </div>
        )}

        {/* Block reason */}
        {block_reason && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Reason</span>
            <span className="text-xs text-muted-foreground">{block_reason}</span>
          </div>
        )}

        {/* Escrow state */}
        {escrow && (
          <div className="space-y-2 pt-2 border-t border-border">
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
                  {formatAmount(escrow.frozen_amount, currency_code)}
                </span>
              </div>
            )}
            {escrow.held_amount > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Held in Escrow</span>
                <span className="text-sm font-medium text-foreground">
                  {formatAmount(escrow.held_amount, currency_code)}
                </span>
              </div>
            )}
            {escrow.released_amount > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Released</span>
                <span className="text-sm font-medium text-success">
                  {formatAmount(escrow.released_amount, currency_code)}
                </span>
              </div>
            )}
            {escrow.refunded_amount > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Refunded</span>
                <span className="text-sm font-medium text-muted-foreground">
                  {formatAmount(escrow.refunded_amount, currency_code)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Payout record */}
        {payout && (
          <div className="space-y-2 pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Payout Record</span>
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

        {/* No payout record */}
        {!payout_exists && (
          <div className="flex items-center gap-2 pt-2 border-t border-border">
            <Info className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <p className="text-xs text-muted-foreground">
              No payout record has been created yet for this transaction.
            </p>
          </div>
        )}

        {/* Partial release */}
        {partial_release_possible && (
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
            <p className="text-xs text-foreground">
              A partial release is possible based on the dispute resolution. Part of the funds may be released to you while the remainder is refunded to the buyer.
            </p>
          </div>
        )}

        {/* Frozen funds info */}
        {is_blocked && !partial_release_possible && (
          <div className="bg-warning/5 border border-warning/20 rounded-lg p-3">
            <p className="text-xs text-foreground">
              Funds are frozen while this dispute is under review. Resolution will determine whether funds are released to you or refunded to the buyer.
            </p>
          </div>
        )}

        {/* Link to payouts */}
        {payout_exists && (
          <Button variant="outline" size="sm" className="w-full text-xs h-8 gap-1.5" asChild>
            <Link to="/seller/payouts">
              <ExternalLink className="h-3.5 w-3.5" />
              View Payouts
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
