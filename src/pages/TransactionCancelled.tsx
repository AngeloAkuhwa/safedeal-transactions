import { useParams, useNavigate, Link } from "react-router";
import {
  Ban, ShieldCheck, Info, Lightbulb, Home, Headphones, Clock, Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Footer } from "@/components/landing/Footer";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { resolveMoneyLabel } from "@/lib/status-labels";

export default function TransactionCancelled() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const navigate = useNavigate();

  // Optionally fetch transaction info for display
  const { data } = useQuery({
    queryKey: ["cancelled-tx", shareToken],
    queryFn: async () => {
      if (!shareToken) return null;
      const { data, error } = await supabase.functions.invoke("resolve-share-token", {
        body: { shareToken },
      });
      if (error || data?.error) return null;
      return data;
    },
    enabled: !!shareToken,
    retry: false,
  });

  const transactionCode = data?.transaction?.transaction_code;
  const cancelledByRole: string | null = data?.transaction?.cancelled_by_role ?? null;
  const cancellationReason: string | null = data?.transaction?.cancellation_reason ?? null;
  const moneyStatus: string | null = data?.transaction?.money_status ?? null;
  const escrowState: string | null = data?.escrow?.state ?? data?.escrow?.escrow_state ?? null;

  // A cancellation says nothing about money. Only these recorded states mean
  // the buyer was never charged; anything else (or an unread record) must not
  // be described as "no payment was processed".
  const NEVER_CHARGED = new Set(["not_secured", "payment_pending"]);
  const neverCharged =
    moneyStatus != null && NEVER_CHARGED.has(moneyStatus) && escrowState !== "held";
  const moneyLabel = moneyStatus
    ? resolveMoneyLabel(moneyStatus, "buyer").label
    : "Not available";

  // Only state what the record actually says. Never attribute a cancellation
  // to a party the transaction record does not identify.
  const reasonTitle =
    cancelledByRole === "buyer"
      ? "Cancelled by the buyer"
      : cancelledByRole === "seller"
        ? "Cancelled by the seller"
        : cancelledByRole === "system"
          ? "Cancelled automatically by SafeDeal"
          : "This transaction was cancelled";
  const reasonBody =
    cancellationReason?.trim() ||
    "No reason was recorded for this cancellation.";

  return (
    <div className="min-h-[100dvh] bg-muted/30 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity min-h-11">
            <div className="bg-primary text-primary-foreground p-1.5 rounded-lg">
              <Shield className="h-5 w-5" />
            </div>
            <span className="text-xl font-bold text-foreground">SafeDeal</span>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-grow w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">

        <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">

          {/* Hero */}
          <div className="bg-gradient-to-br from-muted/60 to-muted px-6 sm:px-8 py-10 sm:py-14 text-center border-b border-border">
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-muted-foreground/10 flex items-center justify-center">
                <Ban className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground" />
              </div>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-3">Transaction Cancelled</h1>
            {transactionCode && (
              <p className="text-sm text-muted-foreground mb-2 font-mono">Ref: {transactionCode}</p>
            )}
            <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto">
              This transaction has been cancelled and will not proceed.
            </p>
          </div>

          <div className="px-6 sm:px-8 py-8 space-y-8">

            {/* Status Summary */}
            <div>
              <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                <Info className="h-5 w-5 text-primary" />
                Status Summary
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-muted/50 rounded-xl p-5 border border-border">
                  <p className="text-sm text-muted-foreground font-medium mb-3">Transaction Status</p>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-muted text-muted-foreground border border-border">
                      <Ban className="h-3 w-3 mr-1.5" />
                      Cancelled
                    </span>
                  </div>
                </div>
                <div className="bg-primary/5 rounded-xl p-5 border border-primary/20">
                  <p className="text-sm text-muted-foreground font-medium mb-3">Money Status</p>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-primary/10 text-primary border border-primary/20">
                      <ShieldCheck className="h-3 w-3 mr-1.5" />
                      {moneyLabel}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Cancellation Reason */}
            <div>
              <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                <Info className="h-5 w-5 text-muted-foreground" />
                Cancellation Reason
              </h2>

              <div className="bg-muted/40 rounded-xl p-6 border border-border">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <Clock className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-foreground mb-2">{reasonTitle}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{reasonBody}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* What happened to the money — read from the recorded state only. */}
            <div className="bg-primary/5 rounded-xl p-6 border border-primary/20">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground mb-2">Where your money stands</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {neverCharged
                      ? "This transaction was cancelled before payment, so nothing was charged. You can start a new transaction at any time."
                      : `The recorded money status for this transaction is "${moneyLabel}". Open the transaction in your dashboard, or contact support, for the current position on any amount already paid.`}
                  </p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-4">
              <Button
                onClick={() => navigate("/")}
                className="flex-1 py-6 rounded-xl text-base font-semibold"
                size="lg"
              >
                <Home className="h-5 w-5" />
                Return to Homepage
              </Button>
              <Button
                variant="outline"
                className="flex-1 py-6 rounded-xl text-base font-semibold border-2"
                size="lg"
                onClick={() =>
                  navigate(
                    `/contact?topic=transaction${transactionCode ? `&ref=${encodeURIComponent(transactionCode)}` : ""}`,
                  )
                }
              >
                <Headphones className="h-5 w-5" />
                Contact Support
              </Button>
            </div>

            {/* Info banner */}
            <div className="bg-muted/40 rounded-xl p-5 border border-border">
              <div className="flex items-start gap-3">
                <Lightbulb className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground mb-1">Need to start a new transaction?</p>
                  <p className="text-sm text-muted-foreground">
                    If you're a seller, you can create a new protected transaction from your dashboard. If you're a buyer, ask the seller to send you a new transaction link.
                  </p>
                </div>
              </div>
            </div>

          </div>
        </div>

      </main>

      <Footer />
    </div>
  );
}
