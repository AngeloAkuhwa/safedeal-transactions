import { useParams, useNavigate, Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { format } from "date-fns";
import {
  Shield, Lock, AlertTriangle, ShieldAlert, ShieldCheck, CreditCard,
  Package, Truck, Clock, ClipboardCheck, CheckCircle, XCircle,
  Store, Star, Handshake, IdCard, Phone, Building2, CalendarDays,
  TrendingUp, HelpCircle, Info, Scale, HandCoins,
  FileText, LockOpen, Hourglass, CircleDot, Award, X, User, Ban, ChevronRight
} from "lucide-react";
import { supportLink } from "@/lib/support/support-copy";
import { alwaysClaim, resolveClaim, isTrackedDelivery } from "@/lib/trust/trust-claims";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Footer } from "@/components/landing/Footer";
import { ThemeToggle } from "@/components/ThemeToggle";
import { toast } from "@/components/ui/sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getTransactionReview, type ReviewData } from "@/services/review.service";
import { getBuyerProfile } from "@/services/profile.service";
import { formatMoney } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { BuyerNav } from "@/components/dashboard/BuyerNav";
import { useBuyerIdentity } from "@/hooks/useBuyerIdentity";
import { ProductMediaGallery } from "@/components/transactions/ProductMediaGallery";
import { TerminalTransactionScreen, deriveTerminalStatus } from "@/components/transactions/TerminalTransactionScreen";
import { FEE_NAME, FEE_CAPTION } from "@/lib/payment/fee-policy";

type AuthState = "loading" | "anonymous" | "needs-role" | "ready";

export default function BuyerTransactionReview() {
  const isMobile = useIsMobile();
  const { shareToken } = useParams<{ shareToken: string }>();
  const navigate = useNavigate();
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [showDeclineDialog, setShowDeclineDialog] = useState(false);
  const [isDeclineLoading, setIsDeclineLoading] = useState(false);
  const { buyerName, avatarUrl } = useBuyerIdentity();

  const Header = authState === "ready"
    ? () => <BuyerNav buyerName={buyerName} avatarUrl={avatarUrl} />
    : ReviewHeader;
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setAuthState("anonymous"); return; }
      // Check buyer role
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id);
      if (!roles || roles.length === 0) { setAuthState("needs-role"); return; }
      const hasBuyer = roles.some((r: { role: string }) => r.role === "buyer");
      setAuthState(hasBuyer ? "ready" : "needs-role");
    };
    checkAuth();
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ["transaction-review", shareToken],
    queryFn: () => getTransactionReview(shareToken!),
    enabled: !!shareToken,
    // Auto-refetch every 3s ONLY while payment is pending so the page
    // flips to "funds held" as soon as the Paystack webhook lands.
    refetchInterval: (q) => {
      const ms = (q.state.data as ReviewData | undefined)?.transaction.money_status;
      return ms === "payment_pending" ? 3000 : false;
    },
  });

  // Fetch buyer verification for payment gating
  const { data: profileData } = useQuery({
    queryKey: ["buyer-profile"],
    queryFn: getBuyerProfile,
    enabled: authState === "ready",
  });

  const permissions = profileData?.permissions;
  const canPay = permissions?.canStartProtectedPayment ?? true;

  // Determine specific lock reason
  const lockReason = !canPay && permissions ? (
    !permissions.isRegionEligible && permissions.verificationLevel !== "unverified"
      ? "region"
      : permissions.requiresPhoneVerification || permissions.requiresLocation
        ? "verification"
        : !permissions.canCreateAnotherActiveTransaction
          ? "concurrency"
          : "verification"
  ) : null;

  const handlePayClick = () => {
    if (authState === "anonymous") {
      sessionStorage.setItem("safedeal_redirect", `/t/${shareToken}`);
      navigate(`/auth?redirect=/t/${shareToken}`);
      return;
    }
    if (authState === "needs-role") {
      sessionStorage.setItem("safedeal_redirect", `/t/${shareToken}`);
      navigate(`/role-selection?redirect=/t/${shareToken}`);
      return;
    }
    navigate(`/t/${shareToken}/pay`);
  };

  const handleDecline = () => {
    setShowDeclineDialog(true);
  };

  const confirmDecline = async () => {
    setIsDeclineLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("decline-transaction", {
        body: { shareToken },
      });
      if (error || data?.error) {
        toast.error(data?.error || error?.message || "Failed to decline transaction");
        return;
      }
      toast.success("Transaction declined successfully");
      navigate(`/t/${shareToken}/cancelled`);
    } catch (err) {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsDeclineLoading(false);
      setShowDeclineDialog(false);
    }
  };

  if (error) {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <ShieldAlert className="h-16 w-16 text-destructive mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-foreground mb-2">Invalid or Expired Link</h2>
            <p className="text-muted-foreground mb-6">{(error as Error).message}</p>
            <Button onClick={() => navigate("/")} variant="outline">Go Home</Button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col">
        <Header />
        <div className="max-w-7xl mx-auto px-4 py-8 w-full space-y-6">
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <div className="grid gap-5 sm:gap-8 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6">
              <Skeleton className="h-64 w-full rounded-2xl" />
              <Skeleton className="h-80 w-full rounded-2xl" />
              <Skeleton className="h-48 w-full rounded-2xl" />
            </div>
            <div className="space-y-6">
              <Skeleton className="h-64 w-full rounded-2xl" />
              <Skeleton className="h-48 w-full rounded-2xl" />
            </div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  // Terminal-status guard: cancelled / expired / completed / disputed / refunded
  // transactions cannot proceed through Review → Pay. Show a clear recovery
  // screen instead of the pay CTAs (which would 409 at Paystack init).
  const terminalStatus = deriveTerminalStatus(data.transaction.status);
  if (terminalStatus) {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col">
        <Header />
        <TerminalTransactionScreen
          status={terminalStatus}
          transactionCode={data.transaction.transaction_code}
          timestamp={data.transaction.created_at}
          transactionId={data.transaction.id}
        />
        <Footer />
      </div>
    );
  }

  const currencyCode = data.pricing?.currency_code || "NGN";
  const totalAmount = data.pricing?.total_amount ?? 0;
  const itemAmount = data.pricing?.item_amount ?? 0;
  const feeAmount = data.pricing?.service_fee_amount ?? 0;
  const feeRate = data.pricing?.service_fee_rate ?? 0;
  const payButtonLabel = authState === "anonymous" ? "Sign Up to Pay" : `Pay ${formatMoney(totalAmount, currencyCode)}`;

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <Header />

      {/* Trust banner */}
      <section className="bg-success py-3">
        <div className="max-w-7xl mx-auto px-4 flex items-start sm:items-center justify-center gap-3 text-success-foreground">
          <ShieldCheck className="h-5 w-5 shrink-0" />
          <p className="text-sm font-semibold">Your payment will be held securely until you confirm the item received</p>
           <Lock className="h-4 w-4 shrink-0" />
        </div>
      </section>

      {/* Fraud warning banner */}
       <section className="border-t border-destructive-foreground/20 bg-destructive py-3">
         <div className="max-w-7xl mx-auto px-4 flex items-start sm:items-center justify-center gap-3 text-destructive-foreground">
           <AlertTriangle className="h-5 w-5 shrink-0" />
          <p className="text-sm font-bold">WARNING: Never complete payment outside SafeDeal. Paying outside removes all buyer protection.</p>
           <ShieldAlert className="h-4 w-4 shrink-0" />
        </div>
      </section>

      {/* Transaction header — driven by live money_status / agreement_locked_at */}
      {(() => {
        const ms = data.transaction.money_status;
        const locked = !!data.transaction.agreement_locked_at;
        let chipClass = "bg-warning/10 text-warning border-warning/30 hover:bg-warning/10";
        let dotClass = "bg-warning";
        let chipLabel = "Payment Pending";
        if (ms === "funds_held_in_escrow" || locked) {
          chipClass = "bg-success/10 text-success border-success/30 hover:bg-success/10";
          dotClass = "bg-success";
          chipLabel = "Funds Held Securely";
        } else if (ms === "funds_releasing" || ms === "funds_released") {
          chipClass = "bg-primary/10 text-primary border-primary/30 hover:bg-primary/10";
          dotClass = "bg-primary";
          chipLabel = ms === "funds_released" ? "Funds Released" : "Releasing Funds";
        } else if (ms === "refund_pending" || ms === "refund_issued") {
          chipClass = "bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/10";
          dotClass = "bg-destructive";
          chipLabel = ms === "refund_issued" ? "Refunded" : "Refund Pending";
        }
        return (
          <section className="bg-card border-b py-6">
            <div className="max-w-7xl mx-auto px-4">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/30">
                      <FileText className="h-3 w-3 mr-1" />
                      Transaction #{data.transaction.transaction_code}
                    </Badge>
                    <Badge className={chipClass}>
                      <span className={`w-2 h-2 rounded-full mr-1.5 ${ms === "payment_pending" ? "animate-pulse" : ""} ${dotClass}`} />
                      {chipLabel}
                    </Badge>
                  </div>
                  <h1 className="text-2xl lg:text-3xl font-bold text-foreground">
                    {locked ? "Locked Transaction Agreement" : "Review Transaction Agreement"}
                  </h1>
                  <p className="text-muted-foreground mt-1">
                    {locked
                      ? "Payment received. Agreement is now immutable for both parties."
                      : "Please review all details carefully before proceeding with payment"}
                  </p>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link to={supportLink(data.transaction.transaction_code, "transaction")}>
                    <HelpCircle className="h-4 w-4" />
                    Help
                  </Link>
                </Button>
              </div>
            </div>
          </section>
        );
      })()}

      {/* Money state preview — driven by live state */}
      {(() => {
        const ms = data.transaction.money_status;
        const locked = !!data.transaction.agreement_locked_at;
        const fundsHeld = ms === "funds_held_in_escrow" || locked;
        const txStatusLabel = fundsHeld
          ? "Payment Secured"
          : ms === "payment_pending"
          ? "Payment Processing"
          : "Awaiting Payment";
        const moneyLabel = fundsHeld
          ? "Funds Held in Escrow"
          : ms === "payment_pending"
          ? "Verifying Payment…"
          : "Not Yet Secured";
        return (
          <section className="py-4 bg-muted border-b">
            <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-center gap-6">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${fundsHeld ? "bg-success/10" : "bg-warning/10"}`}>
                  {fundsHeld ? <Lock className="h-5 w-5 text-success" /> : <Hourglass className="h-5 w-5 text-warning" />}
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase">Transaction Status</p>
                  <p className="text-sm font-bold text-foreground">{txStatusLabel}</p>
                </div>
              </div>
              <div className="hidden sm:block w-px h-10 bg-border" />
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${fundsHeld ? "bg-success/10" : "bg-muted"}`}>
                  {fundsHeld ? <Lock className="h-5 w-5 text-success" /> : <LockOpen className="h-5 w-5 text-muted-foreground" />}
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase">Money Status</p>
                  <p className={`text-sm font-bold ${fundsHeld ? "text-success" : "text-muted-foreground"}`}>{moneyLabel}</p>
                </div>
              </div>
            </div>
          </section>
        );
      })()}

      {/* Lock state — green confirmation when locked, red warning when not */}
      {data.transaction.agreement_locked_at ? (
        <section className="bg-success/5 py-3 sm:py-6">
          <div className="max-w-7xl mx-auto px-4">
            <div className="rounded-2xl border-2 border-success/40 bg-card p-4 shadow-lg sm:p-6">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 bg-success/10 rounded-xl flex items-center justify-center shrink-0">
                  <ShieldCheck className="h-7 w-7 text-success" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-foreground mb-3">Agreement Locked &amp; Funds Held Securely</h3>
                  <details open={!isMobile} className="mb-4 group">
                    <summary className="mb-2 cursor-pointer list-none text-sm font-semibold text-primary md:hidden min-h-11 inline-flex items-center">
                      What is locked
                    </summary>
                  <div className="space-y-2">
                    {[
                      { bold: "Item details", rest: "are now frozen and cannot be edited" },
                      { bold: "Quantity, condition, and price", rest: "are immutable" },
                      { bold: "Delivery terms and verification window", rest: "are locked" },
                      { bold: "Your payment", rest: "is held in SafeDeal escrow until you confirm receipt" },
                    ].map((item) => (
                      <div key={item.bold} className="flex items-start gap-2">
                        <CheckCircle className="h-4 w-4 text-success mt-0.5 shrink-0" />
                        <p className="text-sm text-muted-foreground">
                          <span className="font-bold text-foreground">{item.bold}</span> {item.rest}
                        </p>
                      </div>
                    ))}
                  </div>
                  </details>
                  <div className="bg-success/10 border border-success/30 rounded-lg p-3 mb-4">
                    <div className="flex items-center gap-2 text-sm text-success">
                      <Lock className="h-4 w-4 shrink-0" />
                      <span className="font-bold">Locked on {format(new Date(data.transaction.agreement_locked_at), "MMM d, yyyy 'at' h:mm a")}</span>
                    </div>
                  </div>
                  {authState === "ready" && (
                    <Button onClick={() => navigate(`/dashboard/transactions/${data.transaction.id}`)} className="rounded-xl">
                      View Transaction
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="bg-destructive/5 py-3 sm:py-6">
          <div className="max-w-7xl mx-auto px-4">
            <div className="rounded-2xl border-2 border-destructive/40 bg-card p-4 shadow-lg sm:p-6">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 bg-destructive/10 rounded-xl flex items-center justify-center shrink-0">
                  <Lock className="h-7 w-7 text-destructive" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-foreground mb-3">Critical: Agreement Becomes Permanently Locked After Payment</h3>
                  <details open={!isMobile} className="mb-4">
                    <summary className="mb-2 cursor-pointer list-none text-sm font-semibold text-primary md:hidden min-h-11 inline-flex items-center">
                      What gets locked after payment
                    </summary>
                  <div className="space-y-2">
                    {[
                      { bold: "Item details", rest: "(title, description, images) cannot be changed" },
                      { bold: "Quantity and condition", rest: "specifications are frozen" },
                      { bold: "Agreed price and currency", rest: "become immutable" },
                      { bold: "Delivery terms and verification window", rest: "are locked" },
                    ].map((item) => (
                      <div key={item.bold} className="flex items-start gap-2">
                        <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                        <p className="text-sm text-muted-foreground">
                          <span className="font-bold text-foreground">{item.bold}</span> {item.rest}
                        </p>
                      </div>
                    ))}
                  </div>
                  </details>
                  <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-sm text-destructive">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <span className="font-bold">Neither buyer nor seller can modify the agreement after payment is made</span>
                    </div>
                  </div>

                  {/* Pre-payment info banner */}
                  <div className="mt-4 bg-primary/10 border border-primary/30 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-sm text-primary">
                      <Info className="h-4 w-4 shrink-0" />
                      <span className="font-semibold">The seller may still update transaction details until payment is completed</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Main content */}
      <div className="mx-auto w-full max-w-7xl px-3 py-5 sm:px-4 sm:py-8">
        <div className="grid gap-5 sm:gap-8 lg:grid-cols-3">
          {/* Left column */}
          <div className="lg:col-span-2 space-y-6">
            <SellerIdentityCard data={data} />
            <ItemDetailsCard data={data} />
            <DeliveryCard data={data} />
            <TimelineCard />
          </div>

          {/* Right column */}
          <div className="lg:col-span-1">
            <div className="lg:sticky lg:top-24 space-y-6">
              <EscrowProtectionCard data={data} currencyCode={currencyCode} />
              <FraudWarningCard />
              <NextActionCard
                payLabel={payButtonLabel}
                onPay={handlePayClick}
                onDecline={handleDecline}
                authState={authState}
                canPay={canPay}
                lockReason={lockReason}
                onGoToProfile={() => navigate("/dashboard/profile#location")}
                onGoToTransactions={() => navigate("/dashboard/transactions")}
              />
              <PaymentSummaryCard data={data} currencyCode={currencyCode} itemAmount={itemAmount} feeAmount={feeAmount} feeRate={feeRate} totalAmount={totalAmount} />
              <ProtectionFeaturesCard data={data} />
              <TrustIndicatorsCard />
            </div>
          </div>
        </div>
      </div>

      {/* How it works */}
      <section className="py-12 bg-card border-t">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-foreground mb-3">How SafeDeal Protects You</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">Your payment is secured every step of the way until you confirm the item matches this agreement</p>
          </div>
          <div className="grid md:grid-cols-4 gap-6">
            {[
              { icon: CreditCard, title: "1. Secure Payment", desc: "Your payment is processed through encrypted channels and held securely", color: "text-primary", bg: "bg-primary/10" },
              { icon: Lock, title: "2. Agreement Locked", desc: "Transaction terms become immutable to protect both parties", color: "text-warning", bg: "bg-warning/10" },
              { icon: Truck, title: "3. Seller Fulfills", desc: resolveClaim("DELIVERY_TRACKED", { deliveryMethod: data.delivery?.delivery_method }) ?? "Seller follows the selected handover terms", color: "text-success", bg: "bg-success/10" },
              { icon: CheckCircle, title: "4. You Verify", desc: "Confirm item or raise dispute within verification window", color: "text-destructive", bg: "bg-destructive/10" },
            ].map((step) => (
              <div key={step.title} className="text-center">
                <div className={`w-16 h-16 ${step.bg} rounded-2xl flex items-center justify-center mx-auto mb-4`}>
                  <step.icon className={`h-7 w-7 ${step.color}`} />
                </div>
                <h4 className="text-lg font-bold text-foreground mb-2">{step.title}</h4>
                <p className="text-sm text-muted-foreground">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-12 bg-muted">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-foreground mb-3">Frequently Asked Questions</h2>
            <p className="text-muted-foreground">Common questions about the SafeDeal buyer process</p>
          </div>
          <div className="space-y-4">
            {[
               { q: "What happens after I pay?", a: isTrackedDelivery(data.delivery?.delivery_method) ? "The agreement locks and the seller is notified to fulfill the order and provide courier details." : "The agreement locks and the seller is notified to fulfill the order under the selected handover terms." },
              { q: "What if the item doesn't match?", a: "You have a verification window after delivery to inspect the item. If it doesn't match this agreement, you can raise a dispute with evidence. SafeDeal will review and mediate fairly." },
              { q: "When does the seller receive payment?", a: "The seller receives payment only after you confirm the item matches the agreement, or after the verification window expires without a dispute." },
              { q: "Is my payment information secure?", a: "Yes. SafeDeal uses bank-level 256-bit SSL encryption and is PCI DSS compliant. Your payment information is never shared with the seller." },
            ].map((faq) => (
              <Card key={faq.q}>
                <CardContent className="p-6">
                  <div className="flex items-start gap-3">
                    <HelpCircle className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                    <div>
                      <h4 className="text-base font-bold text-foreground mb-2">{faq.q}</h4>
                      <p className="text-sm text-muted-foreground">{faq.a}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <Footer />

      {/* Decline Confirmation Dialog */}
      <AlertDialog open={showDeclineDialog} onOpenChange={setShowDeclineDialog}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-xl">
              <Ban className="h-6 w-6 text-destructive" />
              Cancel this transaction?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base leading-relaxed pt-2">
              Are you sure you want to cancel this transaction? This action <span className="font-semibold text-foreground">cannot be undone</span>. 
              The transaction will be permanently terminated and the seller will be notified.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="pt-4">
            <AlertDialogCancel disabled={isDeclineLoading} className="rounded-xl">
              No, keep it
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDecline}
              disabled={isDeclineLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl"
            >
              {isDeclineLoading ? "Cancelling..." : "Yes, cancel transaction"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ─── Sub-components ─── */

function ReviewHeader() {
  return (
    <header className="sticky top-0 z-sticky w-full border-b bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity min-h-11">
          <Shield className="h-7 w-7 text-primary" />
          <span className="text-xl font-bold text-foreground">SafeDeal</span>
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}

function SellerIdentityCard({ data }: { data: ReviewData }) {
  const seller = data.seller;
  const v = data.sellerVerification;
  if (!seller) return null;

  const memberSince = seller.member_since ? format(new Date(seller.member_since), "MMM yyyy") : "N/A";

  return (
    <Card className="rounded-2xl shadow-lg">
      <CardContent className="p-6">
        <div className="flex items-center gap-2 mb-4 pb-4 border-b">
          <Store className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold text-foreground">Seller Information</h2>
        </div>
        <div className="flex items-start gap-4 mb-6">
          <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center border-2 border-border shrink-0">
            {seller.avatar_url ? (
              <img src={seller.avatar_url} alt={seller.full_name} className="w-full h-full rounded-xl object-cover" />
            ) : (
              <Store className="h-8 w-8 text-primary" />
            )}
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-foreground mb-1">{seller.full_name}</h3>
            <p className="text-sm text-muted-foreground mb-3">Member since {memberSince}</p>
            <div className="flex flex-wrap gap-2">
              {resolveClaim("SELLER_ID_VERIFIED", { identityVerified: v?.identity_verified }) && (
                <Badge className="bg-success/10 text-success border-success/30 hover:bg-success/10">
                  <CheckCircle className="h-3 w-3 mr-1" /> {resolveClaim("SELLER_ID_VERIFIED", { identityVerified: v?.identity_verified })}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Trust profile grid */}
        <div className="bg-success/5 rounded-xl p-5 border-2 border-success/20 mb-4">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-success rounded-lg flex items-center justify-center">
              <ShieldCheck className="h-4 w-4 text-success-foreground" />
            </div>
            <h4 className="text-base font-bold text-foreground">{alwaysClaim("SELLER_TRUST_PROFILE_HEADING")}</h4>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <VerificationTile
              icon={IdCard} label="Identity"
              verified={v?.identity_verified ?? false}
              detail={v?.identity_verified ? "Government ID confirmed" : "Not verified"}
            />
            <VerificationTile
              icon={Phone} label="Phone"
              verified={v?.phone_verified ?? false}
              detail={v?.phone_verified ? "SMS authenticated" : "Not verified"}
            />
            <VerificationTile
              icon={Building2} label="Payout"
              verified={v?.payout_verified ?? false}
              detail={v?.payout_verified ? "Bank account linked" : "Not verified"}
            />
            <div className="bg-card rounded-lg p-3 border border-primary/20">
              <div className="flex items-center gap-2 mb-1">
                <CalendarDays className="h-4 w-4 text-primary" />
                <span className="text-xs font-bold text-foreground uppercase">Member Since</span>
              </div>
              <p className="text-sm font-bold text-foreground">{memberSince}</p>
            </div>
          </div>
        </div>

        {v?.identity_verified && v?.phone_verified && v?.payout_verified && (
          <div className="bg-success/10 border border-success/20 rounded-xl p-3">
            <div className="flex items-center gap-2 text-sm text-success">
              <ShieldCheck className="h-4 w-4" />
              <span className="font-semibold">This seller has completed full SafeDeal verification</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function VerificationTile({ icon: Icon, label, verified, detail }: { icon: React.ElementType; label: string; verified: boolean; detail: string }) {
  return (
    <div className={`bg-card rounded-lg p-3 border ${verified ? "border-success/20" : "border-border"}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`h-4 w-4 ${verified ? "text-success" : "text-muted-foreground"}`} />
        <span className="text-xs font-bold text-foreground uppercase">{label}</span>
      </div>
      <div className="flex items-center gap-1">
        {verified ? <CheckCircle className="h-3 w-3 text-success" /> : <XCircle className="h-3 w-3 text-muted-foreground" />}
        <span className={`text-sm font-bold ${verified ? "text-success" : "text-muted-foreground"}`}>
          {verified ? "Verified" : "Pending"}
        </span>
      </div>
      <p className="text-xs text-muted-foreground mt-1">{detail}</p>
    </div>
  );
}

function ItemDetailsCard({ data }: { data: ReviewData }) {
  const item = data.item;
  if (!item) return null;

  return (
    <Card className="rounded-2xl shadow-lg overflow-hidden">
      <div className="p-6 border-b">
        <div className="flex items-center gap-2 mb-4">
          <Package className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold text-foreground">Item Details</h2>
        </div>
        <h3 className="text-2xl font-bold text-foreground mb-2">{item.title}</h3>
        <p className="text-muted-foreground leading-relaxed">{item.description}</p>
      </div>

      {/* Media gallery — reuses the shared component (handles videos + lightbox) */}
      {data.media && data.media.length > 0 && (
        <div className="p-6 bg-muted">
          <ProductMediaGallery
            title={item.title}
            media={data.media.map((m) => ({
              file_url: m.files?.file_url ?? null,
              secure_url: m.files?.secure_url ?? null,
              mime_type: m.files?.mime_type ?? null,
              media_type: m.media_type ?? null,
            }))}
          />
        </div>
      )}

      <div className="p-6">
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-muted rounded-xl p-4 border text-center">
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Quantity</p>
            <p className="text-lg font-bold text-foreground">{item.quantity}</p>
          </div>
          <div className="bg-muted rounded-xl p-4 border text-center">
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Condition</p>
            <p className="text-lg font-bold text-success">{item.condition_label}</p>
          </div>
          <div className="bg-muted rounded-xl p-4 border text-center">
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Warranty</p>
            <p className="text-base font-bold text-foreground">{item.warranty_terms || "None"}</p>
          </div>
        </div>
      </div>
    </Card>
  );
}

function DeliveryCard({ data }: { data: ReviewData }) {
  const delivery = data.delivery;
  if (!delivery) return null;

  const formattedDate = delivery.expected_delivery_date
    ? format(new Date(delivery.expected_delivery_date), "MMMM d, yyyy")
    : "TBD";

  return (
    <Card className="rounded-2xl shadow-lg">
      <CardContent className="p-6">
        <div className="flex items-center gap-2 mb-4 pb-4 border-b">
          <Truck className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold text-foreground">Delivery & Verification</h2>
        </div>
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
              <Truck className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase">Delivery Method</p>
              <p className="text-lg font-bold text-foreground capitalize">{delivery.delivery_method.replace(/_/g, " ")}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-warning/10 rounded-lg flex items-center justify-center shrink-0">
              <CalendarDays className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase">Expected Delivery</p>
              <p className="text-lg font-bold text-foreground">{formattedDate}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-success/10 rounded-lg flex items-center justify-center shrink-0">
              <Clock className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase">Verification Window</p>
              <p className="text-lg font-bold text-foreground">{delivery.verification_window_hours} Hours</p>
              <p className="text-sm text-muted-foreground">Time to verify item after delivery</p>
            </div>
          </div>
        </div>
        <div className="mt-6 bg-primary/10 border border-primary/20 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-foreground mb-1">Verification Process</p>
              <p className="text-xs text-muted-foreground">After delivery, you'll have {delivery.verification_window_hours} hours to inspect the item and confirm it matches this agreement. If there's an issue, you can raise a dispute during this window.</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TimelineCard() {
  const steps = [
    { icon: CheckCircle, label: "Transaction Created", desc: "Agreement prepared by seller", status: "completed" as const },
    { icon: CreditCard, label: "Payment Pending", desc: "Awaiting your secure payment", status: "current" as const },
    { icon: Lock, label: "Funds Held Securely", desc: "Payment held in escrow", status: "pending" as const },
    { icon: Package, label: "Seller Fulfillment", desc: "Item processing & dispatch", status: "pending" as const },
    { icon: Truck, label: "Delivered", desc: "Item delivered to you", status: "pending" as const },
    { icon: ClipboardCheck, label: "Verification", desc: "Confirm item received", status: "pending" as const },
    { icon: CheckCircle, label: "Completed", desc: "Funds released to seller", status: "pending" as const },
  ];

  return (
    <Card className="rounded-2xl shadow-lg">
      <CardContent className="p-6">
        <div className="flex items-center gap-2 mb-6 pb-4 border-b">
          <CircleDot className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold text-foreground">Transaction Timeline</h2>
        </div>
        <div className="relative">
          <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-border" />
          {steps.map((step, i) => (
            <div key={step.label} className={`relative flex items-start gap-4 ${i < steps.length - 1 ? "mb-6" : ""}`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 z-rail shadow-lg ${
                step.status === "completed" ? "bg-success" :
                step.status === "current" ? "bg-warning animate-pulse" : "bg-muted"
              }`}>
                <step.icon className={`h-4 w-4 ${
                  step.status === "completed" ? "text-success-foreground" :
                  step.status === "current" ? "text-warning-foreground" : "text-muted-foreground"
                }`} />
              </div>
              <div className="flex-1 pt-1">
                <p className={`text-sm font-bold ${step.status === "pending" ? "text-muted-foreground" : "text-foreground"}`}>{step.label}</p>
                <p className={`text-xs ${step.status === "pending" ? "text-muted-foreground" : "text-muted-foreground"}`}>{step.desc}</p>
              </div>
              <span className={`text-xs font-medium ${
                step.status === "completed" ? "text-muted-foreground" :
                step.status === "current" ? "text-warning font-semibold" : "text-muted-foreground"
              }`}>
                {step.status === "completed" ? "Completed" : step.status === "current" ? "Current" : "Pending"}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function EscrowProtectionCard({ data, currencyCode }: { data: ReviewData; currencyCode: string }) {
  const totalAmount = data.pricing?.total_amount ?? 0;
  return (
    <div className="bg-success rounded-2xl shadow-2xl p-6 text-success-foreground border-2 border-success/40">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-10 h-10 bg-success-foreground/20 rounded-lg flex items-center justify-center">
          <Shield className="h-5 w-5" />
        </div>
        <h3 className="text-xl font-bold">{alwaysClaim("ESCROW_PROTECTION_HEADING")}</h3>
      </div>
      <div className="space-y-4 mb-6">
        {[
          { icon: Lock, title: "Your Payment is Held Securely", desc: `SafeDeal holds your ${formatMoney(totalAmount, currencyCode)} in a secure escrow account. The seller cannot access these funds yet.` },
          { icon: HandCoins, title: "Seller Paid Only After Confirmation", desc: "The seller receives payment only when you confirm the item matches this agreement." },
          { icon: Scale, title: "SafeDeal Steps In If Needed", desc: "If you raise a dispute, SafeDeal reviews evidence from both parties and makes a fair decision." },
        ].map((item) => (
          <div key={item.title} className="bg-success-foreground/10 backdrop-blur-sm rounded-xl p-4 border border-success-foreground/20">
            <div className="flex items-start gap-3">
              <item.icon className="h-6 w-6 mt-1 shrink-0" />
              <div>
                <p className="font-bold mb-1">{item.title}</p>
                <p className="text-sm opacity-90">{item.desc}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="bg-success-foreground/20 rounded-xl p-3 border border-success-foreground/30">
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle className="h-4 w-4" />
          <span className="font-bold">Payment and dispute terms recorded</span>
        </div>
      </div>
    </div>
  );
}

function FraudWarningCard() {
  return (
    <div className="bg-destructive rounded-2xl shadow-2xl border-4 border-destructive/80 p-6 text-destructive-foreground">
      <div className="flex items-start gap-4 mb-4">
        <div className="w-14 h-14 bg-card rounded-xl flex items-center justify-center shrink-0">
          <AlertTriangle className="h-7 w-7 text-destructive animate-pulse" />
        </div>
        <div>
          <h3 className="text-xl font-bold mb-1">CRITICAL: Never Pay Outside SafeDeal</h3>
          <p className="text-sm opacity-80">This warning protects you from fraud and scams</p>
        </div>
      </div>
      <div className="space-y-3 mb-5">
        {[
          { icon: X, title: "NEVER pay the seller directly", desc: "Do not use bank transfer, PayPal, cash apps, wire transfer, or cryptocurrency" },
          { icon: ShieldAlert, title: "Off-platform payment is outside SafeDeal", desc: "SafeDeal cannot review or reconcile payments made outside its checkout" },
          { icon: User, title: "SafeDeal holds your payment securely", desc: "Only pay through SafeDeal's secure payment system on this page" },
        ].map((item) => (
          <div key={item.title} className="bg-destructive-foreground/10 backdrop-blur-sm rounded-lg p-4 border-2 border-destructive-foreground/30">
            <div className="flex items-start gap-3">
              <item.icon className="h-6 w-6 mt-0.5 shrink-0" />
              <div>
                <p className="font-bold text-base mb-1">{item.title}</p>
                <p className="text-sm opacity-80">{item.desc}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="bg-destructive-foreground/10 rounded-lg p-3 border-2 border-destructive-foreground/40">
        <div className="flex items-center gap-2 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <p className="font-bold">If a seller asks you to pay outside SafeDeal, report them immediately</p>
        </div>
      </div>
    </div>
  );
}

function NextActionCard({ payLabel, onPay, onDecline, authState, canPay, lockReason, onGoToProfile, onGoToTransactions }: {
  payLabel: string; onPay: () => void; onDecline: () => void; authState: AuthState; canPay: boolean; lockReason: string | null; onGoToProfile: () => void; onGoToTransactions: () => void;
}) {
  const isLocked = !canPay && authState === "ready";
  const lockedCtaLabel =
    lockReason === "region" ? "Update Location to Continue"
    : lockReason === "concurrency" ? "View My Transactions"
    : "Verify Account to Continue";
  const lockedCtaAction = lockReason === "concurrency" ? onGoToTransactions : onGoToProfile;

  return (
    <div className="bg-primary rounded-2xl shadow-2xl p-6 text-primary-foreground">
      <div className="flex items-center gap-2 mb-4">
        <span className="w-2 h-2 bg-primary-foreground rounded-full animate-pulse" />
        <span className="text-xs font-bold uppercase tracking-wider">Next Action Required</span>
      </div>

      {isLocked && (
        <div className="bg-destructive/20 border border-destructive/40 rounded-xl p-4 mb-4">
          <div className="flex items-start gap-2">
            <Lock className="h-5 w-5 mt-0.5 shrink-0" />
            <div>
              {lockReason === "region" ? (
                <>
                  <p className="text-sm font-bold">Lagos-only during launch</p>
                  <p className="text-xs opacity-80 mt-1">Protected transactions are only available in Lagos. Update your location to a valid Lagos LGA.</p>
                </>
              ) : lockReason === "concurrency" ? (
                <>
                  <p className="text-sm font-bold">Active purchase limit reached</p>
                  <p className="text-xs opacity-80 mt-1">Complete or resolve existing transactions first.</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-bold">Verification required</p>
                  <p className="text-xs opacity-80 mt-1">Complete phone verification and location to unlock payments.</p>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <h3 className="text-xl font-bold mb-2">
        {isLocked ? "Action Needed Before Payment" : authState === "anonymous" ? "Sign Up to Pay Securely" : "Pay Securely"}
      </h3>
      <p className="text-sm opacity-80 mb-6">
        {isLocked
          ? "Resolve the issue above to unlock the secure payment for this transaction."
          : "Complete your payment to lock this agreement and begin the transaction."}
      </p>

      {isLocked ? (
        <Button
          onClick={lockedCtaAction}
          className="w-full bg-primary-foreground text-primary font-bold py-6 rounded-xl hover:bg-primary-foreground/90 shadow-lg mb-4"
          size="lg"
        >
          <User className="h-5 w-5" />
          {lockedCtaLabel}
        </Button>
      ) : (
        <Button
          onClick={onPay}
          className="w-full bg-primary-foreground text-primary font-bold py-6 rounded-xl hover:bg-primary-foreground/90 shadow-lg mb-4"
          size="lg"
        >
          <Lock className="h-5 w-5" />
          {payLabel}
        </Button>
      )}
      <Button
        onClick={onDecline}
        variant="outline"
        className="w-full border-2 border-primary-foreground/30 text-primary-foreground bg-transparent hover:bg-primary-foreground/10 py-5 rounded-xl"
        size="lg"
      >
        <X className="h-4 w-4" />
        Decline Transaction
      </Button>
      <div className="mt-4 pt-4 border-t border-primary-foreground/20">
        <p className="text-xs text-center opacity-70">
          <Info className="h-3 w-3 inline mr-1" />
          Payment is processed securely. Funds held until you confirm receipt.
        </p>
      </div>
    </div>
  );
}

function PaymentSummaryCard({ data, currencyCode, itemAmount, feeAmount, feeRate, totalAmount }: {
  data: ReviewData; currencyCode: string; itemAmount: number; feeAmount: number; feeRate: number; totalAmount: number;
}) {
  return (
    <Card className="rounded-2xl shadow-lg">
      <CardContent className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <CreditCard className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-bold text-foreground">Payment Summary</h3>
        </div>
        <div className="space-y-3 mb-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Item Price</span>
            <span className="font-semibold text-foreground">{formatMoney(itemAmount, currencyCode)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{FEE_NAME} ({(feeRate * 100).toFixed(1)}%)</span>
            <span className="font-semibold text-foreground">{formatMoney(feeAmount, currencyCode)}</span>
          </div>
          <p className="text-xs text-muted-foreground -mt-1">{FEE_CAPTION}</p>
          <div className="border-t pt-3" />
          <div className="flex justify-between items-center">
            <span className="text-base font-bold text-foreground">Total Amount</span>
            <span className="text-2xl font-bold text-primary">{formatMoney(totalAmount, currencyCode)}</span>
          </div>
        </div>
        <div className="bg-success/10 border border-success/20 rounded-xl p-3">
          <div className="flex items-center gap-2 text-xs text-success">
            <ShieldCheck className="h-4 w-4" />
            <span className="font-semibold">Payment and dispute terms</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ProtectionFeaturesCard({ data }: { data: ReviewData }) {
  // The verification window is agreement data. Absent means unknown — never
  // narrate an invented duration to the buyer.
  const window = data.delivery?.verification_window_hours ?? null;
  return (
    <Card className="rounded-2xl shadow-lg">
      <CardContent className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="h-5 w-5 text-success" />
          <h3 className="text-lg font-bold text-foreground">Your Protection</h3>
        </div>
        <div className="space-y-4">
          {[
            { icon: Lock, title: "Funds Held in Escrow", desc: "Payment secured until you confirm receipt", color: "text-success", bg: "bg-success/10" },
            { icon: FileText, title: "Immutable Agreement", desc: "Terms locked after payment", color: "text-primary", bg: "bg-primary/10" },
            { icon: Clock, title: window === null ? "Verification Window" : `${window}-Hour Verification`, desc: "Time to inspect and confirm", color: "text-warning", bg: "bg-warning/10" },
            { icon: Scale, title: "Dispute Resolution", desc: "Fair mediation if needed", color: "text-destructive", bg: "bg-destructive/10" },
          ].map((f) => (
            <div key={f.title} className="flex items-start gap-3">
              <div className={`w-8 h-8 ${f.bg} rounded-lg flex items-center justify-center shrink-0`}>
                <f.icon className={`h-4 w-4 ${f.color}`} />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{f.title}</p>
                <p className="text-xs text-muted-foreground">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function TrustIndicatorsCard() {
  return (
    <div className="bg-foreground rounded-2xl shadow-lg p-6 text-background">
      <div className="flex items-center gap-2 mb-4">
        <Award className="h-5 w-5 text-warning" />
        <h3 className="text-base font-bold">Payment controls</h3>
      </div>
      <div className="space-y-3">
        {["256-bit SSL Encryption", "PCI DSS Compliant", "24/7 Transaction Monitoring"].map((label) => (
          <div key={label} className="flex items-center gap-2 text-sm">
            <CheckCircle className="h-4 w-4 text-success" />
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
