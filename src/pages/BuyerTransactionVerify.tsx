import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Loader2,
  ShieldAlert,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BuyerNav } from "@/components/dashboard/BuyerNav";
import { Footer } from "@/components/landing/Footer";
import { VerificationCountdown } from "@/components/verification/VerificationCountdown";
import { VerificationChecklist } from "@/components/verification/VerificationChecklist";
import { VerificationActions } from "@/components/verification/VerificationActions";
import { VerificationSidebar } from "@/components/verification/VerificationSidebar";
import { getVerificationData } from "@/services/verification.service";
import { getBuyerProfile } from "@/services/profile.service";

function formatCurrency(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

const STATUS_LABELS: Record<string, string> = {
  delivered_awaiting_verification: "Awaiting Verification",
  funds_held_in_escrow: "Funds Held in Escrow",
};

const BuyerTransactionVerify = () => {
  const { transactionId } = useParams<{ transactionId: string }>();
  const navigate = useNavigate();

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
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
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

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <BuyerNav
        buyerName={profile?.profile.full_name || ""}
        avatarUrl={profile?.profile.avatar_url}
      />

      {/* Trust banner */}
      <div className="bg-warning/10 border-b border-warning/20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-2.5 flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-warning shrink-0" />
          <p className="text-xs text-warning font-medium">
            Verification window is now open — confirm receipt or raise a dispute before the
            deadline
          </p>
        </div>
      </div>

      {/* Hero header */}
      <section className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent py-6 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-4">
            <Link to="/dashboard" className="hover:text-foreground transition-colors">
              Dashboard
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <Link
              to="/dashboard/transactions"
              className="hover:text-foreground transition-colors"
            >
              Transactions
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-foreground font-medium">Verify Item</span>
          </nav>

          {/* Transaction header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="space-y-1">
              <h1 className="text-xl sm:text-2xl font-bold text-foreground">
                {transaction.transaction_code}
              </h1>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="text-[10px] bg-warning/10 text-warning border-warning/20">
                  {STATUS_LABELS[transaction.status] || transaction.status}
                </Badge>
                <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary border-primary/20">
                  {STATUS_LABELS[transaction.money_status] || transaction.money_status}
                </Badge>
              </div>
            </div>
            {pricing && (
              <div className="text-right">
                <p className="text-2xl font-bold text-foreground">
                  {formatCurrency(Number(pricing.buyer_total_amount), pricing.currency_code)}
                </p>
                <p className="text-xs text-muted-foreground">{pricing.currency_code}</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Action required alert */}
      <div className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 mt-4">
        <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/5 p-4">
          <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-foreground">Action Required</p>
            <p className="text-xs text-muted-foreground">
              Please verify the item you received against the locked agreement. If everything
              matches, confirm receipt. If there is any issue, raise a dispute to protect your
              funds.
            </p>
          </div>
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
              currency={pricing?.currency_code || "NGN"}
            />
          </div>

          {/* Right column */}
          <div className="lg:sticky lg:top-6 lg:self-start">
            <VerificationSidebar data={data} />
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default BuyerTransactionVerify;
