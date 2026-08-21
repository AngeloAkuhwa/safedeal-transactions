import { useState } from "react";
import { Wallet, Shield, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { EditPayoutDetailsModal } from "@/components/seller/EditPayoutDetailsModal";
import { updatePayoutAccount } from "@/services/seller-payouts.service";
import type { PayoutAccountSummary } from "@/services/seller-profile.service";
import { format } from "date-fns";

interface Props {
  payoutAccount: PayoutAccountSummary | null;
  onSaved: () => void;
}

export function PayoutDestinationSection({ payoutAccount, onSaved }: Props) {
  const [modalOpen, setModalOpen] = useState(false);

  const handleSave = async (data: {
    bank_code: string;
    bank_name: string;
    account_number: string;
    account_name: string;
  }) => {
    await updatePayoutAccount(data);
    onSaved();
  };

  const hasAccount = !!payoutAccount?.bank_name;
  const status = payoutAccount?.verification_status ?? "pending";
  // Strict, single source of truth (matches dashboard + edge function logic).
  // Bank verified by Paystack alone is NOT enough. We also need the secure
  // payout link (provider_recipient_code) to be present for SafeDeal to actually
  // transfer funds. Edge function emits payout_ready/payout_blocker_reason.
  const payoutReady = payoutAccount?.payout_ready ?? (status === "verified");
  const blocker = payoutAccount?.payout_blocker_reason ?? null;
  const showLinkIssue = status === "verified" && blocker === "no_recipient_code";

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Wallet className="h-5 w-5 text-primary" />
            Payout Destination
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasAccount ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Bank Name</p>
                  <p className="text-sm font-medium text-foreground">{payoutAccount!.bank_name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Account Name</p>
                  <p className="text-sm font-medium text-foreground">{payoutAccount!.account_name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Account Number</p>
                  <p className="text-sm font-medium text-foreground font-mono">
                    {payoutAccount!.masked_account_number}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Currency</p>
                  <p className="text-sm font-medium text-foreground">NGN (₦)</p>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Status:</span>
                  {payoutReady ? (
                    <Badge className="bg-success/10 text-success border-success/20 hover:bg-success/10">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Verified
                    </Badge>
                  ) : showLinkIssue ? (
                    <Badge variant="outline" className="text-warning border-warning/30">
                      <Clock className="h-3 w-3 mr-1" />
                      Action needed: finish bank link
                    </Badge>
                  ) : status === "failed" ? (
                    <Badge variant="destructive">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      Failed
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-warning border-warning/30">
                      <Clock className="h-3 w-3 mr-1" />
                      Pending
                    </Badge>
                  )}
                </div>
                {payoutAccount!.updated_at && (
                  <span className="text-xs text-muted-foreground">
                    Updated {format(new Date(payoutAccount!.updated_at), "MMM d, yyyy")}
                  </span>
                )}
              </div>

              {showLinkIssue && (
                <div className="flex items-start gap-2 text-xs rounded-md border border-warning/30 bg-warning/5 p-3">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5 text-warning" />
                  <div className="space-y-1">
                    <p className="font-medium text-foreground">Finish linking your bank to receive payouts</p>
                    <p className="text-muted-foreground">
                      Your bank details are verified, but the secure payout link with our payment processor isn't complete yet.
                      Re-enter your account number below to finish the link. You won't be charged.
                    </p>
                  </div>
                </div>
              )}

              <Separator />

              <Button
                variant={showLinkIssue ? "default" : "outline"}
                className="w-full"
                onClick={() => setModalOpen(true)}
              >
                {showLinkIssue ? "Finish Bank Link" : "Edit Payout Details"}
              </Button>
            </>
          ) : (
            <div className="text-center py-6 space-y-3">
              <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                <Wallet className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">No payout account configured</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Set up your bank account to receive released funds.
                </p>
              </div>
              <Button onClick={() => setModalOpen(true)}>
                Set Up Payout Account
              </Button>
            </div>
          )}

          <div className="flex items-start gap-2 text-xs text-muted-foreground pt-1">
            <Shield className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-primary" />
            <span>
              For security, only masked payout account details are shown. Changes to payout details
              may require reverification before future releases.
            </span>
          </div>
        </CardContent>
      </Card>

      <EditPayoutDetailsModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onSave={handleSave}
        existingAccount={
          hasAccount
            ? { bank_name: payoutAccount!.bank_name, masked_account_number: payoutAccount!.masked_account_number }
            : null
        }
      />
    </>
  );
}
