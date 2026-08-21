import { useState, useEffect } from "react";
import { CheckCircle, AlertTriangle, ShieldCheck, ArrowRight, Pause } from "lucide-react";
import { formatMoneyOrDash } from "@/lib/payment/money-format";
import { ConfirmReceiptDialog } from "./ConfirmReceiptDialog";
import { DisputeForm } from "./DisputeForm";

interface VerificationActionsProps {
  transactionId: string;
  transactionCode: string;
  amount: number;
  /** Null when the transaction's pricing row hasn't loaded: renders `—`. */
  currency: string | null;
  autoOpenDispute?: boolean;
}

export function VerificationActions({
  transactionId,
  transactionCode,
  amount,
  currency,
  autoOpenDispute = false,
}: VerificationActionsProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(autoOpenDispute);

  useEffect(() => {
    if (autoOpenDispute) setDisputeOpen(true);
  }, [autoOpenDispute]);

  // No NGN fallback: labelling an unknown currency as Naira is a money claim
  // we cannot support.
  const formatted = currency ? formatMoneyOrDash(amount, currency) : "—";

  return (
    <div className="bg-card rounded-2xl shadow-lg border border-border p-6 lg:p-8">
      <h2 className="text-2xl font-bold text-foreground mb-6">Take Action</h2>

      {/* 2-column grid */}
      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        {/* Confirm button */}
        <div className="space-y-3">
          <button
            onClick={() => setConfirmOpen(true)}
            className="group w-full bg-gradient-to-br from-success to-success/80 text-success-foreground font-bold py-5 rounded-2xl hover:shadow-2xl transition-all flex flex-col items-center justify-center gap-2.5 border-2 border-transparent hover:border-success/40"
          >
            <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
              <CheckCircle className="h-6 w-6" />
            </div>
            <div className="text-center">
              <div className="text-base font-bold">Confirm Item Received</div>
              <div className="text-xs opacity-80">Release funds to seller</div>
            </div>
          </button>
          <div className="bg-success/5 border border-success/20 rounded-xl p-4">
            <div className="flex items-start gap-2">
              <ArrowRight className="h-3.5 w-3.5 text-success shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-foreground mb-1">
                  Confirming will release {formatted} to the seller
                </p>
                <p className="text-xs font-semibold text-muted-foreground">
                  This action cannot be undone
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Dispute button */}
        <div className="space-y-3">
          <button
            onClick={() => setDisputeOpen(!disputeOpen)}
            className="group w-full bg-gradient-to-br from-destructive to-destructive/80 text-destructive-foreground font-bold py-5 rounded-2xl hover:shadow-2xl transition-all flex flex-col items-center justify-center gap-2.5 border-2 border-transparent hover:border-destructive/40"
          >
            <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div className="text-center">
              <div className="text-base font-bold">Raise a Dispute</div>
              <div className="text-xs opacity-80">Report an issue</div>
            </div>
          </button>
          <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-4">
            <div className="flex items-start gap-2">
              <Pause className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-foreground mb-1">
                  Opening a dispute immediately freezes release
                </p>
                <p className="text-xs font-semibold text-muted-foreground">
                  SafeDeal will review evidence from both sides
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Protection reminder */}
      <div className="bg-muted/50 border border-border rounded-xl p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-foreground mb-1">Protection Reminder</p>
            <p className="text-xs text-muted-foreground">
              If you confirm receipt, funds will be immediately released to the seller. If you raise
              a dispute, the SafeDeal review team will review the case and make a final decision.
              Choose wisely based on your verification.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              <a
                href="/legal/refund-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Read the refund &amp; dispute policy
              </a>
            </p>
          </div>
        </div>
      </div>

      {/* Dispute form (expandable) */}
      {disputeOpen && (
        <div className="mt-6">
          <DisputeForm
            transactionId={transactionId}
            onCancel={() => setDisputeOpen(false)}
          />
        </div>
      )}

      {/* Confirm dialog */}
      <ConfirmReceiptDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        transactionId={transactionId}
        transactionCode={transactionCode}
        amount={formatted}
      />
    </div>
  );
}
