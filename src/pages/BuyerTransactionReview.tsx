import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { format } from "date-fns";
import {
  Shield, Lock, AlertTriangle, ShieldAlert, ShieldCheck, CreditCard,
  Package, Truck, Clock, ClipboardCheck, CheckCircle, XCircle,
  Store, Star, Handshake, IdCard, Phone, Building2, CalendarDays,
  TrendingUp, HelpCircle, Info, Scale, HandCoins,
  FileText, LockOpen, Hourglass, CircleDot, Award, X, User
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Footer } from "@/components/landing/Footer";
import { ThemeToggle } from "@/components/ThemeToggle";
import { toast } from "@/components/ui/sonner";
import { getTransactionReview, type ReviewData } from "@/services/review.service";
import { supabase } from "@/integrations/supabase/client";
import { BuyerNav } from "@/components/dashboard/BuyerNav";
import { useBuyerIdentity } from "@/hooks/useBuyerIdentity";

type AuthState = "loading" | "anonymous" | "needs-role" | "ready";

export default function BuyerTransactionReview() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const navigate = useNavigate();
  const [authState, setAuthState] = useState<AuthState>("loading");
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
  });

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
    toast.info("Payment processing will be implemented soon.");
  };

  const handleDecline = () => {
    toast.info("Transaction declined.");
    navigate("/");
  };

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
  const totalAmount = data.pricing?.buyer_total_amount ?? 0;
  const itemAmount = data.pricing?.item_amount ?? 0;
  const feeAmount = data.pricing?.service_fee_amount ?? 0;
  const feeRate = data.pricing?.service_fee_rate ?? 0;
  const payButtonLabel = authState === "anonymous" ? "Sign Up to Pay" : `Pay ${currencySymbol}${totalAmount.toLocaleString()}`;

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

      {/* Fraud warning banner */}
      <section className="bg-destructive py-3">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-center gap-3 text-destructive-foreground">
          <AlertTriangle className="h-5 w-5 animate-pulse" />
          <p className="text-sm font-bold">WARNING: Never complete payment outside SafeDeal. Paying outside removes all buyer protection.</p>
          <ShieldAlert className="h-4 w-4" />
        </div>
      </section>

      {/* Transaction header */}
      <section className="bg-card border-b py-6">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/30">
                  <FileText className="h-3 w-3 mr-1" />
                  Transaction #{data.transaction.transaction_code}
                </Badge>
                <Badge className="bg-warning/10 text-warning border-warning/30 hover:bg-warning/10">
                  <span className="w-2 h-2 bg-warning rounded-full mr-1.5 animate-pulse" />
                  Payment Pending
                </Badge>
              </div>
              <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Review Transaction Agreement</h1>
              <p className="text-muted-foreground mt-1">Please review all details carefully before proceeding with payment</p>
            </div>
            <Button variant="outline" size="sm">
              <HelpCircle className="h-4 w-4" />
              Help
            </Button>
          </div>
        </div>
      </section>

      {/* Money state preview */}
      <section className="py-4 bg-muted border-b">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-warning/10 rounded-lg flex items-center justify-center">
              <Hourglass className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase">Transaction Status</p>
              <p className="text-sm font-bold text-foreground">Awaiting Payment</p>
            </div>
          </div>
          <div className="hidden sm:block w-px h-10 bg-border" />
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
              <LockOpen className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase">Money Status</p>
              <p className="text-sm font-bold text-muted-foreground">Not Yet Secured</p>
            </div>
          </div>
        </div>
      </section>

      {/* Lock warning */}
      <section className="py-6 bg-destructive/5">
        <div className="max-w-7xl mx-auto px-4">
          <div className="bg-card border-2 border-destructive/40 rounded-2xl shadow-lg p-6">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 bg-destructive/10 rounded-xl flex items-center justify-center shrink-0">
                <Lock className="h-7 w-7 text-destructive" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-foreground mb-3">Critical: Agreement Becomes Permanently Locked After Payment</h3>
                <div className="space-y-2 mb-4">
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

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 py-8 w-full">
        <div className="grid lg:grid-cols-3 gap-8">
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
              <EscrowProtectionCard data={data} currencySymbol={currencySymbol} />
              <FraudWarningCard />
              <NextActionCard
                payLabel={payButtonLabel}
                onPay={handlePayClick}
                onDecline={handleDecline}
                authState={authState}
              />
              <PaymentSummaryCard data={data} currencySymbol={currencySymbol} itemAmount={itemAmount} feeAmount={feeAmount} feeRate={feeRate} totalAmount={totalAmount} />
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
              { icon: Truck, title: "3. Seller Ships", desc: "Seller fulfills order with tracking and delivery proof", color: "text-success", bg: "bg-success/10" },
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
              { q: "What happens after I pay?", a: "Your payment is held securely by SafeDeal. The transaction agreement becomes locked, and the seller is notified to begin fulfillment. You'll receive tracking information once the item ships." },
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
    </div>
  );
}

/* ─── Sub-components ─── */

function ReviewHeader() {
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
            <p className="text-sm text-muted-foreground mb-3">{seller.email}</p>
            <div className="flex flex-wrap gap-2">
              {v?.identity_verified && (
                <Badge className="bg-success/10 text-success border-success/30 hover:bg-success/10">
                  <CheckCircle className="h-3 w-3 mr-1" /> Verified Seller
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
            <h4 className="text-base font-bold text-foreground">Verified Seller Trust Profile</h4>
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

      {/* Media gallery */}
      {data.media && data.media.length > 0 && (
        <div className="flex overflow-x-auto gap-4 p-6 bg-muted">
          {data.media.map((m) => (
            <div key={m.id} className="shrink-0 w-64 h-64 bg-card rounded-xl overflow-hidden border-2 border-border shadow-md">
              <img
                src={m.files?.secure_url || m.files?.file_url || ""}
                alt={m.files?.original_file_name || "Item image"}
                className="w-full h-full object-cover"
              />
            </div>
          ))}
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
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 z-10 shadow-lg ${
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

function EscrowProtectionCard({ data, currencySymbol }: { data: ReviewData; currencySymbol: string }) {
  const totalAmount = data.pricing?.buyer_total_amount ?? 0;
  return (
    <div className="bg-success rounded-2xl shadow-2xl p-6 text-success-foreground border-2 border-success/40">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-10 h-10 bg-success-foreground/20 rounded-lg flex items-center justify-center">
          <Shield className="h-5 w-5" />
        </div>
        <h3 className="text-xl font-bold">SafeDeal Escrow Protection</h3>
      </div>
      <div className="space-y-4 mb-6">
        {[
          { icon: Lock, title: "Your Payment is Held Securely", desc: `SafeDeal holds your ${currencySymbol}${totalAmount.toLocaleString()} in a secure escrow account. The seller cannot access these funds yet.` },
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
          <span className="font-bold">100% Buyer Protection Guarantee</span>
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
          { icon: ShieldAlert, title: "Off-platform payment removes ALL protection", desc: "You lose escrow protection, dispute rights, and refund eligibility" },
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

function NextActionCard({ payLabel, onPay, onDecline, authState }: {
  payLabel: string; onPay: () => void; onDecline: () => void; authState: AuthState;
}) {
  return (
    <div className="bg-primary rounded-2xl shadow-2xl p-6 text-primary-foreground">
      <div className="flex items-center gap-2 mb-4">
        <span className="w-2 h-2 bg-primary-foreground rounded-full animate-pulse" />
        <span className="text-xs font-bold uppercase tracking-wider">Next Action Required</span>
      </div>
      <h3 className="text-xl font-bold mb-2">{authState === "anonymous" ? "Sign Up to Pay Securely" : "Pay Securely"}</h3>
      <p className="text-sm opacity-80 mb-6">Complete your payment to lock this agreement and begin the protected transaction process.</p>
      <Button
        onClick={onPay}
        className="w-full bg-primary-foreground text-primary font-bold py-6 rounded-xl hover:bg-primary-foreground/90 shadow-lg mb-4"
        size="lg"
      >
        <Lock className="h-5 w-5" />
        {payLabel}
      </Button>
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

function PaymentSummaryCard({ data, currencySymbol, itemAmount, feeAmount, feeRate, totalAmount }: {
  data: ReviewData; currencySymbol: string; itemAmount: number; feeAmount: number; feeRate: number; totalAmount: number;
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
            <span className="font-semibold text-foreground">{currencySymbol}{itemAmount.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Service Fee ({(feeRate * 100).toFixed(1)}%)</span>
            <span className="font-semibold text-foreground">{currencySymbol}{feeAmount.toLocaleString()}</span>
          </div>
          <p className="text-xs text-muted-foreground -mt-1">Includes payment processing</p>
          <div className="border-t pt-3" />
          <div className="flex justify-between items-center">
            <span className="text-base font-bold text-foreground">Total Amount</span>
            <span className="text-2xl font-bold text-primary">{currencySymbol}{totalAmount.toLocaleString()}</span>
          </div>
        </div>
        <div className="bg-success/10 border border-success/20 rounded-xl p-3">
          <div className="flex items-center gap-2 text-xs text-success">
            <ShieldCheck className="h-4 w-4" />
            <span className="font-semibold">100% Buyer Protection</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ProtectionFeaturesCard({ data }: { data: ReviewData }) {
  const window = data.delivery?.verification_window_hours ?? 72;
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
            { icon: Clock, title: `${window}-Hour Verification`, desc: "Time to inspect and confirm", color: "text-warning", bg: "bg-warning/10" },
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
        <h3 className="text-base font-bold">Trusted & Secure</h3>
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
