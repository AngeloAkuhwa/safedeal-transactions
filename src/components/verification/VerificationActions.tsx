import { useState } from "react";
import { CheckCircle, AlertTriangle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmReceiptDialog } from "./ConfirmReceiptDialog";
import { DisputeForm } from "./DisputeForm";

interface VerificationActionsProps {
  transactionId: string;
  transactionCode: string;
  amount: number;
  currency: string;
}

export function VerificationActions({
  transactionId,
  transactionCode,
  amount,
  currency,
}: VerificationActionsProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);

  const formatted = new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Take Action</CardTitle>
        <p className="text-xs text-muted-foreground">
          Choose one of the options below based on your inspection
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Confirm CTA */}
        <div className="rounded-lg border border-success/30 bg-success/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-success" />
            <h4 className="text-sm font-semibold text-foreground">Item Matches Agreement</h4>
          </div>
          <p className="text-xs text-muted-foreground">
            Confirming will release {formatted} from escrow to the seller. This action is
            irreversible.
          </p>
          <Button
            className="w-full bg-success hover:bg-success/90 text-success-foreground"
            onClick={() => setConfirmOpen(true)}
          >
            <CheckCircle className="h-4 w-4 mr-2" />
            Confirm Item Received
          </Button>
        </div>

        {/* Dispute CTA */}
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <h4 className="text-sm font-semibold text-foreground">Something is Wrong</h4>
          </div>
          <p className="text-xs text-muted-foreground">
            Opening a dispute will freeze the escrow funds until the issue is resolved by our
            team.
          </p>
          <Button
            variant="destructive"
            className="w-full"
            onClick={() => setDisputeOpen(!disputeOpen)}
          >
            <AlertTriangle className="h-4 w-4 mr-2" />
            Raise a Dispute
          </Button>
        </div>

        {/* Dispute form (expandable) */}
        {disputeOpen && (
          <DisputeForm
            transactionId={transactionId}
            onCancel={() => setDisputeOpen(false)}
          />
        )}

        {/* Protection reminder */}
        <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3">
          <ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            Your funds are protected by SafeDeal escrow until you confirm or raise a dispute.
            The seller cannot access funds during the verification window.
          </p>
        </div>

        {/* Confirm dialog */}
        <ConfirmReceiptDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          transactionId={transactionId}
          transactionCode={transactionCode}
          amount={formatted}
        />
      </CardContent>
    </Card>
  );
}
