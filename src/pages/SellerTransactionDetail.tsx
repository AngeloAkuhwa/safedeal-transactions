import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import {
  Loader2, RefreshCw, ArrowLeft, Copy, CheckCircle, Shield,
  User, CreditCard, Truck, Package, FileText, Clock, Lock,
  ExternalLink, Phone, Mail, MapPin, Send, Eye, MessageSquare,
  Headphones, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SellerNav } from "@/components/seller/SellerNav";
import { Footer } from "@/components/landing/Footer";
import { useToast } from "@/hooks/use-toast";
import { getSellerTransactionDetail } from "@/services/seller-transaction-detail.service";
import { getSellerDashboard } from "@/services/seller-dashboard.service";
import { BuyerTrustBadges } from "@/components/trust/BuyerTrustBadges";
import { DeliveryTermsCard } from "@/components/transactions/DeliveryTermsCard";
import { TransactionCompletionBanner } from "@/components/transactions/TransactionCompletionBanner";
import { RiderLinkCard } from "@/components/seller/RiderLinkCard";

const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  draft: { label: "Draft", variant: "secondary" },
  awaiting_buyer: { label: "Awaiting Buyer", variant: "outline" },
  awaiting_payment: { label: "Payment Pending", variant: "outline" },
  payment_secured: { label: "Payment Secured", variant: "default" },
  seller_preparing_delivery: { label: "Preparing Delivery", variant: "default" },
  seller_dispatched: { label: "Dispatched", variant: "default" },
  delivered_awaiting_verification: { label: "Buyer Verification", variant: "secondary" },
  completed: { label: "Completed", variant: "default" },
  disputed: { label: "Disputed", variant: "destructive" },
  cancelled: { label: "Cancelled", variant: "secondary" },
};

const moneyLabels: Record<string, { label: string; color: string }> = {
  not_secured: { label: "Not Secured", color: "text-muted-foreground" },
  payment_pending: { label: "Payment Pending", color: "text-yellow-600" },
  funds_held_in_escrow: { label: "Funds Held Securely", color: "text-green-600" },
  funds_frozen: { label: "Funds Frozen", color: "text-blue-600" },
  funds_releasing: { label: "Releasing Funds", color: "text-green-600" },
  funds_released: { label: "Funds Released", color: "text-green-700" },
  refund_pending: { label: "Refund Pending", color: "text-yellow-600" },
  refund_issued: { label: "Refunded", color: "text-destructive" },
};

const conditionLabels: Record<string, string> = {
  new: "Brand New",
  like_new: "Like New",
  good: "Good",
  fair: "Fair",
  refurbished: "Refurbished",
};

const deliveryLabels: Record<string, string> = {
  standard_shipping: "Standard Shipping",
  express_shipping: "Express Shipping",
  local_pickup: "Local Pickup",
  digital_delivery: "Digital Delivery",
  courier: "Courier",
};

function fmt(amount: number | undefined | null, currency: string) {
  const val = amount ?? 0;
  const sym = currency === "NGN" ? "₦" : currency === "USD" ? "$" : `${currency} `;
  return `${sym}${val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const SellerTransactionDetail = () => {
  const { transactionId } = useParams<{ transactionId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const { data: navData } = useQuery({
    queryKey: ["seller-dashboard"],
    queryFn: getSellerDashboard,
    staleTime: 60_000,
  });

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["seller-transaction-detail", transactionId],
    queryFn: () => getSellerTransactionDetail(transactionId!),
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

  if (isError || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4 px-4 text-center">
        <RefreshCw className="h-7 w-7 text-destructive" />
        <h2 className="text-xl font-bold text-foreground">Could not load transaction</h2>
        <p className="text-muted-foreground text-sm">{(error as Error)?.message}</p>
        <div className="flex gap-3">
          <Button onClick={() => refetch()}>Try Again</Button>
          <Button variant="outline" onClick={() => navigate("/seller/transactions")}>Back to Transactions</Button>
        </div>
      </div>
    );
  }

  const { transaction: tx, buyer, item, pricing, escrow, agreement, delivery_tracking, delivery_terms, timeline, next_action, completion_event, rider_link } = data;
  const currency = pricing?.currency_code ?? "NGN";
  const statusInfo = statusLabels[tx.status] ?? { label: tx.status, variant: "secondary" as const };
  const moneyInfo = moneyLabels[tx.money_status] ?? { label: tx.money_status, color: "text-muted-foreground" };

  const fullShareUrl = tx.share_url ? `${window.location.origin}${tx.share_url}` : null;

  const handleCopyLink = async () => {
    if (!fullShareUrl) return;
    await navigator.clipboard.writeText(fullShareUrl);
    setCopied(true);
    toast({ title: "Buyer link copied!" });
    setTimeout(() => setCopied(false), 2000);
  };

  const formattedDate = (d: string | null) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  };

  const formattedDateTime = (d: string | null) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-US", {
      month: "long", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit",
    });
  };

  const feePercent = pricing && pricing.item_amount > 0
    ? ((pricing.platform_fee_amount / pricing.item_amount) * 100).toFixed(0)
    : "3";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SellerNav
        sellerName={navData?.seller.full_name ?? "Seller"}
        avatarUrl={navData?.seller.avatar_url ?? null}
      />

      {/* Breadcrumb + Header */}
      <div className="bg-gradient-to-br from-sky-50 via-background to-green-50 dark:from-sky-950/20 dark:via-background dark:to-green-950/20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-6">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
            <button onClick={() => navigate("/seller")} className="hover:text-foreground transition-colors">Dashboard</button>
            <ChevronRight className="h-3.5 w-3.5" />
            <button onClick={() => navigate("/seller/transactions")} className="hover:text-foreground transition-colors">Transactions</button>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-foreground font-medium">Transaction #{tx.transaction_code}</span>
          </div>

          {/* Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Transaction #{tx.transaction_code}</h1>
              <div className="flex flex-wrap items-center gap-3 mt-2">
                <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                <span className={`text-sm font-semibold ${moneyInfo.color}`}>{moneyInfo.label}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">Created on {formattedDateTime(tx.created_at)}</p>
            </div>
            <div className="flex items-center gap-3">
              {fullShareUrl && (
                <Button variant="outline" size="sm" className="gap-2" onClick={handleCopyLink}>
                  {copied ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? "Copied!" : "Copy Buyer Link"}
                </Button>
              )}
              {["payment_secured", "seller_preparing_delivery"].includes(tx.status) && (
                <Button size="sm" className="gap-2" onClick={() => navigate(`/seller/transactions/${transactionId}/delivery`)}>
                  <Truck className="h-4 w-4" />
                  Update Delivery
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {tx.status === "completed" && completion_event && (
          <TransactionCompletionBanner
            variant={completion_event.variant}
            completedAt={completion_event.completed_at}
            perspective="seller"
          />
        )}

        {/* Rider confirmation link — visible while preparing/dispatched and a token exists */}
        {rider_link && ["seller_preparing_delivery", "seller_dispatched"].includes(tx.status) && (
          <div id="rider" className="scroll-mt-24">
            <RiderLinkCard
              riderUrl={`${window.location.origin}${rider_link.path}`}
              expiresAt={rider_link.expires_at}
              itemTitle={item?.title ?? null}
              transactionCode={tx.transaction_code}
            />
          </div>
        )}

        {/* 3-column info grid */}
        <div className="grid md:grid-cols-3 gap-4">
          {/* Buyer Info */}
          <Card className="rounded-2xl shadow-md p-5">
            <div className="flex items-center gap-2 mb-4">
              <User className="h-5 w-5 text-primary" />
              <h3 className="text-base font-bold text-foreground">Buyer Information</h3>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase">Name</p>
                <p className="text-sm font-semibold text-foreground">{buyer.name}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase">Email</p>
                <p className="text-sm text-foreground">{buyer.email || "—"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase">Phone</p>
                <p className="text-sm text-foreground">{buyer.phone || "—"}</p>
              </div>
              <BuyerTrustBadges
                signals={{
                  emailVerified: buyer.email_verified,
                  phoneVerified: buyer.phone_verified,
                  verificationLevel: buyer.verification_level,
                }}
                compact
              />
            </div>
          </Card>

          {/* Payment Summary */}
          <Card className="rounded-2xl shadow-md p-5">
            <div className="flex items-center gap-2 mb-4">
              <CreditCard className="h-5 w-5 text-primary" />
              <h3 className="text-base font-bold text-foreground">Payment Summary</h3>
            </div>
            {pricing ? (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Item Amount</span>
                  <span className="font-semibold text-foreground">{fmt(pricing.item_amount, currency)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Platform Fee ({feePercent}%)</span>
                  <span className="font-semibold text-foreground">{fmt(pricing.platform_fee_amount, currency)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Processing Fee</span>
                  <span className="font-semibold text-foreground">{fmt(pricing.payment_processing_fee_amount, currency)}</span>
                </div>
                <div className="border-t border-border pt-2 mt-2">
                  <div className="flex justify-between text-sm">
                    <span className="font-bold text-foreground">Your Net Amount</span>
                    <span className="font-bold text-green-600">{fmt(pricing.seller_net_amount, currency)}</span>
                  </div>
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-muted-foreground">Total Buyer Paid</span>
                    <span className="font-semibold text-foreground">{fmt(pricing.buyer_total_amount, currency)}</span>
                  </div>
                </div>
                {escrow && (
                  <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                    <Shield className="h-3 w-3 text-green-600" />
                    Funds are held securely until buyer confirms delivery
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Pricing not yet available</p>
            )}
          </Card>

          {/* Delivery Terms (shared locked card) */}
          <DeliveryTermsCard
            terms={delivery_terms ?? {
              delivery_method: tx.delivery_method,
              expected_delivery_date: tx.expected_delivery_date,
              verification_window_hours: tx.verification_window_hours,
            }}
            lockedAt={tx.agreement_locked_at}
          />
        </div>

        {/* 2-column: Item + Agreement */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* Item Details */}
          <Card className="rounded-2xl shadow-md p-5">
            <div className="flex items-center gap-2 mb-4">
              <Package className="h-5 w-5 text-primary" />
              <h3 className="text-base font-bold text-foreground">Item Details</h3>
            </div>
            {item ? (
              <div className="space-y-3">
                <div>
                  <h4 className="text-lg font-bold text-foreground">{item.title}</h4>
                  <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="bg-muted px-2.5 py-1 rounded-full font-medium">Qty: {item.quantity}</span>
                  <span className="bg-muted px-2.5 py-1 rounded-full font-medium">{conditionLabels[item.condition] ?? item.condition}</span>
                  {item.category && <span className="bg-muted px-2.5 py-1 rounded-full font-medium">{item.category}</span>}
                </div>
                {(item.brand || item.model) && (
                  <div className="space-y-1">
                    {item.brand && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Brand:</span>
                        <span className="font-medium text-foreground">{item.brand}</span>
                      </div>
                    )}
                    {item.model && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Model:</span>
                        <span className="font-medium text-foreground">{item.model}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No item details available</p>
            )}
          </Card>

          {/* Agreement Status */}
          <Card className="rounded-2xl shadow-md p-5">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="h-5 w-5 text-primary" />
              <h3 className="text-base font-bold text-foreground">Agreement Status</h3>
            </div>
            {agreement ? (
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full px-4 py-2 text-sm font-semibold">
                  <Lock className="h-4 w-4" />
                  Agreement Locked
                </div>
                <p className="text-sm text-muted-foreground">
                  This agreement was locked on {formattedDateTime(agreement.locked_at)} after buyer payment was received.
                </p>
                <div>
                  <p className="text-sm font-semibold text-foreground mb-2">The locked agreement includes:</p>
                  <ul className="space-y-1.5">
                    {["Item description and images", "Agreed payment amount", "Delivery terms and timeline", "Verification window details"].map((t) => (
                      <li key={t} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <CheckCircle className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
                <Button variant="outline" size="sm" className="gap-2">
                  <Eye className="h-4 w-4" />
                  View Locked Agreement
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded-full px-4 py-2 text-sm font-semibold">
                  <Clock className="h-4 w-4" />
                  Not Yet Locked
                </div>
                <p className="text-sm text-muted-foreground">
                  The agreement will be locked automatically when the buyer completes payment.
                </p>
              </div>
            )}
          </Card>
        </div>

        {/* Transaction Timeline */}
        <Card className="rounded-2xl shadow-md p-5 lg:p-8">
          <div className="flex items-center gap-2 mb-6">
            <Clock className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-bold text-foreground">Transaction Timeline</h3>
          </div>

          <div className="relative">
            <div className="absolute left-5 top-8 bottom-8 w-0.5 bg-gradient-to-b from-primary via-green-600 to-muted hidden md:block" />

            <div className="space-y-4">
              {timeline.map((step) => (
                <div key={step.key} className="flex items-start gap-4">
                  <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center relative z-10 ${
                    step.status === "completed" ? "bg-green-600" :
                    step.status === "current" ? "bg-primary" : "bg-muted"
                  }`}>
                    {step.status === "completed" ? (
                      <CheckCircle className="h-5 w-5 text-white" />
                    ) : step.status === "current" ? (
                      <div className="w-3 h-3 bg-primary-foreground rounded-full animate-pulse" />
                    ) : (
                      <div className="w-3 h-3 bg-muted-foreground/40 rounded-full" />
                    )}
                  </div>
                  <div className="flex-1 pb-2">
                    <div className="flex items-center gap-2">
                      <h4 className={`text-sm font-bold ${step.status === "pending" ? "text-muted-foreground" : "text-foreground"}`}>
                        {step.label}
                      </h4>
                      {step.status === "current" && (
                        <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">Current Stage</span>
                      )}
                      {step.status === "pending" && (
                        <span className="text-xs text-muted-foreground">Pending</span>
                      )}
                    </div>
                    {step.timestamp && (
                      <p className="text-xs text-muted-foreground mt-0.5">{formattedDateTime(step.timestamp)}</p>
                    )}
                    <p className={`text-xs mt-1 ${step.status === "pending" ? "text-muted-foreground/60" : "text-muted-foreground"}`}>
                      {step.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Next Action Panel */}
        <div className="bg-gradient-to-br from-primary/5 to-green-50 dark:from-primary/10 dark:to-green-950/20 rounded-2xl shadow-lg border-2 border-primary/20 p-6 lg:p-8">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 bg-primary rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg">
              <Send className="h-6 w-6 text-primary-foreground" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold text-primary uppercase tracking-wider">Next Action Required</span>
                <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-2">{next_action.title}</h3>
              <p className="text-sm text-muted-foreground mb-4">{next_action.description}</p>

              <div className="bg-card/60 backdrop-blur-sm rounded-xl p-4 border border-border">
                <p className="text-sm font-semibold text-foreground mb-3">What you need to do:</p>
                <ul className="space-y-2">
                  {next_action.checklist.map((item, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckCircle className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {["payment_secured", "seller_preparing_delivery"].includes(tx.status) && (
            <button className="flex flex-col items-center gap-2 p-4 border border-border rounded-2xl hover:bg-muted transition-colors">
              <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                <Truck className="h-5 w-5 text-primary" />
              </div>
              <span className="text-xs font-semibold text-foreground">Update Delivery Status</span>
            </button>
          )}
          {delivery_tracking?.tracking_url && (
            <a
              href={delivery_tracking.tracking_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-2 p-4 border border-border rounded-2xl hover:bg-muted transition-colors"
            >
              <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                <ExternalLink className="h-5 w-5 text-primary" />
              </div>
              <span className="text-xs font-semibold text-foreground">View Tracking</span>
            </a>
          )}
          {fullShareUrl && (
            <button
              onClick={handleCopyLink}
              className="flex flex-col items-center gap-2 p-4 border border-border rounded-2xl hover:bg-muted transition-colors"
            >
              <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                <Copy className="h-5 w-5 text-primary" />
              </div>
              <span className="text-xs font-semibold text-foreground">Copy Buyer Link</span>
            </button>
          )}
          <button className="flex flex-col items-center gap-2 p-4 border border-border rounded-2xl hover:bg-muted transition-colors">
            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
              <Headphones className="h-5 w-5 text-primary" />
            </div>
            <span className="text-xs font-semibold text-foreground">Contact Support</span>
          </button>
        </div>

        {/* Bottom Nav */}
        <div className="flex flex-col sm:flex-row gap-3 pb-8">
          <Button variant="outline" onClick={() => navigate("/seller/transactions")} className="flex-1 gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Transactions
          </Button>
          <Button variant="outline" onClick={() => navigate("/seller")} className="flex-1 gap-2">
            Back to Dashboard
          </Button>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default SellerTransactionDetail;
