import { useParams, useNavigate } from "react-router-dom";
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
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Footer } from "@/components/landing/Footer";
import { toast } from "@/components/ui/sonner";
import { getTransactionReview, type ReviewData } from "@/services/review.service";
import { getBuyerProfile } from "@/services/profile.service";
import { supabase } from "@/integrations/supabase/client";
import { BuyerNav } from "@/components/dashboard/BuyerNav";
import { useBuyerIdentity } from "@/hooks/useBuyerIdentity";

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

  const canPay = profileData?.permissions?.canStartProtectedPayment ?? true;

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

    try {
      const { data: initData, error: initError } = await supabase.functions.invoke(
        "initiate-paystack-payment",
        { body: { shareToken, paymentMethod: selectedMethod } }
      );

      if (initError || initData?.error) {
        const errMsg = initData?.error || initError?.message || "Failed to initialize payment";
        // If transaction is already paid, show success instead of failed
        if (errMsg.includes("payment_secured") || errMsg.includes("funds_held_in_escrow")) {
          setIsProcessing(false);
          setShowFailed(false);
          setShowSuccess(true);
          return;
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
    openPaystackPayment();
  }, [openPaystackPayment]);

  if (authState === "loading" || authState === "anonymous" || authState === "needs-role") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
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
      <div className="min-h-screen bg-background flex flex-col">
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

  const currencySymbol = data.pricing?.currency_code === "NGN" ? "₦" : "$";
  const totalAmount = data.pricing?.total_amount ?? 0;
  const itemAmount = data.pricing?.item_amount ?? 0;
  const feeAmount = data.pricing?.service_fee_amount ?? 0;
  const feeRate = data.pricing?.service_fee_rate ?? 0;
  const verificationHours = data.delivery?.verification_window_hours ?? 72;

  const firstMediaUrl = data.media?.[0]?.files?.secure_url || data.media?.[0]?.files?.file_url;

  return (
    <div className="min-h-screen bg-muted flex flex-col">
      <Header />

      {/* Verification Lock Banner */}
      {!canPay && (
        <section className="bg-destructive/10 border-b border-destructive/20 py-4">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Lock className="h-5 w-5 text-destructive shrink-0" />
                <div>
                  <p className="text-sm font-bold text-foreground">Phone verification required to proceed with payment</p>
                  <p className="text-xs text-muted-foreground">Complete verification in your profile to unlock protected payments</p>
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
                  <h2 className="text-xl font-bold">Escrow Protection Active</h2>
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
                  "Admin reviews disputes before final decision",
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
                    desc: `Your ${currencySymbol}${totalAmount.toLocaleString()} payment is immediately placed in a secure escrow account managed by SafeDeal. The seller cannot access these funds.`,
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
                    desc: "The seller receives instant notification that payment is secured. They are required to begin fulfillment and provide tracking information within the agreed timeframe.",
                    bgClass: "bg-primary/10",
                    textClass: "text-primary",
                  },
                  {
                    step: 4,
                    title: "Tracking & Delivery Updates",
                    desc: `You'll receive real-time tracking updates. Once delivered, you'll have ${verificationHours} hours to verify the item matches the locked agreement before funds are released.`,
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
                    <p className="text-sm font-semibold text-foreground mb-1">Your Protection Guarantee</p>
                    <p className="text-xs text-muted-foreground">If the item doesn't match the agreement, you can raise a dispute. Funds remain in escrow until the dispute is resolved by SafeDeal administration.</p>
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
                  <span className="text-base font-semibold text-foreground">{currencySymbol}{itemAmount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-muted-foreground">SafeDeal Protection Fee</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-medium text-muted-foreground border-muted-foreground/30">capped</Badge>
                  </div>
                  <span className="text-base font-semibold text-success">{currencySymbol}{feeAmount.toLocaleString()}</span>
                </div>
                <p className="text-xs text-muted-foreground -mt-1 pl-0.5">Covers secure payment holding, buyer protection, and dispute resolution.</p>
              </div>

              <div className="pt-4 border-t-2">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-bold text-foreground">Total You Pay</span>
                  <span className="text-3xl font-bold text-primary">{currencySymbol}{totalAmount.toLocaleString()}</span>
                </div>
                <p className="text-xs text-muted-foreground text-right mt-1">{data.pricing?.currency_code}</p>
              </div>

              {/* Trust block */}
              <div className="mt-6 bg-primary/5 border border-primary/20 rounded-xl p-5">
                <div className="flex items-start gap-3 mb-4">
                  <ShieldCheck className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-bold text-foreground mb-1">Your Payment is Protected</p>
                    <p className="text-xs text-muted-foreground">SafeDeal holds your payment securely until you confirm the item has been received and matches the agreement. If something goes wrong, you can open a dispute and SafeDeal will review the case.</p>
                  </div>
                </div>
                <div className="space-y-2 pl-8">
                  {[
                    "Secure escrow payment",
                    "Buyer verification window",
                    "Dispute protection",
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
                <div
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
                <div
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
                    By continuing with this payment, you understand and agree that your {currencySymbol}{totalAmount.toLocaleString()} will be held securely by SafeDeal in a protected escrow account. These funds will <strong>not be released to the seller</strong> until you explicitly confirm receipt and verification of the item, or until a dispute is resolved by SafeDeal administration.
                  </p>
                  <div className="bg-card border rounded-lg p-3 mb-3">
                    <p className="text-xs font-semibold text-foreground mb-2">You retain full control:</p>
                    <ul className="text-xs text-muted-foreground space-y-1">
                      {[
                        "Funds remain locked until your confirmation",
                        "You can raise a dispute if item doesn't match",
                        "Admin reviews all disputes before fund release",
                      ].map((item) => (
                        <li key={item} className="flex items-start gap-2">
                          <Check className="h-3 w-3 text-success mt-0.5 shrink-0" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="mt-3 flex items-start gap-2">
                    <input
                      type="checkbox"
                      id="terms-checkbox"
                      checked={agreedToTerms}
                      onChange={(e) => setAgreedToTerms(e.target.checked)}
                      className="mt-1 w-4 h-4 rounded border-input accent-primary"
                    />
                    <label htmlFor="terms-checkbox" className="text-xs text-muted-foreground cursor-pointer">
                      I understand that this payment creates an escrow account and funds will not be released to the seller without my confirmation
                    </label>
                  </div>
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
                      <span>Pay {currencySymbol}{totalAmount.toLocaleString()}</span>
                    </>
                  )}
                </button>

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
                    <span>Secured by SafeDeal</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Lock className="h-3.5 w-3.5 text-primary" />
                    <span>256-bit SSL Encryption</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Star className="h-3.5 w-3.5 text-warning" />
                    <span>PCI DSS Compliant (via Paystack)</span>
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
                      {data.sellerVerification?.identity_verified && (
                        <p className="text-xs text-muted-foreground">Verified Seller</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Your Protection - Green gradient */}
              <div className="bg-gradient-to-br from-success to-success/80 rounded-2xl shadow-lg p-6 text-success-foreground">
                <div className="flex items-center gap-2 mb-4">
                  <Shield className="h-6 w-6" />
                  <h3 className="text-lg font-bold">Your Protection</h3>
                </div>
                <ul className="space-y-3 text-sm">
                  {[
                    `Payment held in escrow until verification`,
                    `${verificationHours}-hour verification window`,
                    "Dispute resolution available",
                    "Full refund if item doesn't match",
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
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card rounded-3xl shadow-2xl p-12 max-w-md w-full text-center animate-in slide-in-from-bottom-4">
            <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-6" />
            <h2 className="text-2xl font-bold text-foreground mb-3">Processing Payment</h2>
            <p className="text-muted-foreground mb-6">Please complete the payment in the Paystack popup. Do not close this window.</p>
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
              <div className="flex items-center justify-center gap-2 text-sm text-primary">
                <ShieldCheck className="h-4 w-4" />
                <span className="font-semibold">Your payment is protected by SafeDeal</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {showSuccess && (
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
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
                  <span className="text-sm font-bold text-foreground">{currencySymbol}{totalAmount.toLocaleString()}</span>
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
                    <p className="text-xs text-muted-foreground">The transaction agreement is now locked. The seller will be notified to begin fulfillment. You'll receive tracking information once the item ships.</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => navigate(`/dashboard/transactions/${data.transaction.id}/agreement`)}
                  className="w-full bg-primary text-primary-foreground font-bold py-4 rounded-xl hover:bg-primary/90 transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
                >
                  <Eye className="h-4 w-4" />
                  <span>View Locked Agreement & Tracking</span>
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
        <div className="fixed inset-0 z-[9999] bg-background/95 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
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
                      <span className="text-destructive-foreground text-[10px] font-bold">!</span>
                    </div>
                  </div>
                </div>

                {/* Title */}
                <div className="text-center mb-4">
                  <h2 className="text-lg font-bold text-foreground mb-1">Payment Failed</h2>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {failureReason || "We were unable to process your payment. No funds were deducted from your account."}
                  </p>
                </div>

                {/* Money Status Summary */}
                <div className="rounded-xl overflow-hidden border border-amber-200 dark:border-amber-800 mb-4">
                  <div className="bg-amber-50/80 dark:bg-amber-950/20 px-3 py-2">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-center">Money Status Summary</p>
                  </div>
                  <div className="grid grid-cols-2 divide-x divide-amber-200 dark:divide-amber-800 bg-amber-50/40 dark:bg-amber-950/10">
                    <div className="flex flex-col items-center gap-1.5 py-3 px-2">
                      <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Transaction Status</span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-warning/15 text-warning border border-warning/30">
                        <Clock className="h-2.5 w-2.5" />
                        Awaiting Payment
                      </span>
                    </div>
                    <div className="flex flex-col items-center gap-1.5 py-3 px-2">
                      <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Money Status</span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-destructive/15 text-destructive border border-destructive/30">
                        <XCircle className="h-2.5 w-2.5" />
                        Payment Failed
                      </span>
                    </div>
                  </div>
                </div>

                {/* Transaction Info */}
                <div className="rounded-xl overflow-hidden border border-border mb-4">
                  <div className="bg-muted/50 px-3 py-2">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-center">Transaction Info</p>
                  </div>
                  <div className="grid grid-cols-2 divide-x divide-border bg-muted/30">
                    <div className="flex flex-col items-center gap-1 py-3 px-2">
                      <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Amount</span>
                      <span className="text-sm font-bold text-foreground">{currencySymbol}{totalAmount.toLocaleString()}</span>
                    </div>
                    <div className="flex flex-col items-center gap-1 py-3 px-2">
                      <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Code</span>
                      <span className="text-[11px] font-mono font-semibold text-foreground bg-muted px-2 py-0.5 rounded">#{data.transaction.transaction_code}</span>
                    </div>
                  </div>
                </div>

                {/* What you can do next */}
                <div className="mb-4">
                  <p className="text-xs font-semibold text-foreground mb-2.5">What you can do next</p>
                  <div className="space-y-2">
                    <button
                      onClick={handleRetryPay}
                      disabled={isProcessing}
                      className="w-full bg-primary text-primary-foreground font-semibold py-2.5 rounded-lg hover:bg-primary/90 transition-all text-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
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
                      className="w-full bg-transparent border border-border text-foreground font-medium py-2.5 rounded-lg hover:bg-muted transition-all text-xs flex items-center justify-center gap-1.5"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      Return to Review
                    </button>
                    <button
                      className="w-full bg-transparent border border-border text-foreground font-medium py-2.5 rounded-lg hover:bg-muted transition-all text-xs flex items-center justify-center gap-1.5"
                    >
                      <Headphones className="h-3.5 w-3.5" />
                      Contact support if card appears charged
                    </button>
                  </div>
                </div>

                {/* Security reassurance */}
                <div className="bg-success/5 border border-success/20 rounded-lg p-3 mb-3">
                  <div className="flex items-start gap-2">
                    <ShieldCheck className="h-3.5 w-3.5 text-success mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[10px] font-semibold text-foreground mb-0.5">No funds were deducted</p>
                      <p className="text-[10px] text-muted-foreground leading-relaxed">Your account has not been charged. You can safely retry the payment or choose a different payment method.</p>
                    </div>
                  </div>
                </div>

                {/* Help footer */}
                <div className="text-center pt-2 border-t">
                  <p className="text-[10px] text-muted-foreground">
                    Need help?{" "}
                    <button className="text-primary font-semibold hover:text-primary/80">
                      Visit our Help Center
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
