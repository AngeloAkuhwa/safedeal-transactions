import { useState, useEffect } from "react";
import { formatMoney } from "@/lib/format";
import { useParams, useNavigate, useSearchParams, Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Loader2,
  ShieldAlert,
  Clock,
  AlertTriangle,
  X,
  Lock,
  FileText,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BuyerNav } from "@/components/dashboard/BuyerNav";
import { Footer } from "@/components/landing/Footer";
import { VerificationCountdown } from "@/components/verification/VerificationCountdown";
import { VerificationChecklist } from "@/components/verification/VerificationChecklist";
import { VerificationActions } from "@/components/verification/VerificationActions";
import { VerificationSidebar } from "@/components/verification/VerificationSidebar";
import { WhatHappensCard } from "@/components/verification/WhatHappensCard";
import { SafeDealReviewNotice } from "@/components/verification/SafeDealReviewNotice";
import { getVerificationData } from "@/services/verification.service";
import { getBuyerProfile } from "@/services/profile.service";
import { resolveTransactionLabel, resolveMoneyLabel } from "@/lib/status-labels";

const BuyerTransactionVerify = () => {
  const { transactionId } = useParams<{ transactionId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [alertDismissed, setAlertDismissed] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ["buyer-profile"],
    queryFn: getBuyerProfile,
    retry: 1,
    staleTime: 30_000,
  });

  const {
    data,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["verification", transactionId],
    queryFn: () => getVerificationData(transactionId!),
    enabled: !!transactionId,
    retry: (failureCount, err) => {
      // Don't retry if the transaction isn't in verification state (redirect error)
      if ((err as any)?.redirect) return false;
      return failureCount < 1;
    },
  });

  // Auto-redirect if the transaction isn't in verification state
  useEffect(() => {
    if (error && (error as any)?.redirect) {
      const redirectPath = (error as any).redirect;
      if (transactionId && redirectPath === "/dashboard/transactions") {
        navigate(`/dashboard/transactions/${transactionId}`, { replace: true });
      } else {
        navigate(redirectPath, { replace: true });
      }
    }
  }, [error, navigate, transactionId]);

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }


  if (error || !data) {
    // If we're about to redirect, show a loading state instead of error
    if ((error as any)?.redirect) {
      return (
        <div className="min-h-[100dvh] flex items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background gap-4">
        <ShieldAlert className="h-12 w-12 text-destructive" />
        <p className="text-sm text-muted-foreground">
          {(error as Error)?.message || "Unable to load verification data"}
        </p>
        <button
          className="text-sm text-primary hover:underline"
          onClick={() => navigate("/dashboard/transactions")}
        >
          Back to Transactions
        </button>
      </div>
    );
  }

  const { transaction, pricing } = data;

  // No invented window: without both timestamps we do not know how long the
  // buyer has, so nothing about a deadline may be displayed.
  const windowHours = transaction.delivered_at && transaction.verification_deadline_at
    ? Math.round((new Date(transaction.verification_deadline_at).getTime() - new Date(transaction.delivered_at).getTime()) / 3_600_000)
    : null;

  const remainingHours = transaction.verification_deadline_at
    ? Math.max(0, Math.ceil((new Date(transaction.verification_deadline_at).getTime() - Date.now()) / 3_600_000))
    : null;

  return (
    <div className="min-h-[100dvh] bg-muted/30 flex flex-col">
      <BuyerNav
        buyerName={profile?.profile.full_name || ""}
        avatarUrl={profile?.profile.avatar_url}
      />

      {/* Trust banner - full gradient amber */}
      <section className="bg-gradient-to-r from-warning to-warning/80 py-3">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center gap-3 text-warning-foreground">
            <Clock className="h-5 w-5 animate-pulse" />
            <p className="text-sm font-semibold">
              {remainingHours !== null
                ? `Verification window is now open — Please confirm or dispute within ${remainingHours} hours`
                : "Verification window is now open — Please confirm receipt or raise a dispute"}
            </p>
            <AlertTriangle className="h-4 w-4" />
          </div>
        </div>
      </section>

      {/* Transaction header - white bg */}
      <section className="bg-card border-b border-border py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              {/* Badges row */}
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <Badge className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/10">
                  <FileText className="h-3 w-3 mr-1" />
                  {transaction.transaction_code}
                </Badge>
                <Badge className="bg-success/10 text-success border-success/20 hover:bg-success/10">
                  Delivered
                </Badge>
                <Badge className="bg-warning/10 text-warning border-warning/20 hover:bg-warning/10">
                  {resolveTransactionLabel(transaction.status, "buyer").label}
                </Badge>
              </div>
              <h1 className="text-xl lg:text-2xl font-bold text-foreground">
                Did the item match what you ordered?
              </h1>
              <p className="text-muted-foreground mt-1">
                Review the item and confirm receipt or raise a dispute
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              {pricing && (
                <div className="text-right">
                  <div className="text-sm text-muted-foreground mb-1">Transaction Amount</div>
                  <div className="text-xl font-bold text-primary">
                    {formatMoney(Number(pricing.buyer_total_amount), pricing.currency_code)}
                  </div>
                </div>
              )}
              <div className="text-right">
                <div className="text-sm text-muted-foreground mb-1">Money Status</div>
                <Badge className="bg-warning/10 text-warning border-warning/20 hover:bg-warning/10 px-3 py-1.5 text-sm font-semibold">
                  <Lock className="h-3.5 w-3.5 mr-1.5" />
                  {resolveMoneyLabel(transaction.money_status, "buyer").label}
                </Badge>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Notification alert - left-bordered, dismissible */}
      {!alertDismissed && (
        <section className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 pt-6">
          <div className="bg-warning/5 border-l-4 border-warning rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Clock className="h-5 w-5 text-warning shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground mb-1">
                  {remainingHours !== null
                    ? `Action Required: Verify your item within ${remainingHours} hours`
                    : "Action Required: Verify your item"}
                </p>
                <p className="text-xs text-muted-foreground">
                  If you don't act before the deadline, SafeDeal will review the transaction before
                  releasing funds. Funds are never released automatically. Please confirm the item
                  matches the agreement or raise a dispute if there's an issue.
                </p>
              </div>
              <button
                onClick={() => setAlertDismissed(true)}
                className="text-muted-foreground hover:text-foreground relative inline-flex items-center justify-center before:absolute before:-inset-3.5 before:content-['']"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Main content */}
      <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left column */}
          <div className="lg:col-span-2 space-y-6">
            {transaction.verification_deadline_at && (
              <VerificationCountdown
                deadlineAt={transaction.verification_deadline_at}
                deliveredAt={transaction.delivered_at}
              />
            )}
            <VerificationChecklist item={data.item} />
            <VerificationActions
              transactionId={transaction.id}
              transactionCode={transaction.transaction_code}
              amount={pricing ? Number(pricing.buyer_total_amount) : 0}
              currency={pricing?.currency_code ?? null}
              autoOpenDispute={searchParams.get("action") === "dispute"}
            />
            {windowHours !== null && <WhatHappensCard windowHours={windowHours} />}
            {transaction.verification_deadline_at && windowHours !== null && (
              <SafeDealReviewNotice
                deadlineAt={transaction.verification_deadline_at}
                windowHours={windowHours}
              />
            )}
          </div>

          {/* Right column */}
          <div className="lg:col-span-1">
            <div className="lg:sticky lg:top-24">
              <VerificationSidebar data={data} />
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default BuyerTransactionVerify;
