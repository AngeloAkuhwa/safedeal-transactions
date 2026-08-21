import { Gavel, ArrowLeft, ArrowRight, Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface PossibleOutcomesPanelProps {
  status: string;
}

/**
 * Describes the two possible dispute outcomes in words only.
 *
 * No figure is rendered here: a buyer refund excludes the non-refundable
 * service fee (see `src/lib/payment/fee-policy.ts`), so the two outcomes can
 * never carry the same amount: and the frontend is forbidden from computing
 * a refund or payout figure (see `payment-flow.service.ts`). Any number shown
 * for these outcomes must come from the server after a decision is recorded.
 */
export function PossibleOutcomesPanel({ status }: PossibleOutcomesPanelProps) {
  if (status === "resolved") return null;

  return (
    <Card className="bg-muted/30 border-border">
      <CardContent className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-warning/10 rounded-lg flex items-center justify-center">
            <Gavel className="h-5 w-5 text-warning" />
          </div>
          <h3 className="text-lg font-bold text-foreground">Possible Outcomes</h3>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 mb-4">
          {/* Buyer wins */}
          <div className="border border-success/30 bg-success/5 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <ArrowLeft className="h-4 w-4 text-success" />
              <p className="text-sm font-semibold text-success">If Resolved in Your Favor</p>
            </div>
            <p className="text-sm text-foreground">
              The item price may be returned to you. The service fee is not refunded once payment
              has been processed, so the refunded amount is less than the total you paid.
            </p>
          </div>

          {/* Seller wins */}
          <div className="border border-border bg-muted/50 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-semibold text-muted-foreground">If Seller's Evidence Accepted</p>
            </div>
            <p className="text-sm text-foreground">
              The held funds may be released to the seller, minus the fees already applied to
              this transaction.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>
            Decisions are based on the locked transaction agreement and submitted evidence from both
            parties. Exact amounts are calculated by SafeDeal and shown once a decision is recorded.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
