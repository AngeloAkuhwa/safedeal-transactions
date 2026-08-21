import { CheckCircle, Scale, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { VerificationCountdown } from "@/components/verification/VerificationCountdown";

interface VerifyReceiptCTAProps {
  transactionId: string;
  deadlineAt: string | null;
  deliveredAt: string | null;
}

export function VerifyReceiptCTA({ transactionId, deadlineAt, deliveredAt }: VerifyReceiptCTAProps) {
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      {deadlineAt && <VerificationCountdown deadlineAt={deadlineAt} deliveredAt={deliveredAt} />}

      <div className="bg-card rounded-2xl shadow-lg border-2 border-primary/30 p-5 sm:p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <AlertTriangle className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-foreground mb-1">Did you get what you ordered?</h2>
            <p className="text-sm text-muted-foreground">
              Your item is marked as delivered. Confirm to release the seller's payment, or open a dispute if something is
              wrong. If you take no action, SafeDeal will review the transaction once the verification window ends.
            </p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <Button
            size="lg"
            className="bg-success hover:bg-success/90 text-success-foreground font-bold h-12"
            onClick={() => navigate(`/dashboard/transactions/${transactionId}/verify`)}
          >
            <CheckCircle className="h-4 w-4" />
            Confirm Receipt
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="border-2 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive font-bold h-12"
            onClick={() => navigate(`/dashboard/transactions/${transactionId}/verify?action=dispute`)}
          >
            <Scale className="h-4 w-4" />
            Open Dispute
          </Button>
        </div>

        <div className="mt-4 grid sm:grid-cols-2 gap-3 text-xs text-muted-foreground">
          <p><span className="font-semibold text-success">Confirm</span>: records that you received the item and starts the payout process for the seller.</p>
          <p><span className="font-semibold text-destructive">Dispute</span>: freezes funds and opens a case with SafeDeal support.</p>
        </div>
      </div>
    </div>
  );
}
