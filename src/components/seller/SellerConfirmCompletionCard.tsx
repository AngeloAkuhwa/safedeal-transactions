import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, CheckCircle, ShieldCheck, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { sellerConfirmCompletion } from "@/services/seller-transaction-detail.service";
import { useNavigate } from "react-router";
import { SellerPayoutLine } from "@/components/payment/SellerPayoutLine";
import { FUND_RELEASE_REVIEW_TARGET } from "@/lib/support/support-copy";

interface SellerConfirmCompletionCardProps {
  transactionId: string;
  transactionCode: string;
  buyerConfirmedAt: string;
  sellerPayoutAmount?: number | null;
  currency?: string;
}

export function SellerConfirmCompletionCard({
  transactionId,
  transactionCode,
  buyerConfirmedAt,
  sellerPayoutAmount = null,
  currency = "NGN",
}: SellerConfirmCompletionCardProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [agreed, setAgreed] = useState(false);

  const mutation = useMutation({
    mutationFn: () => sellerConfirmCompletion(transactionId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["seller-transaction-detail", transactionId] });
      queryClient.invalidateQueries({ queryKey: ["seller-dashboard"] });

      if (data.already_confirmed) {
        toast({ title: "Already confirmed", description: "You already confirmed this transaction." });
        return;
      }
      if (data.blocked && data.reason === "payout_account_missing") {
        toast({
          title: "Confirmation recorded",
          description:
            "Add or verify your payout account so SafeDeal can release your funds.",
        });
        return;
      }
      if (data.blocked && data.reason === "pricing_missing") {
        toast({
          title: "Confirmation recorded",
          description: "SafeDeal is reviewing this transaction. We'll notify you shortly.",
        });
        return;
      }
      toast({
        title: "Confirmation recorded",
        description: "SafeDeal will review and release your funds shortly.",
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Could not confirm",
        description: err.message ?? "Please try again.",
        variant: "destructive",
      });
    },
  });

  const buyerConfirmedDate = new Date(buyerConfirmedAt).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <Card className="rounded-2xl shadow-md border-l-4 border-primary bg-primary/5 p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <div className="h-12 w-12 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
          <ShieldCheck className="h-6 w-6 text-primary" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h3 className="text-base sm:text-lg font-bold text-foreground">
              Confirm this deal is complete on your end
            </h3>
            <span className="text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border border-primary/30 bg-primary/15 text-primary">
              Action required
            </span>
          </div>

          <p className="text-sm text-muted-foreground leading-relaxed">
            The buyer confirmed receipt for <span className="font-semibold text-foreground">#{transactionCode}</span> on {buyerConfirmedDate}. Once you confirm, SafeDeal will review and release your funds — typically within {FUND_RELEASE_REVIEW_TARGET}.
          </p>

          <div className="mt-4 rounded-lg border border-primary/20 bg-background/60 px-3 py-2">
            <SellerPayoutLine
              snapshot={null}
              amount={sellerPayoutAmount}
              currency={currency}
            />
          </div>

          <label className="flex items-start gap-3 mt-4 cursor-pointer select-none min-h-11">
            <Checkbox
              checked={agreed}
              onCheckedChange={(v) => setAgreed(!!v)}
              className="mt-0.5"
              disabled={mutation.isPending}
            />
            <span className="text-sm text-foreground">
              I confirm the buyer received the item and the deal is complete.
            </span>
          </label>

          <div className="flex flex-col sm:flex-row gap-3 mt-5">
            <Button
              onClick={() => mutation.mutate()}
              disabled={!agreed || mutation.isPending}
              className="gap-2"
            >
              {mutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4" />
              )}
              Confirm completion
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate(`/seller/transactions/${transactionId}#messages`)}
              className="gap-2"
              disabled={mutation.isPending}
            >
              <ExternalLink className="h-4 w-4" />
              Something's wrong? Contact support
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}