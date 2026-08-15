import { useParams, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useCallback } from "react";
import {
  Shield, Lock, ShieldCheck, CreditCard, AlertTriangle,
  CheckCircle, Clock, Package, Truck, ClipboardCheck,
  Store, Info, ArrowLeft, Loader2, XCircle, Building2,
  Star, User, ArrowRight, FileText, MapPin, Receipt,
  ListChecks, BarChart3, AlertCircle, Check, Circle,
  Headphones, Eye, RotateCcw, Check as CheckIcon
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { alwaysClaim, resolveClaim, isTrackedDelivery } from "@/lib/trust/trust-claims";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Footer } from "@/components/landing/Footer";
import { toast } from "@/components/ui/sonner";
import { getTransactionReview, type ReviewData } from "@/services/review.service";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { describeChargedFee } from "@/lib/pricing";
import { resolveAppliedCap } from "@/types/payment-flow.types";
import { ChevronDown } from "lucide-react";
import { getBuyerProfile } from "@/services/profile.service";
import { supabase } from "@/integrations/supabase/client";
import { BuyerNav } from "@/components/dashboard/BuyerNav";
import { useBuyerIdentity } from "@/hooks/useBuyerIdentity";
import { formatMoney } from "@/lib/format";
import { TerminalTransactionScreen, deriveTerminalStatus } from "@/components/transactions/TerminalTransactionScreen";
import { FEE_NAME, FEE_CAPTION, REFUND_BULLET } from "@/lib/payment/fee-policy";
import { keyActivate } from "@/lib/a11y";

declare global {
  interface Window {
    PaystackPop: {
      setup: (options: {
        key: string;
        access_code: string;
        email?: string;
        amount?: number;
        onClose: () => void;
        callback: (response: { reference: string; [key: string]: unknown }) => void;
      }) => { openIframe: () => void };
    };
  }
}

type AuthState = "loading" | "anonymous" | "needs-role" | "ready";

function PaymentHeader() {
  return (
    <header className="bg-card border-b sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <Shield className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-2xl font-bold text-foreground">SafeDeal</span>
          </div>
        </div>
      </div>
    </header>
  );
}

export default function BuyerPaymentSummary() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const navigate = useNavigate();
  const [authState, setAuthState] = useState<AuthState>("loading");
  const { buyerName, avatarUrl } = useBuyerIdentity();
  const [selectedMethod, setSelectedMethod] = useState<"card" | "bank">("card");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showFailed, setShowFailed] = useState(false);
  const [failureReason, setFailureReason] = useState<string>("");
  const [failureTerminal, setFailureTerminal] = useState<null | "cancelled" | "expired" | "completed" | "disputed" | "refunded" | "paid">(null);
  const [failureBlocker, setFailureBlocker] = useState<null | "concurrency">(null);
  const [paystackLoaded, setPaystackLoaded] = useState(false);

  // Load Paystack Inline JS
  useEffect(() => {
    if (document.getElementById("paystack-inline-js")) {
      setPaystackLoaded(true);
      return;
    }
    const script = document.createElement("script");
    script.id = "paystack-inline-js";
    script.src = "https://js.paystack.co/v1/inline.js";
    script.async = true;
    script.onload = () => setPaystackLoaded(true);
    script.onerror = () => console.error("Failed to load Paystack inline.js");
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setAuthState("anonymous"); return; }
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

  useEffect(() => {
    if (authState === "anonymous") {
      navigate(`/auth?redirect=/t/${shareToken}/pay`);
    } else if (authState === "needs-role") {
      navigate(`/role-selection?redirect=/t/${shareToken}/pay`);
    }
  }, [authState, navigate, shareToken]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["transaction-review", shareToken],
    queryFn: () => getTransactionReview(shareToken!),
    enabled: !!shareToken,
  });

  // Fetch buyer verification status for payment gating
  const { data: profileData } = useQuery({
    queryKey: ["buyer-profile"],
    queryFn: getBuyerProfile,
    enabled: authState === "ready",
  });

  const permissions = profileData?.permissions;
  // Fail closed: if the permission check has not resolved, payment stays blocked.
  const canPay = permissions?.canStartProtectedPayment === true;

  // Determine specific lock reason for context-aware messaging
  const lockReason = !canPay && permissions ? (
    !permissions.isRegionEligible && permissions.verificationLevel !== "unverified"
      ? "region"
      : permissions.requiresPhoneVerification || permissions.requiresLocation
        ? "verification"
        : !permissions.canCreateAnotherActiveTransaction
          ? "concurrency"
          : "verification"
  ) : null;
  /** No permissions payload yet — we cannot prove the buyer may pay. */
  const permissionsUnavailable = !canPay && !permissions;

  const Header = authState === "ready"
    ? () => <BuyerNav buyerName={buyerName} avatarUrl={avatarUrl} />
    : PaymentHeader;

  const openPaystackPayment = useCallback(async () => {
    if (!paystackLoaded || !window.PaystackPop) {
      toast.error("Payment system is still loading. Please wait a moment and try again.");
      return;
    }

    setIsProcessing(true);
    setFailureReason("");
    setFailureTerminal(null);
    setFailureBlocker(null);

    try {
      const { data: initData, error: initError } = await supabase.functions.invoke(
        "initiate-paystack-payment",
        { body: { shareToken, paymentMethod: selectedMethod } }
      );

      if (initError || initData?.error) {
        // The Supabase JS SDK swallows the JSON error body on non-2xx and
        // gives a generic "Edge Function returned a non-2xx status code".
        // Reach into `initError.context` (a Response object) to pull the
        // real `{ error: "…" }` payload.
        let errMsg = initData?.error || initError?.message || "Failed to initialize payment";
        if (!initData?.error && initError && (initError as any).context?.json) {
          try {
            const ctx = await (initError as any).context.json();
            if (ctx?.error) errMsg = ctx.error;
          } catch {
            /* keep generic message */
          }
        }
        // If transaction is already paid, show success instead of failed
        if (errMsg.includes("payment_secured") || errMsg.includes("funds_held_in_escrow")) {
          setIsProcessing(false);
          setShowFailed(false);
          setShowSuccess(true);
          return;
        }
        // Detect "Invalid state: status=<terminal>" so we can swap Retry
        // for a recovery CTA in the failure modal.
        const m = /Invalid state: status=([a-z_]+)/i.exec(errMsg);
        if (m) {
          const t = deriveTerminalStatus(m[1]);
          if (t) setFailureTerminal(t);
        }
        // Detect the concurrent-active-transactions cap so the modal can
        // route the buyer to their transactions list instead of offering
        // a retry that will fail with the same error.
        if (/active purchase limit/i.test(errMsg)) {
          setFailureBlocker("concurrency");
        }
        setFailureReason(errMsg);
        setIsProcessing(false);
        setShowFailed(true);
        return;
      }

      const handler = window.PaystackPop.setup({
        key: initData.public_key,
        access_code: initData.access_code,
        email: initData.email,
        amount: initData.amount,
        callback: function(response: { reference: string }) {
          supabase.functions.invoke("verify-paystack-payment", {
            body: { reference: response.reference, provider_reference: initData.reference },
          }).then(({ data: verifyData, error: verifyError }) => {
            if (verifyError || verifyData?.error) {
              setFailureReason(verifyData?.error || verifyError?.message || "Payment verification failed");
              setIsProcessing(false);
              setShowFailed(true);
              return;
            }
            setIsProcessing(false);
            setShowSuccess(true);
          }).catch((verifyErr) => {
            console.error("Verification error:", verifyErr);
            setFailureReason("Payment verification failed. If you were charged, your payment is safe — please contact support.");
            setIsProcessing(false);
            setShowFailed(true);
          });
        },
        onClose: () => {
          setIsProcessing(false);
          toast.info("Payment window was closed. You can try again when ready.");
        },
      });

      handler.openIframe();
    } catch (err) {
      console.error("Payment error:", err);
      setFailureReason((err as Error).message || "An unexpected error occurred");
      setIsProcessing(false);
      setShowFailed(true);
    }
  }, [paystackLoaded, shareToken, selectedMethod]);

  const handlePay = useCallback(async () => {
    if (!agreedToTerms) {
      toast.error("Please agree to the escrow payment terms before proceeding.");
      return;
    }
    openPaystackPayment();
  }, [agreedToTerms, openPaystackPayment]);

  const handleRetryPay = useCallback(() => {
    setShowFailed(false);
    setFailureTerminal(null);
    setFailureBlocker(null);
    openPaystackPayment();
  }, [openPaystackPayment]);

  if (authState === "loading" || authState === "anonymous" || authState === "needs-role") {
    return (
      <div className="min-h-[100dvh] bg-background px-4 py-8">
        <div className="mx-auto max-w-5xl space-y-6">
          <Skeleton className="h-14 w-full rounded-xl" />
          <div className="grid gap-6 lg:grid-cols-3"><Skeleton className="h-96 rounded-2xl lg:col-span-2" /><Skeleton className="h-72 rounded-2xl" /></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <AlertTriangle className="h-16 w-16 text-destructive mx-auto mb-4" />
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
        <div className="max-w-5xl mx-auto px-4 py-8 w-full space-y-6">
          <Skeleton className="h-12 w-full rounded-xl" />
          <div className="grid lg:grid-cols-3 gap-8">
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

  // Terminal-status guard: if the transaction is no longer payable (cancelled,
  // expired, completed, etc.) show a recovery screen instead of the pay UI.
  // Stale share links that point at long-dead transactions land here.
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

  // MONEY MUST NOT FAIL TO ZERO. Without a complete pricing snapshot we cannot
  // prove what the buyer owes, so the payment screen is blocked with an honest
  // error instead of rendering "Pay ₦0.00".
  const snapshot = data.pricing;
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const currency = snapshot?.currency_code || null;
  const total = num(snapshot?.total_amount);
  const item = num(snapshot?.item_amount);
  const fee = num(snapshot?.service_fee_amount);
  const rate = num(snapshot?.service_fee_rate);
  const platformFee = num(snapshot?.platform_fee_amount);
  const pricingUnavailable =
    !snapshot ||
    !currency ||
    total === null ||
    total <= 0 ||
    item === null ||
    fee === null ||
    rate === null ||
    platformFee === null;

  if (pricingUnavailable) {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center px-4 py-16">
          <div className="max-w-md w-full text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <h1 className="text-xl font-bold text-foreground">We can't show the amount for this payment</h1>
            <p className="text-sm text-muted-foreground">
              The priced agreement for transaction {data.transaction.transaction_code} is incomplete, so we cannot
              confirm what you would be charged. Payment is blocked until the seller re-issues the agreement.
              Nothing has been charged.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
              <Button variant="outline" onClick={() => navigate("/buyer/transactions")}>
                <ArrowLeft className="h-4 w-4 mr-2" /> My transactions
              </Button>
              <Button onClick={() => navigate("/contact")}>
                <Headphones className="h-4 w-4 mr-2" /> Contact support
              </Button>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const currencyCode: string = currency!;
  const totalAmount: number = total!;
  const itemAmount: number = item!;
  const feeAmount: number = fee!;
  const feeRate: number = rate!;
  const platformFeeAmount: number = platformFee!;

  // Cap facts come from the persisted snapshot only. A fee that merely looks
  // large is not evidence that a ceiling applied.
  const isFeeCapped = data.pricing?.is_total_service_fee_capped === true;
  const appliedCap = resolveAppliedCap({
    pricing_model_version: data.pricing?.pricing_model_version,
    service_fee_amount: feeAmount,
    safedeal_fee_amount: platformFeeAmount,
  });
  // No invented window: when the server has not set one, say nothing.
  const verificationHours = data.delivery?.verification_window_hours ?? null;
  const courierTracked = isTrackedDelivery(data.delivery?.delivery_method);

  const firstMediaUrl = data.media?.[0]?.files?.secure_url || data.media?.[0]?.files?.file_url;

  return (
    <div className="min-h-[100dvh] bg-muted flex flex-col">
      <Header />

      {/* Context-aware Lock Banner */}
      {!canPay && (
        <section className="bg-destructive/10 border-b border-destructive/20 py-4">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Lock className="h-5 w-5 text-destructive shrink-0" />
                <div>
                  {permissionsUnavailable ? (
                    <>
                      <p className="text-sm font-bold text-foreground">We couldn't confirm your account status</p>
                      <p className="text-xs text-muted-foreground">Payment is blocked until your account checks load. Refresh the page or open Profile Settings.</p>
                    </>
                  ) : lockReason === "region" ? (
                    <>
                      <p className="text-sm font-bold text-foreground">Protected transactions are only available in Lagos during launch</p>
                      <p className="text-xs text-muted-foreground">Update your location to a Lagos LGA in Profile Settings</p>
                    </>
                  ) : lockReason === "concurrency" ? (
                    <>
                      <p className="text-sm font-bold text-foreground">You've reached your active purchase limit{permissions?.maxConcurrentActiveTransactions == null ? "" : ` (${permissions.maxConcurrentActiveTransactions})`}</p>
                      <p className="text-xs text-muted-foreground">Complete or resolve existing transactions before starting a new one</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-bold text-foreground">Account verification required to proceed with payment</p>
                      <p className="text-xs text-muted-foreground">Complete phone verification and location in your profile to unlock protected payments</p>
                    </>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="text-primary border-primary/30 shrink-0"
                onClick={() => navigate("/dashboard/profile")}
              >
                Go to Profile Settings
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* Trust banner */}
      <section className="bg-gradient-to-r from-success to-success/90 py-3">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center gap-3 text-success-foreground">
            <ShieldCheck className="h-5 w-5 animate-pulse" />
            <p className="text-sm font-semibold">Your payment will be held securely until you confirm the item received</p>
            <Lock className="h-4 w-4" />
          </div>
        </div>
      </section>

      {/* Transaction header */}
      <section className="bg-card border-b py-6">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary">
                  <FileText className="h-3 w-3 mr-1" />
                  Transaction #{data.transaction.transaction_code}
                </span>
              </div>
              <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Secure Payment</h1>
              <p className="text-muted-foreground mt-1">Complete your payment to lock the transaction agreement</p>
            </div>
          </div>
        </div>
      </section>

      {/* Main content */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left column */}
          <div className="lg:col-span-2 space-y-6">

            {/* Escrow Protection - Gradient Hero Card */}
            <div className="bg-gradient-to-br from-primary to-primary/80 rounded-2xl shadow-lg p-6 text-primary-foreground">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-primary-foreground/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                  <Shield className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">Payment setup</h2>
                  <p className="text-primary-foreground/70 text-sm">Creating secure escrow transaction</p>
                </div>
              </div>

              {/* 4-step flow */}
              <div className="bg-primary-foreground/10 backdrop-blur-sm rounded-xl p-5 mb-4">
                {[
                  { icon: User, step: "Step 1", label: "You Pay SafeDeal", showArrow: true },
                  { icon: Lock, step: "Step 2", label: "Escrow Created & Funds Held", showArrow: true },
                  { icon: Clock, step: "Step 3", label: "Seller Not Paid Yet", showArrow: true },
                  { icon: CheckCircle, step: "Step 4", label: "Paid After Your Confirmation", showArrow: false },
                ].map((s, i) => (
                  <div key={i} className={`flex items-center justify-between ${i < 3 ? "mb-6" : ""}`}>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-primary-foreground/20 rounded-lg flex items-center justify-center shrink-0">
                        <s.icon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-xs text-primary-foreground/60">{s.step}</p>
                        <p className="font-semibold text-sm">{s.label}</p>
                      </div>
                    </div>
                    {s.showArrow && <ArrowRight className="h-5 w-5 opacity-60" />}
                  </div>
                ))}
              </div>

              {/* Critical callout */}
              <div className="bg-primary-foreground/15 backdrop-blur-sm rounded-xl p-4 mb-4 border border-primary-foreground/20">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="font-bold text-sm mb-2">Critical: Seller is NOT paid immediately</p>
                    <p className="text-xs text-primary-foreground/80">Your payment creates an escrow account. Funds remain locked until you verify the item received matches the agreement. The seller cannot access the money without your confirmation.</p>
                  </div>
                </div>
              </div>

              {/* Checkmarks */}
              <div className="space-y-3 text-sm">
                {[
                  "Seller is only paid after you confirm receipt",
                  "If you raise a dispute, fund release is paused",
                  "SafeDeal reviews disputes before final decision",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-success/70 mt-0.5 shrink-0" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Current Status */}
            <div className="bg-card rounded-2xl shadow-lg border p-6">
              <div className="flex items-center gap-2 mb-6 pb-4 border-b">
                <BarChart3 className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-bold text-foreground">Current Status</h2>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="bg-warning/10 border border-warning/30 rounded-xl p-4">
                  <p className="text-xs text-warning font-semibold mb-2">Transaction Status</p>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-warning" />
                    <span className="text-base font-bold text-foreground">Awaiting Payment</span>
                  </div>
                  <p className="text-xs text-warning mt-2">Escrow not yet created</p>
                </div>

                <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4">
                  <p className="text-xs text-destructive font-semibold mb-2">Money Status</p>
                  <div className="flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-destructive" />
                    <span className="text-base font-bold text-foreground">Not Yet Secured</span>
                  </div>
                  <p className="text-xs text-destructive mt-2">Funds not in escrow</p>
                </div>
              </div>

              <div className="mt-4 bg-muted rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground mb-1">Required Action</p>
                    <p className="text-xs text-muted-foreground">Complete payment to create escrow account and secure funds. The transaction agreement will lock immediately after payment is processed.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* What Happens After Payment */}
            <div className="bg-card rounded-2xl shadow-lg border p-6">
              <div className="flex items-center gap-2 mb-6 pb-4 border-b">
                <ListChecks className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-bold text-foreground">What Happens After Payment?</h2>
              </div>

              <div className="space-y-5">
                {[
                  {
                    step: 1,
                    title: "Payment Secured in Escrow",
                    desc: `Your ${formatMoney(totalAmount, currencyCode)} payment is immediately placed in a secure escrow account managed by SafeDeal. The seller cannot access these funds.`,
                    bgClass: "bg-success/10",
                    textClass: "text-success",
                  },
                  {
                    step: 2,
                    title: "Agreement Permanently Locked",
                    desc: "The transaction agreement becomes permanently locked. No changes can be made to item details, price, delivery terms, or any other conditions.",
                    bgClass: "bg-primary/10",
                    textClass: "text-primary",
                  },
                  {
                    step: 3,
                    title: "Seller Notified to Fulfill Order",
                    desc: courierTracked
                      ? "The seller is notified to begin fulfillment and provide courier details under the agreed terms."
                      : "The seller is notified to begin fulfillment under the selected delivery terms.",
                    bgClass: "bg-primary/10",
                    textClass: "text-primary",
                  },
                  {
                    step: 4,
                    title: resolveClaim("DELIVERY_TRACKED", { deliveryMethod: courierTracked ? "courier" : null }) ?? "Delivery updates",
                    desc: [
                      courierTracked
                        ? "Courier details are required."
                        : "Follow the selected handover terms.",
                      verificationHours
                        ? `After delivery, you have ${verificationHours} hours to inspect the item.`
                        : "After delivery, you can inspect the item before the payment is released.",
                    ].join(" "),
                    bgClass: "bg-primary/10",
                    textClass: "text-primary",
                  },
                ].map((s) => (
                  <div key={s.step} className="flex items-start gap-4">
                    <div className={`w-10 h-10 ${s.bgClass} rounded-lg flex items-center justify-center shrink-0`}>
                      <span className={`font-bold ${s.textClass}`}>{s.step}</span>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-base font-bold text-foreground mb-1">{s.title}</h3>
                      <p className="text-sm text-muted-foreground">{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 bg-primary/5 border border-primary/20 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground mb-1">Disputes and release</p>
                    <p className="text-xs text-muted-foreground">If the item doesn't match the agreement, you can raise a dispute. Funds remain in escrow until the dispute is resolved by the SafeDeal review team.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Payment Summary */}
            <div className="bg-card rounded-2xl shadow-lg border p-6">
              <div className="flex items-center gap-2 mb-6 pb-4 border-b">
                <Receipt className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-bold text-foreground">Payment Summary</h2>
              </div>

              {/* Item preview */}
              <div className="flex items-start gap-4 pb-4 border-b mb-4">
                {firstMediaUrl ? (
                  <div className="w-20 h-20 rounded-xl overflow-hidden shrink-0 bg-muted">
                    <img src={firstMediaUrl} alt={data.item?.title || "Item"} className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="w-20 h-20 bg-muted rounded-xl flex items-center justify-center shrink-0">
                    <Package className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1">
                  <h3 className="text-base font-bold text-foreground mb-1">{data.item?.title || "Item"}</h3>
                  <p className="text-sm text-muted-foreground mb-2 line-clamp-1">{data.item?.description}</p>
                  <div className="flex items-center gap-2">
                    {data.item?.condition_label && (
                      <span className="text-xs px-2 py-1 bg-success/10 text-success rounded-md font-semibold">{data.item.condition_label}</span>
                    )}
                    <span className="text-xs text-muted-foreground">Quantity: {data.item?.quantity ?? 1}</span>
                  </div>
                </div>
              </div>

              {/* Price breakdown */}
              <div className="space-y-3 py-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Item Price</span>
                  <span className="text-base font-semibold text-foreground">{formatMoney(itemAmount, currencyCode)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm text-muted-foreground">{FEE_NAME}</span>
                    {isFeeCapped && (
                      <Badge variant="outline" className="text-xs px-1.5 py-0 h-4 font-medium text-amber-600 border-amber-500/30 bg-amber-500/10">capped</Badge>
                    )}
                  </div>
                  <span className="text-base font-semibold text-success">{formatMoney(feeAmount, currencyCode)}</span>
                </div>
                <p className="text-xs text-muted-foreground -mt-1 pl-0.5">{FEE_CAPTION}</p>
                <Collapsible>
                  <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors pl-0.5">
                    <ChevronDown className="h-3 w-3" />
                    How this fee is calculated
                  </CollapsibleTrigger>
                  <CollapsibleContent className="text-xs text-muted-foreground pt-1.5 pl-0.5 leading-relaxed">
                    {/* Narrated from the buyer's own snapshot — never from a
                        live config rate that may differ from what was charged. */}
                    {describeChargedFee({
                      itemAmount,
                      serviceFeeAmount: feeAmount,
                      serviceFeeRate: feeRate,
                      currencyCode,
                      isCapped: isFeeCapped,
                      appliedCapAmount: isFeeCapped ? (appliedCap?.amount ?? null) : null,
                      cappedBy: isFeeCapped ? (appliedCap?.kind ?? null) : null,
                    })}
                  </CollapsibleContent>
                </Collapsible>
              </div>

              <div className="pt-4 border-t-2">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-bold text-foreground">Total You Pay</span>
                  <span className="text-3xl font-bold text-primary">{formatMoney(totalAmount, currencyCode)}</span>
                </div>
                <p className="text-xs text-muted-foreground text-right mt-1">{data.pricing?.currency_code}</p>
              </div>

              {/* Trust block */}
              <div className="mt-6 bg-primary/5 border border-primary/20 rounded-xl p-5">
                <div className="flex items-start gap-3 mb-4">
                  <ShieldCheck className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <div className="flex-1">
                    {/* Pre-payment screen: future tense only — nothing is in escrow yet. */}
                    <p className="text-sm font-bold text-foreground mb-1">{alwaysClaim("PAYMENT_WILL_BE_ESCROWED")}</p>
                    <p className="text-xs text-muted-foreground">Once you pay, SafeDeal holds the money until you confirm the item has been received and matches the agreement. If something goes wrong, you can open a dispute and SafeDeal will review the case.</p>
                  </div>
                </div>
                <div className="space-y-2 pl-8">
                  {[
                    "Secure escrow payment",
                    "Buyer verification window",
                    "Dispute review available",
                  ].map((item) => (
                    <div key={item} className="flex items-center gap-2">
                      <CheckCircle className="h-3.5 w-3.5 text-success shrink-0" />
                      <span className="text-xs text-muted-foreground font-medium">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Payment Method */}
            <div className="bg-card rounded-2xl shadow-lg border p-6">
              <div className="flex items-center gap-2 mb-6 pb-4 border-b">
                <CreditCard className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-bold text-foreground">Payment Method</h2>
              </div>

              <div className="space-y-4">
                {/* Card method */}
                <div role="button" tabIndex={0} onKeyDown={keyActivate}
                  onClick={() => setSelectedMethod("card")}
                  className={`border-2 rounded-xl p-5 cursor-pointer transition-all ${
                    selectedMethod === "card"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className={`w-12 h-12 rounded-lg flex items-center justify-center shrink-0 ${selectedMethod === "card" ? "bg-primary/10" : "bg-muted"}`}>
                        <CreditCard className={`h-5 w-5 ${selectedMethod === "card" ? "text-primary" : "text-muted-foreground"}`} />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-foreground mb-1">Credit / Debit Card</h3>
                        <p className="text-sm text-muted-foreground mb-3">Pay securely with your card via Paystack</p>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <span className="text-xs font-bold border rounded px-1.5 py-0.5">VISA</span>
                          <span className="text-xs font-bold border rounded px-1.5 py-0.5">MC</span>
                          <span className="text-xs font-bold border rounded px-1.5 py-0.5">VERVE</span>
                        </div>
                      </div>
                    </div>
                    {/* Radio indicator */}
                    <div className={`w-6 h-6 border-2 rounded-full flex items-center justify-center shrink-0 ${selectedMethod === "card" ? "border-primary" : "border-muted-foreground/30"}`}>
                      {selectedMethod === "card" && <div className="w-3 h-3 bg-primary rounded-full" />}
                    </div>
                  </div>

                  {selectedMethod === "card" && (
                    <div className="mt-4 bg-muted rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <Lock className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                        <p className="text-sm text-muted-foreground">
                          Card details are entered securely in the Paystack payment popup. SafeDeal never sees or stores your card information.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Bank transfer method */}
                <div role="button" tabIndex={0} onKeyDown={keyActivate}
                  onClick={() => setSelectedMethod("bank")}
                  className={`border-2 rounded-xl p-5 cursor-pointer transition-all ${
                    selectedMethod === "bank"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className={`w-12 h-12 rounded-lg flex items-center justify-center shrink-0 ${selectedMethod === "bank" ? "bg-primary/10" : "bg-muted"}`}>
                        <Building2 className={`h-5 w-5 ${selectedMethod === "bank" ? "text-primary" : "text-muted-foreground"}`} />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-foreground mb-1">Bank Transfer</h3>
                        <p className="text-sm text-muted-foreground">Pay via bank transfer through Paystack</p>
                      </div>
                    </div>
                    <div className={`w-6 h-6 border-2 rounded-full flex items-center justify-center shrink-0 ${selectedMethod === "bank" ? "border-primary" : "border-muted-foreground/30"}`}>
                      {selectedMethod === "bank" && <div className="w-3 h-3 bg-primary rounded-full" />}
                    </div>
                  </div>

                  {selectedMethod === "bank" && (
                    <div className="mt-4 bg-muted rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <Building2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                        <p className="text-sm text-muted-foreground">
                          You'll receive bank transfer instructions in the Paystack payment popup. Complete the transfer to proceed.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Critical Warning */}
            <div className="bg-destructive/5 border-2 border-destructive/30 rounded-2xl shadow-md p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-6 w-6 text-destructive mt-0.5 shrink-0" />
                <div className="flex-1">
                  <h3 className="text-base font-bold text-destructive mb-2">Critical: Do Not Close the Payment Popup</h3>
                  <p className="text-sm text-foreground/80 mb-3">
                    While your payment is being processed in the Paystack popup, <strong>do not close the popup window</strong>. Doing so will interrupt the payment process.
                  </p>
                  <div className="bg-card rounded-lg p-3 border border-destructive/20">
                    <p className="text-xs font-semibold text-foreground mb-2">What to expect during processing:</p>
                    <ul className="text-xs text-foreground/70 space-y-1">
                      {[
                        "Paystack secure payment popup opens",
                        "Enter your card details or complete bank transfer",
                        "Payment authorization (5-30 seconds)",
                        "Escrow account creation (automatic)",
                        "Confirmation message displayed",
                      ].map((item) => (
                        <li key={item} className="flex items-start gap-2">
                          <Circle className="h-1.5 w-1.5 fill-current mt-1.5 shrink-0" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {/* Escrow Payment Agreement */}
            <div className="bg-muted border rounded-2xl p-5">
              <div className="flex items-start gap-3">
                <FileText className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-foreground mb-2">Escrow Payment Agreement</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                    By continuing with this payment, you understand and agree that your {formatMoney(totalAmount, currencyCode)} will be held securely by SafeDeal in a protected escrow account. These funds will <strong>not be released to the seller</strong> until you explicitly confirm receipt and verification of the item, or until a dispute is resolved by SafeDeal review.
                  </p>
                  <div className="bg-card border rounded-lg p-3 mb-3">
                    <p className="text-xs font-semibold text-foreground mb-2">You retain full control:</p>
                    <ul className="text-xs text-muted-foreground space-y-1">
                      {[
                        "Funds remain locked until your confirmation",
                        "You can raise a dispute if item doesn't match",
                        "SafeDeal reviews all disputes before fund release",
                      ].map((item) => (
                        <li key={item} className="flex items-start gap-2">
                          <Check className="h-3 w-3 text-success mt-0.5 shrink-0" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <label htmlFor="terms-checkbox" className="mt-3 flex min-h-11 cursor-pointer items-start gap-3 rounded-lg p-1 focus-within:ring-2 focus-within:ring-ring">
                    <input
                      type="checkbox"
                      id="terms-checkbox"
                      checked={agreedToTerms}
                      onChange={(e) => setAgreedToTerms(e.target.checked)}
                      className="mt-2 h-6 w-6 shrink-0 rounded border-input accent-primary relative before:absolute before:-inset-3 before:content-['']"
                    />
                    <span className="py-1 text-xs text-muted-foreground">
                      I understand that this payment creates an escrow account and funds will not be released to the seller without my confirmation
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Right column / Sidebar */}
          <div className="lg:col-span-1">
            <div className="lg:sticky lg:top-24 space-y-6">

              {/* Payment Actions */}
              <div className="bg-card rounded-2xl shadow-lg border p-6">
                <h3 className="text-lg font-bold text-foreground mb-4">Payment Actions</h3>

                {!canPay ? (
                  <button
                    onClick={() => {
                      if (permissionsUnavailable) { window.location.reload(); return; }
                      navigate(lockReason === "concurrency" ? "/dashboard/transactions" : "/dashboard/profile#location");
                    }}
                    className="w-full bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-bold py-4 rounded-xl hover:opacity-90 transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2 mb-3"
                  >
                    <User className="h-5 w-5" />
                    <span>
                      {permissionsUnavailable ? "Retry Account Check"
                        : lockReason === "region" ? "Update Location to Continue"
                        : lockReason === "concurrency" ? "View My Transactions"
                        : "Verify Account to Continue"}
                    </span>
                  </button>
                ) : (
                  <button
                    onClick={handlePay}
                    disabled={!agreedToTerms || isProcessing}
                    className="w-full bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-bold py-4 rounded-xl hover:opacity-90 transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2 mb-3 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        <span>Processing...</span>
                      </>
                    ) : (
                      <>
                        <Lock className="h-5 w-5" />
                        <span>Pay {formatMoney(totalAmount, currencyCode)}</span>
                      </>
                    )}
                  </button>
                )}

                <button
                  onClick={() => navigate(`/t/${shareToken}`)}
                  disabled={isProcessing}
                  className="w-full bg-transparent border-2 border-border text-foreground font-semibold py-3 rounded-xl hover:bg-muted transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Back to Review</span>
                </button>

                <div className="mt-6 pt-6 border-t space-y-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <ShieldCheck className="h-3.5 w-3.5 text-success" />
                    <span>SafeDeal checkout</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Lock className="h-3.5 w-3.5 text-primary" />
                    <span>Encrypted connection</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Star className="h-3.5 w-3.5 text-warning" />
                    <span>Payment form provided by Paystack</span>
                  </div>
                </div>
              </div>

              {/* Seller Information */}
              {data.seller && (
                <div className="bg-card rounded-2xl shadow-lg border p-6">
                  <h3 className="text-base font-bold text-foreground mb-4">Seller Information</h3>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-xl border-2 overflow-hidden shrink-0">
                      {data.seller.avatar_url ? (
                        <img src={data.seller.avatar_url} alt={data.seller.full_name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-primary/10 flex items-center justify-center">
                          <Store className="h-6 w-6 text-primary" />
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-foreground">{data.seller.full_name}</p>
                      {resolveClaim("SELLER_ID_VERIFIED", { identityVerified: data.sellerVerification?.identity_verified }) && (
                        <p className="text-xs text-muted-foreground">{resolveClaim("SELLER_ID_VERIFIED", { identityVerified: data.sellerVerification?.identity_verified })}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Your Protection - Green gradient */}
              <div className="bg-gradient-to-br from-success to-success/80 rounded-2xl shadow-lg p-6 text-success-foreground">
                <div className="flex items-center gap-2 mb-4">
                  <Shield className="h-6 w-6" />
                  <h3 className="text-lg font-bold">Payment terms</h3>
                </div>
                <ul className="space-y-3 text-sm">
                  {[
                    "Payment held until release conditions are met",
                    verificationHours
                      ? `${verificationHours}-hour verification window`
                      : "Verification window applies after delivery",
                    "Dispute resolution available",
                    REFUND_BULLET,
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <Check className="h-4 w-4 mt-0.5 shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Footer />

      {/* Processing Overlay */}
      {isProcessing && (
        <div className="fixed inset-0 z-modal bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card rounded-3xl shadow-2xl p-12 max-w-md w-full text-center animate-in slide-in-from-bottom-4">
            <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-6" />
            <h2 className="text-2xl font-bold text-foreground mb-3">Processing Payment</h2>
            <p className="text-muted-foreground mb-6">Please complete the payment in the Paystack popup. Do not close this window.</p>
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
              <div className="flex items-center justify-center gap-2 text-sm text-primary">
                <ShieldCheck className="h-4 w-4" />
                <span className="font-semibold">Payment processing in progress</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {showSuccess && (
        <div className="fixed inset-0 z-modal bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card rounded-3xl shadow-2xl p-8 sm:p-12 max-w-lg w-full animate-in slide-in-from-bottom-4">
            <div className="text-center">
              <div className="w-20 h-20 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <Check className="h-10 w-10 text-success" />
              </div>
              <h2 className="text-3xl font-bold text-foreground mb-3">Payment Successful!</h2>
              <p className="text-muted-foreground mb-6">Your payment has been received and is now securely held by SafeDeal.</p>

              <div className="bg-muted rounded-xl p-6 mb-6 text-left">
                <div className="flex justify-between items-center mb-3 pb-3 border-b">
                  <span className="text-sm text-muted-foreground">Transaction ID</span>
                  <span className="text-sm font-bold text-foreground">#{data.transaction.transaction_code}</span>
                </div>
                <div className="flex justify-between items-center mb-3 pb-3 border-b">
                  <span className="text-sm text-muted-foreground">Amount Paid</span>
                  <span className="text-sm font-bold text-foreground">{formatMoney(totalAmount, currencyCode)}</span>
                </div>
                <div className="flex justify-between items-center mb-3 pb-3 border-b">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-warning/10 text-warning">
                    <Lock className="h-3 w-3 mr-1" />
                    Funds Held
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Item</span>
                  <span className="text-sm font-bold text-foreground">{data.item?.title}</span>
                </div>
              </div>

              <div className="bg-success/5 border border-success/20 rounded-xl p-4 mb-6">
                <div className="flex items-start gap-3 text-left">
                  <Info className="h-4 w-4 text-success mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground mb-1">What happens next?</p>
                    <p className="text-xs text-muted-foreground">The transaction agreement is now locked. The seller will be notified to begin fulfillment under the selected delivery terms.</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => navigate(`/dashboard/transactions/${data.transaction.id}/agreement`)}
                  className="w-full bg-primary text-primary-foreground font-bold py-4 rounded-xl hover:bg-primary/90 transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
                >
                  <Eye className="h-4 w-4" />
                  <span>View Locked Agreement & Delivery</span>
                </button>
                <button
                  onClick={() => navigate("/dashboard")}
                  className="w-full bg-transparent border-2 border-border text-foreground font-semibold py-3 rounded-xl hover:bg-muted transition-all"
                >
                  Return to Dashboard
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Failed Full-Page Screen */}
      {showFailed && (
        <div className="fixed inset-0 z-modal bg-background/95 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-sm mx-auto my-8">
            {/* Card */}
            <div className="bg-card rounded-2xl shadow-xl border overflow-hidden animate-in slide-in-from-bottom-4">
              {/* Red gradient top bar */}
              <div className="h-1.5 bg-gradient-to-r from-destructive via-destructive/80 to-destructive/60" />

              <div className="p-5 sm:p-6">
                {/* Error icon */}
                <div className="flex justify-center mb-4">
                  <div className="relative">
                    <div className="w-14 h-14 bg-destructive/10 rounded-full flex items-center justify-center animate-pulse">
                      <XCircle className="h-7 w-7 text-destructive" />
                    </div>
                    <div className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-destructive rounded-full flex items-center justify-center">
                      <span className="text-destructive-foreground text-xs font-bold">!</span>
                    </div>
                  </div>
                </div>

                {/* Title */}
                <div className="text-center mb-4">
                  <h2 className="text-lg font-bold text-foreground mb-1">
                    {failureTerminal
                      ? "Transaction No Longer Payable"
                      : failureBlocker === "concurrency"
                      ? "Purchase Limit Reached"
                      : "Payment Failed"}
                  </h2>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {failureReason || "We were unable to process your payment. No funds were deducted from your account."}
                  </p>
                </div>

                {/* Money Status Summary */}
                <div className="rounded-xl overflow-hidden border border-amber-200 dark:border-amber-800 mb-4">
                  <div className="bg-amber-50/80 dark:bg-amber-950/20 px-3 py-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">Money Status Summary</p>
                  </div>
                  <div className="grid grid-cols-2 divide-x divide-amber-200 dark:divide-amber-800 bg-amber-50/40 dark:bg-amber-950/10">
                    <div className="flex flex-col items-center gap-1.5 py-3 px-2">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Transaction Status</span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-warning/15 text-warning border border-warning/30">
                        <Clock className="h-2.5 w-2.5" />
                        Awaiting Payment
                      </span>
                    </div>
                    <div className="flex flex-col items-center gap-1.5 py-3 px-2">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Money Status</span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-destructive/15 text-destructive border border-destructive/30">
                        <XCircle className="h-2.5 w-2.5" />
                        Payment Failed
                      </span>
                    </div>
                  </div>
                </div>

                {/* Transaction Info */}
                <div className="rounded-xl overflow-hidden border border-border mb-4">
                  <div className="bg-muted/50 px-3 py-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">Transaction Info</p>
                  </div>
                  <div className="grid grid-cols-2 divide-x divide-border bg-muted/30">
                    <div className="flex flex-col items-center gap-1 py-3 px-2">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Amount</span>
                      <span className="text-sm font-bold text-foreground">{formatMoney(totalAmount, currencyCode)}</span>
                    </div>
                    <div className="flex flex-col items-center gap-1 py-3 px-2">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Code</span>
                      <span className="text-xs font-mono font-semibold text-foreground bg-muted px-2 py-0.5 rounded">#{data.transaction.transaction_code}</span>
                    </div>
                  </div>
                </div>

                {/* What you can do next */}
                <div className="mb-4">
                  <p className="text-xs font-semibold text-foreground mb-2.5">What you can do next</p>
                  <div className="space-y-2">
                    {failureTerminal ? (
                      <button
                        onClick={() => navigate("/marketplace")}
                        className="w-full bg-primary text-primary-foreground font-semibold py-2.5 rounded-lg hover:bg-primary/90 transition-all text-xs flex items-center justify-center gap-1.5 min-h-11"
                      >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        Back to Marketplace
                      </button>
                    ) : failureBlocker === "concurrency" ? (
                      <>
                        <button
                          onClick={() => { setShowFailed(false); navigate("/dashboard/transactions"); }}
                          className="w-full bg-primary text-primary-foreground font-semibold py-2.5 rounded-lg hover:bg-primary/90 transition-all text-xs flex items-center justify-center gap-1.5 min-h-11"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          View My Transactions
                        </button>
                        <button
                          onClick={() => { setShowFailed(false); navigate(`/t/${shareToken}`); }}
                          className="w-full bg-transparent border border-border text-foreground font-medium py-2.5 rounded-lg hover:bg-muted transition-all text-xs flex items-center justify-center gap-1.5 min-h-11"
                        >
                          <ArrowLeft className="h-3.5 w-3.5" />
                          Return to Review
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={handleRetryPay}
                          disabled={isProcessing}
                          className="w-full bg-primary text-primary-foreground font-semibold py-2.5 rounded-lg hover:bg-primary/90 transition-all text-xs flex items-center justify-center gap-1.5 disabled:opacity-50 min-h-11"
                        >
                          {isProcessing ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              Processing...
                            </>
                          ) : (
                            <>
                              <RotateCcw className="h-3.5 w-3.5" />
                              Retry Payment
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => { setShowFailed(false); navigate(`/t/${shareToken}`); }}
                          className="w-full bg-transparent border border-border text-foreground font-medium py-2.5 rounded-lg hover:bg-muted transition-all text-xs flex items-center justify-center gap-1.5 min-h-11"
                        >
                          <ArrowLeft className="h-3.5 w-3.5" />
                          Return to Review
                        </button>
                      </>
                    )}
                    <button
                      onClick={() =>
                        navigate(
                          `/contact?topic=payment&ref=${encodeURIComponent(data.transaction.transaction_code)}`,
                        )
                      }
                      className="w-full bg-transparent border border-border text-foreground font-medium py-2.5 rounded-lg hover:bg-muted transition-all text-xs flex items-center justify-center gap-1.5 min-h-11"
                    >
                      <Headphones className="h-3.5 w-3.5" />
                      Contact support if card appears charged
                    </button>
                  </div>
                </div>

                {/* Security reassurance — only when retry is still valid */}
                {!failureTerminal && failureBlocker !== "concurrency" && (
                  <div className="bg-success/5 border border-success/20 rounded-lg p-3 mb-3">
                    <div className="flex items-start gap-2">
                      <ShieldCheck className="h-3.5 w-3.5 text-success mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-foreground mb-0.5">No funds were deducted</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">Your account has not been charged. You can safely retry the payment or choose a different payment method.</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Help footer */}
                <div className="text-center pt-2 border-t">
                  <p className="text-xs text-muted-foreground">
                    Need help?{" "}
                    <button
                      onClick={() =>
                        navigate(
                          `/contact?topic=payment&ref=${encodeURIComponent(data.transaction.transaction_code)}`,
                        )
                      }
                      className="text-primary font-semibold hover:text-primary/80 min-h-11 inline-flex items-center"
                    >
                      Contact support
                    </button>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
