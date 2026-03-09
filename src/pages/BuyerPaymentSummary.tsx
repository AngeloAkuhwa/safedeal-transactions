import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { format } from "date-fns";
import {
  Shield, Lock, ShieldCheck, CreditCard, AlertTriangle,
  CheckCircle, Clock, Package, Truck, ClipboardCheck,
  Store, Info, HelpCircle, ShieldAlert, LockOpen, Hourglass,
  ArrowLeft, Loader2, XCircle, Building2, Star, X
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Footer } from "@/components/landing/Footer";
import { ThemeToggle } from "@/components/ThemeToggle";
import { toast } from "@/components/ui/sonner";
import { getTransactionReview, type ReviewData } from "@/services/review.service";
import { supabase } from "@/integrations/supabase/client";
import { BuyerNav } from "@/components/dashboard/BuyerNav";
import { useBuyerIdentity } from "@/hooks/useBuyerIdentity";

type AuthState = "loading" | "anonymous" | "needs-role" | "ready";

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

  // Redirect unauthenticated users
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

  const Header = authState === "ready"
    ? () => <BuyerNav buyerName={buyerName} avatarUrl={avatarUrl} />
    : PaymentHeader;

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
      <div className="min-h-screen bg-background flex flex-col">
        <Header />
        <div className="max-w-7xl mx-auto px-4 py-8 w-full space-y-6">
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

  const handlePay = () => {
    if (!agreedToTerms) {
      toast.error("Please agree to the escrow payment terms before proceeding.");
      return;
    }
    setIsProcessing(true);
    // Placeholder — Paystack integration will replace this
    setTimeout(() => {
      setIsProcessing(false);
      setShowSuccess(true);
    }, 3000);
  };

  const firstMediaUrl = data.media?.[0]?.files?.secure_url || data.media?.[0]?.files?.file_url;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />

      {/* Trust banner */}
      <section className="bg-success py-3">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-center gap-3 text-success-foreground">
          <ShieldCheck className="h-5 w-5 animate-pulse" />
          <p className="text-sm font-semibold">Your payment will be held securely until you confirm the item received</p>
          <Lock className="h-4 w-4" />
        </div>
      </section>

      {/* Transaction header */}
      <section className="bg-card border-b py-6">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/30">
                  Transaction #{data.transaction.transaction_code}
                </Badge>
              </div>
              <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Secure Payment</h1>
              <p className="text-muted-foreground mt-1">Complete your payment to lock the transaction agreement</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate(`/t/${shareToken}`)}>
              <ArrowLeft className="h-4 w-4" />
              Back to Review
            </Button>
          </div>
        </div>
      </section>

      {/* Escrow protection info */}
      <section className="py-4 bg-primary/5 border-b">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center shrink-0">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground mb-2">Escrow Protection Active</h3>
              <p className="text-sm text-muted-foreground mb-3">Creating secure escrow transaction</p>
              <div className="space-y-1.5">
                {[
                  "Seller is only paid after you confirm receipt",
                  "If you raise a dispute, fund release is paused",
                  "Admin reviews disputes before final decision",
                ].map((item) => (
                  <div key={item} className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-success shrink-0" />
                    <p className="text-sm text-foreground">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Current Status */}
      <section className="py-4 bg-muted border-b">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-warning/10 rounded-lg flex items-center justify-center">
              <Hourglass className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase">Transaction Status</p>
              <p className="text-sm font-bold text-foreground">Awaiting Payment</p>
              <p className="text-xs text-muted-foreground">Escrow not yet created</p>
            </div>
          </div>
          <div className="hidden sm:block w-px h-12 bg-border" />
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
              <LockOpen className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase">Money Status</p>
              <p className="text-sm font-bold text-muted-foreground">Not Yet Secured</p>
              <p className="text-xs text-muted-foreground">Funds not in escrow</p>
            </div>
          </div>
        </div>
      </section>

      {/* Required action */}
      <section className="py-4 bg-warning/5 border-b">
        <div className="max-w-7xl mx-auto px-4">
          <div className="bg-card border border-warning/30 rounded-xl p-4">
            <h4 className="text-sm font-bold text-foreground mb-1">Required Action</h4>
            <p className="text-sm text-muted-foreground">Complete payment to create escrow account and secure funds. The transaction agreement will lock immediately after payment is processed.</p>
          </div>
        </div>
      </section>

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 py-8 w-full">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left column */}
          <div className="lg:col-span-2 space-y-6">
            {/* What Happens After Payment */}
            <Card className="rounded-2xl shadow-lg">
              <CardContent className="p-6">
                <h2 className="text-xl font-bold text-foreground mb-6">What Happens After Payment?</h2>
                <div className="space-y-6">
                  {[
                    {
                      step: 1,
                      icon: Lock,
                      title: "Payment Secured in Escrow",
                      desc: `Your ${currencySymbol}${totalAmount.toLocaleString()} payment is immediately placed in a secure escrow account managed by SafeDeal. The seller cannot access these funds.`,
                      color: "text-primary",
                      bg: "bg-primary/10",
                    },
                    {
                      step: 2,
                      icon: ClipboardCheck,
                      title: "Agreement Permanently Locked",
                      desc: "The transaction agreement becomes permanently locked. No changes can be made to item details, price, delivery terms, or any other conditions.",
                      color: "text-warning",
                      bg: "bg-warning/10",
                    },
                    {
                      step: 3,
                      icon: Truck,
                      title: "Seller Notified to Fulfill Order",
                      desc: "The seller receives instant notification that payment is secured. They are required to begin fulfillment and provide tracking information within the agreed timeframe.",
                      color: "text-success",
                      bg: "bg-success/10",
                    },
                    {
                      step: 4,
                      icon: Package,
                      title: "Tracking & Delivery Updates",
                      desc: `You'll receive real-time tracking updates. Once delivered, you'll have ${verificationHours} hours to verify the item matches the locked agreement before funds are released.`,
                      color: "text-destructive",
                      bg: "bg-destructive/10",
                    },
                  ].map((s) => (
                    <div key={s.step} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className={`w-10 h-10 ${s.bg} rounded-full flex items-center justify-center shrink-0`}>
                          <span className={`text-sm font-bold ${s.color}`}>{s.step}</span>
                        </div>
                        {s.step < 4 && <div className="w-px flex-1 bg-border mt-2" />}
                      </div>
                      <div className="pb-4">
                        <h4 className="text-base font-bold text-foreground mb-1">{s.title}</h4>
                        <p className="text-sm text-muted-foreground">{s.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 bg-success/10 border border-success/30 rounded-lg p-4">
                  <p className="text-sm text-success font-semibold">
                    <Shield className="h-4 w-4 inline mr-1.5" />
                    Your Protection Guarantee
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    If the item doesn't match the agreement, you can raise a dispute. Funds remain in escrow until the dispute is resolved by SafeDeal administration.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Payment Summary */}
            <Card className="rounded-2xl shadow-lg">
              <CardContent className="p-6">
                <h2 className="text-xl font-bold text-foreground mb-4">Payment Summary</h2>
                {/* Item preview */}
                <div className="flex gap-4 mb-6 p-4 bg-muted rounded-xl">
                  {firstMediaUrl ? (
                    <img src={firstMediaUrl} alt={data.item?.title || "Item"} className="w-20 h-20 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="w-20 h-20 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                      <Package className="h-8 w-8 text-primary" />
                    </div>
                  )}
                  <div>
                    <h3 className="font-bold text-foreground">{data.item?.title || "Item"}</h3>
                    <p className="text-sm text-muted-foreground line-clamp-1">{data.item?.description}</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {data.item?.condition_label && (
                        <Badge variant="secondary" className="text-xs">{data.item.condition_label}</Badge>
                      )}
                      <Badge variant="secondary" className="text-xs">Quantity: {data.item?.quantity ?? 1}</Badge>
                    </div>
                  </div>
                </div>

                {/* Price breakdown */}
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Item Price</span>
                    <span className="font-semibold text-foreground">{currencySymbol}{itemAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <div>
                      <span className="text-muted-foreground">Service Fee ({(feeRate * 100).toFixed(1)}%)</span>
                      <p className="text-xs text-muted-foreground">Includes payment processing</p>
                    </div>
                    <span className="font-semibold text-foreground">{currencySymbol}{feeAmount.toLocaleString()}</span>
                  </div>
                  <div className="border-t pt-3 flex justify-between">
                    <span className="text-base font-bold text-foreground">Total Amount</span>
                    <div className="text-right">
                      <span className="text-xl font-bold text-foreground">{currencySymbol}{totalAmount.toLocaleString()}</span>
                      <p className="text-xs text-muted-foreground">{data.pricing?.currency_code}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 bg-success/10 border border-success/30 rounded-lg p-3 flex items-center gap-2">
                  <Lock className="h-4 w-4 text-success shrink-0" />
                  <p className="text-sm text-success font-semibold">100% Secure Payment</p>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Your payment is protected by 256-bit SSL encryption and will be held in escrow until you confirm receipt of the item.
                </p>
              </CardContent>
            </Card>

            {/* Payment Method */}
            <Card className="rounded-2xl shadow-lg">
              <CardContent className="p-6">
                <h2 className="text-xl font-bold text-foreground mb-4">Payment Method</h2>
                <div className="grid sm:grid-cols-2 gap-4 mb-6">
                  <button
                    onClick={() => setSelectedMethod("card")}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${
                      selectedMethod === "card"
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/40"
                    }`}
                  >
                    <CreditCard className={`h-6 w-6 mb-2 ${selectedMethod === "card" ? "text-primary" : "text-muted-foreground"}`} />
                    <p className="font-bold text-foreground">Credit / Debit Card</p>
                    <p className="text-xs text-muted-foreground">Pay securely with your card</p>
                  </button>
                  <button
                    onClick={() => setSelectedMethod("bank")}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${
                      selectedMethod === "bank"
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/40"
                    }`}
                  >
                    <Building2 className={`h-6 w-6 mb-2 ${selectedMethod === "bank" ? "text-primary" : "text-muted-foreground"}`} />
                    <p className="font-bold text-foreground">Bank Transfer</p>
                    <p className="text-xs text-muted-foreground">Direct bank account transfer</p>
                  </button>
                </div>

                {selectedMethod === "card" && (
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="cardNumber">Card Number</Label>
                      <Input id="cardNumber" placeholder="1234 5678 9012 3456" className="mt-1" disabled />
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <Label htmlFor="expiry">Expiry Date</Label>
                        <Input id="expiry" placeholder="MM / YY" className="mt-1" disabled />
                      </div>
                      <div>
                        <Label htmlFor="cvv">CVV</Label>
                        <Input id="cvv" placeholder="123" className="mt-1" disabled />
                      </div>
                      <div>
                        <Label htmlFor="cardName">Cardholder Name</Label>
                        <Input id="cardName" placeholder="Full name" className="mt-1" disabled />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground italic">Card fields will be handled by Paystack — coming soon.</p>
                  </div>
                )}
                {selectedMethod === "bank" && (
                  <div className="bg-muted rounded-lg p-4 text-center">
                    <Building2 className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Bank transfer option will be available through Paystack — coming soon.</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Billing Address */}
            <Card className="rounded-2xl shadow-lg">
              <CardContent className="p-6">
                <h2 className="text-xl font-bold text-foreground mb-4">Billing Address</h2>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="firstName">First Name</Label>
                    <Input id="firstName" placeholder="First name" className="mt-1" disabled />
                  </div>
                  <div>
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input id="lastName" placeholder="Last name" className="mt-1" disabled />
                  </div>
                </div>
                <div className="mt-4">
                  <Label htmlFor="street">Street Address</Label>
                  <Input id="street" placeholder="123 Main Street" className="mt-1" disabled />
                </div>
                <div className="grid grid-cols-3 gap-4 mt-4">
                  <div>
                    <Label htmlFor="city">City</Label>
                    <Input id="city" placeholder="City" className="mt-1" disabled />
                  </div>
                  <div>
                    <Label htmlFor="state">State</Label>
                    <Input id="state" placeholder="State" className="mt-1" disabled />
                  </div>
                  <div>
                    <Label htmlFor="zip">ZIP Code</Label>
                    <Input id="zip" placeholder="ZIP" className="mt-1" disabled />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-3 italic">Billing address will be collected by Paystack — coming soon.</p>
              </CardContent>
            </Card>

            {/* Critical warning */}
            <Card className="rounded-2xl border-2 border-destructive/40 shadow-lg">
              <CardContent className="p-6">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-6 w-6 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-base font-bold text-destructive mb-2">Critical: Do Not Close or Refresh This Screen</h3>
                    <p className="text-sm text-muted-foreground mb-3">
                      While your payment is being processed, do not refresh, close, or navigate away from this browser window.
                      Doing so will interrupt the escrow creation process and may cause payment failures or delays.
                    </p>
                    <h4 className="text-sm font-semibold text-foreground mb-2">What to expect during processing:</h4>
                    <div className="space-y-1.5">
                      {[
                        "Payment authorization (5-10 seconds)",
                        "Escrow account creation (automatic)",
                        "Agreement locking (instant)",
                        "Confirmation message displayed",
                      ].map((item) => (
                        <div key={item} className="flex items-center gap-2">
                          <CheckCircle className="h-3.5 w-3.5 text-success shrink-0" />
                          <p className="text-sm text-muted-foreground">{item}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Escrow Payment Agreement */}
            <Card className="rounded-2xl shadow-lg">
              <CardContent className="p-6">
                <h2 className="text-xl font-bold text-foreground mb-4">Escrow Payment Agreement</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  By continuing with this payment, you understand and agree that your {currencySymbol}{totalAmount.toLocaleString()} will be held securely by SafeDeal in a protected escrow account.
                  These funds will not be released to the seller until you explicitly confirm receipt and verification of the item, or until a dispute is resolved by SafeDeal administration.
                </p>
                <h4 className="text-sm font-semibold text-foreground mb-2">You retain full control:</h4>
                <div className="space-y-1.5 mb-6">
                  {[
                    "Funds remain locked until your confirmation",
                    "You can raise a dispute if item doesn't match",
                    "Admin reviews all disputes before fund release",
                  ].map((item) => (
                    <div key={item} className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-success shrink-0" />
                      <p className="text-sm text-foreground">{item}</p>
                    </div>
                  ))}
                </div>
                <div className="flex items-start gap-3 bg-muted rounded-lg p-4">
                  <Checkbox
                    id="escrowTerms"
                    checked={agreedToTerms}
                    onCheckedChange={(val) => setAgreedToTerms(val === true)}
                  />
                  <Label htmlFor="escrowTerms" className="text-sm text-foreground leading-relaxed cursor-pointer">
                    I understand that this payment creates an escrow account and funds will not be released to the seller without my confirmation.
                  </Label>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right column / Sidebar */}
          <div className="lg:col-span-1">
            <div className="lg:sticky lg:top-24 space-y-6">
              {/* Payment Actions */}
              <Card className="rounded-2xl shadow-lg border-2 border-primary/20">
                <CardContent className="p-6">
                  <h3 className="text-lg font-bold text-foreground mb-4">Payment Actions</h3>
                  <Button
                    className="w-full mb-3 h-12 text-base font-bold"
                    size="lg"
                    onClick={handlePay}
                    disabled={!agreedToTerms}
                  >
                    <CreditCard className="h-5 w-5" />
                    Pay {currencySymbol}{totalAmount.toLocaleString()}
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => navigate(`/t/${shareToken}`)}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back to Review
                  </Button>
                  <div className="mt-4 pt-4 border-t space-y-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Shield className="h-3.5 w-3.5 text-success" />
                      <span>Secured by SafeDeal</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Lock className="h-3.5 w-3.5 text-success" />
                      <span>256-bit SSL Encryption</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <ShieldCheck className="h-3.5 w-3.5 text-success" />
                      <span>PCI DSS Compliant</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Seller Information */}
              {data.seller && (
                <Card className="rounded-2xl shadow-lg">
                  <CardContent className="p-6">
                    <h3 className="text-lg font-bold text-foreground mb-4">Seller Information</h3>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                        {data.seller.avatar_url ? (
                          <img src={data.seller.avatar_url} alt={data.seller.full_name} className="w-full h-full rounded-full object-cover" />
                        ) : (
                          <Store className="h-6 w-6 text-primary" />
                        )}
                      </div>
                      <div>
                        <p className="font-bold text-foreground">{data.seller.full_name}</p>
                        {data.sellerVerification?.identity_verified && (
                          <Badge className="bg-success/10 text-success border-success/30 hover:bg-success/10 text-xs">
                            <CheckCircle className="h-3 w-3 mr-1" /> Verified Seller
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Your Protection */}
              <Card className="rounded-2xl shadow-lg">
                <CardContent className="p-6">
                  <h3 className="text-lg font-bold text-foreground mb-4">Your Protection</h3>
                  <div className="space-y-3">
                    {[
                      `Payment held in escrow until verification`,
                      `${verificationHours}-hour verification window`,
                      "Dispute resolution available",
                      "Full refund if item doesn't match",
                    ].map((item) => (
                      <div key={item} className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-success shrink-0" />
                        <p className="text-sm text-foreground">{item}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>

      <Footer />

      {/* Processing Overlay */}
      {isProcessing && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
          <h2 className="text-xl font-bold text-foreground mb-2">Processing Payment</h2>
          <p className="text-muted-foreground text-center max-w-sm">
            Please wait while we securely process your payment. Do not close this window.
          </p>
          <p className="text-xs text-muted-foreground mt-4">Your payment is protected by SafeDeal</p>
        </div>
      )}

      {/* Success Modal */}
      {showSuccess && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="max-w-md w-full rounded-2xl shadow-2xl">
            <CardContent className="p-8 text-center">
              <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="h-8 w-8 text-success" />
              </div>
              <h2 className="text-2xl font-bold text-foreground mb-2">Payment Successful!</h2>
              <p className="text-muted-foreground mb-6">Your payment has been received and is now securely held by SafeDeal.</p>
              <div className="bg-muted rounded-lg p-4 mb-6 text-left space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Transaction ID</span>
                  <span className="font-semibold text-foreground">#{data.transaction.transaction_code}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Amount Paid</span>
                  <span className="font-semibold text-foreground">{currencySymbol}{totalAmount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Status</span>
                  <Badge className="bg-success/10 text-success border-success/30 hover:bg-success/10">Funds Held</Badge>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Item</span>
                  <span className="font-semibold text-foreground">{data.item?.title}</span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground mb-6">
                What happens next? The transaction agreement is now locked. The seller will be notified to begin fulfillment.
                You'll receive tracking information once the item ships.
              </p>
              <div className="space-y-3">
                <Button className="w-full" onClick={() => navigate(`/dashboard/transactions/${data.transaction.id}/agreement`)}>
                  View Locked Agreement & Tracking
                </Button>
                <Button variant="outline" className="w-full" onClick={() => navigate("/dashboard")}>
                  Return to Dashboard
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Failed Modal */}
      {showFailed && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="max-w-md w-full rounded-2xl shadow-2xl">
            <CardContent className="p-8 text-center">
              <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <XCircle className="h-8 w-8 text-destructive" />
              </div>
              <h2 className="text-2xl font-bold text-foreground mb-2">Payment Failed</h2>
              <p className="text-muted-foreground mb-4">We were unable to process your payment. Please check your payment details and try again.</p>
              <div className="bg-muted rounded-lg p-4 mb-6 text-left">
                <p className="text-sm font-semibold text-foreground mb-2">Common reasons for failure:</p>
                <div className="space-y-1.5">
                  {[
                    "Insufficient funds in your account",
                    "Incorrect card details or CVV",
                    "Card expired or blocked",
                    "Bank declined the transaction",
                  ].map((reason) => (
                    <div key={reason} className="flex items-center gap-2">
                      <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                      <p className="text-sm text-muted-foreground">{reason}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                <Button className="w-full" onClick={() => { setShowFailed(false); }}>
                  Retry Payment
                </Button>
                <Button variant="outline" className="w-full" onClick={() => { setShowFailed(false); navigate(`/t/${shareToken}`); }}>
                  Cancel
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-4">
                Need help? <button className="text-primary underline">Contact Support</button>
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function PaymentHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <Shield className="h-7 w-7 text-primary" />
          <span className="text-xl font-bold text-foreground">SafeDeal</span>
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
