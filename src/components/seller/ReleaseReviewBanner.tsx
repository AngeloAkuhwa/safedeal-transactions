import { AlertCircle, ArrowRight, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router";

interface ReleaseReviewBannerProps {
  reason: string | null | undefined;
}

/**
 * Phase A: surfaces why a confirmed transaction is sitting in
 * `needs_release_review` so the seller knows what action (if any) to take.
 */
export function ReleaseReviewBanner({ reason }: ReleaseReviewBannerProps) {
  const navigate = useNavigate();

  if (reason === "payout_account_missing") {
    return (
      <Card className="rounded-2xl border-l-4 border-warning bg-warning/5 p-5">
        <div className="flex items-start gap-4">
          <div className="h-11 w-11 rounded-xl bg-warning/15 flex items-center justify-center shrink-0">
            <AlertCircle className="h-5 w-5 text-warning" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-foreground mb-1">
              Add a payout account to receive your funds
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Both parties confirmed this deal. SafeDeal cannot release your funds
              until you add and verify a payout account.
            </p>
            <Button
              size="sm"
              className="mt-4 gap-2"
              onClick={() => navigate("/seller/profile")}
            >
              Add payout account <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  // pricing_missing or any other manual review state. No seller action needed.
  return (
    <Card className="rounded-2xl border-l-4 border-primary bg-primary/5 p-5">
      <div className="flex items-start gap-4">
        <div className="h-11 w-11 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
          <ShieldCheck className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-foreground mb-1">
            SafeDeal is reviewing this transaction
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Both parties confirmed. Our team is doing a final review before releasing
            your funds. You'll be notified as soon as the release is approved.
          </p>
        </div>
      </div>
    </Card>
  );
}