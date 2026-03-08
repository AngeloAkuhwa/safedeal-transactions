import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Shield,
  Clock,
  CheckCircle,
  Package,
  Truck,
  MapPin,
  AlertTriangle,
  FileText,
  MessageSquare,
  Download,
  HelpCircle,
  Flag,
  MoreHorizontal,
  Star,
  BadgeCheck,
  Image as ImageIcon,
  Scale,
  ChevronRight,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { BuyerNav } from "@/components/dashboard/BuyerNav";
import { Footer } from "@/components/landing/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getTransactionDetail } from "@/services/transaction-detail.service";
import type {
  TransactionDetailResponse,
  TransactionStatusEntry,
} from "@/services/transaction-detail.service";
import { useBuyerIdentity } from "@/hooks/useBuyerIdentity";
import { useEffect, useState } from "react";

/* ───── Status badge config ───── */
const statusConfig: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground border-border" },
  awaiting_buyer: { label: "Awaiting Buyer", className: "bg-muted text-muted-foreground border-border" },
  awaiting_payment: { label: "Awaiting Payment", className: "bg-warning/15 text-warning border-warning/30" },
  payment_secured: { label: "Payment Secured", className: "bg-primary/15 text-primary border-primary/30" },
  seller_preparing_delivery: { label: "Preparing", className: "bg-primary/15 text-primary border-primary/30" },
  seller_dispatched: { label: "In Transit", className: "bg-primary/15 text-primary border-primary/30" },
  delivered_awaiting_verification: { label: "Delivered", className: "bg-success/15 text-success border-success/30" },
  disputed: { label: "Disputed", className: "bg-destructive/15 text-destructive border-destructive/30" },
  completed: { label: "Completed", className: "bg-success/15 text-success border-success/30" },
  refunded: { label: "Refunded", className: "bg-muted text-muted-foreground border-border" },
  cancelled: { label: "Cancelled", className: "bg-muted text-muted-foreground border-border" },
};

const moneyConfig: Record<string, { label: string; className: string }> = {
  not_secured: { label: "Not Secured", className: "bg-muted text-muted-foreground border-border" },
  payment_pending: { label: "Payment Pending", className: "bg-warning/15 text-warning border-warning/30" },
  funds_held_in_escrow: { label: "Funds Held in Escrow", className: "bg-primary/15 text-primary border-primary/30" },
  funds_frozen: { label: "Funds Frozen", className: "bg-destructive/15 text-destructive border-destructive/30" },
  funds_releasing: { label: "Releasing", className: "bg-success/15 text-success border-success/30" },
  funds_released: { label: "Released", className: "bg-success/15 text-success border-success/30" },
  refund_pending: { label: "Refund Pending", className: "bg-warning/15 text-warning border-warning/30" },
  refund_issued: { label: "Refunded", className: "bg-muted text-muted-foreground border-border" },
};

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: currency || "NGN",
    minimumFractionDigits: 2,
  }).format(amount);
}

/* ───── Timeline step definitions ───── */
const timelineSteps = [
  { status: "draft", label: "Transaction Created", icon: FileText },
  { status: "payment_secured", label: "Payment Secured", icon: Shield },
  { status: "seller_preparing_delivery", label: "Seller Preparing Shipment", icon: Package },
  { status: "seller_dispatched", label: "Seller Dispatched Item", icon: Truck },
  { status: "delivered_awaiting_verification", label: "Delivered", icon: MapPin },
  { status: "buyer_verification", label: "Buyer Verification", icon: CheckCircle },
  { status: "completed", label: "Transaction Completed", icon: CheckCircle },
];

const statusOrder = [
  "draft", "awaiting_buyer", "awaiting_payment", "payment_secured",
  "seller_preparing_delivery", "seller_dispatched",
  "delivered_awaiting_verification", "disputed", "completed", "refunded",
];

function getStatusIndex(status: string) {
  const idx = statusOrder.indexOf(status);
  return idx === -1 ? 0 : idx;
}

/* ───── Countdown hook ───── */
function useCountdown(deadline: string | null) {
  const [remaining, setRemaining] = useState("");
  useEffect(() => {
    if (!deadline) return;
    const update = () => {
      const diff = new Date(deadline).getTime() - Date.now();
      if (diff <= 0) { setRemaining("00:00:00"); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [deadline]);
  return remaining;
}

/* ───── Page ───── */
const BuyerTransactionDetail = () => {
  const { transactionId } = useParams<{ transactionId: string }>();
  const navigate = useNavigate();
  const { buyerName, avatarUrl } = useBuyerIdentity();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["transaction-detail", transactionId],
    queryFn: () => getTransactionDetail(transactionId!),
    enabled: !!transactionId,
    retry: 1,
    staleTime: 30_000,
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
        <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <RefreshCw className="h-7 w-7 text-destructive" />
        </div>
        <h2 className="text-xl font-bold text-foreground">Could not load transaction</h2>
        <p className="text-muted-foreground text-sm max-w-md">
          {(error as Error)?.message || "Please try again."}
        </p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => navigate("/dashboard/transactions")}>
            <ArrowLeft className="h-4 w-4" /> Back to Purchases
          </Button>
          <Button onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" /> Retry
          </Button>
        </div>
      </div>
    );
  }

  const { transaction: tx, item, pricing, delivery_terms, delivery_tracking, delivery_proof_files, seller, escrow, status_history, dispute, agreement, next_action } = data;
  const currentStatusIndex = getStatusIndex(tx.status);
  const sBadge = statusConfig[tx.status] ?? { label: tx.status, className: "bg-muted text-muted-foreground border-border" };
  const mBadge = moneyConfig[tx.money_status] ?? { label: tx.money_status, className: "bg-muted text-muted-foreground border-border" };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <BuyerNav buyerName={buyerName} avatarUrl={avatarUrl} />

      {/* Header */}
      <section className="bg-primary py-6 sm:py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Link to="/dashboard/transactions" className="inline-flex items-center gap-1.5 text-primary-foreground/70 hover:text-primary-foreground text-sm mb-4 transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back to My Purchases
          </Link>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl sm:text-3xl font-bold text-primary-foreground">
                  {tx.transaction_code}
                </h1>
                <Badge variant="outline" className={`${sBadge.className} text-xs`}>{sBadge.label}</Badge>
              </div>
              <p className="text-primary-foreground/70 text-sm">
                Created on {format(new Date(tx.created_at), "MMMM d, yyyy 'at' h:mm a")}
              </p>
            </div>
            <div className="flex gap-2">
              {tx.status === "seller_dispatched" && (
                <Button className="bg-primary-foreground text-primary hover:bg-primary-foreground/90 font-bold">
                  <Truck className="h-4 w-4" /> Track Order
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10">
                    <MoreHorizontal className="h-4 w-4" /> More Actions
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {agreement && (
                    <DropdownMenuItem onClick={() => navigate(`/dashboard/transactions/${tx.id}/agreement`)}>
                      <FileText className="h-4 w-4 mr-2" /> View Locked Agreement
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem>
                    <Download className="h-4 w-4 mr-2" /> Download Receipt
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <HelpCircle className="h-4 w-4 mr-2" /> Contact Support
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Flag className="h-4 w-4 mr-2" /> Report Issue
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </section>

      {/* Escrow banner */}
      {escrow && (escrow.state === "funds_held" || tx.money_status === "funds_held_in_escrow") && (
        <div className="bg-primary/5 border-b border-primary/20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-3">
            <Shield className="h-5 w-5 text-primary shrink-0" />
            <p className="text-sm text-foreground">
              <span className="font-semibold">{formatCurrency(escrow.held_amount, pricing.currency_code)}</span>
              {" "}is held securely in escrow — your money is protected until you verify the item.
            </p>
          </div>
        </div>
      )}

      {/* Main grid */}
      <main className="flex-1 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left column (2/3) */}
          <div className="lg:col-span-2 space-y-6">
            {/* Next Action Card (mobile: shows here, desktop: sidebar) */}
            <div className="lg:hidden">
              <NextActionCard data={data} navigate={navigate} />
            </div>

            {/* Item Details */}
            <Card className="shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">Item Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-4">
                  <div className="h-24 w-24 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-bold text-foreground mb-2">{item.title}</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-2 gap-x-4 text-sm mb-3">
                      <div>
                        <span className="text-muted-foreground">Quantity:</span>{" "}
                        <span className="font-semibold text-foreground">{item.quantity}</span>
                      </div>
                      {item.condition && (
                        <div>
                          <span className="text-muted-foreground">Condition:</span>{" "}
                          <span className="font-semibold text-foreground">{item.condition}</span>
                        </div>
                      )}
                      {item.category && (
                        <div>
                          <span className="text-muted-foreground">Category:</span>{" "}
                          <span className="font-semibold text-foreground">{item.category}</span>
                        </div>
                      )}
                    </div>
                    {item.description && (
                      <>
                        <h4 className="text-sm font-semibold text-foreground mb-1">Description</h4>
                        <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Delivery Details */}
            {delivery_terms && (
              <Card className="shadow-sm">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg">Delivery Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Delivery Method</span>
                      <p className="font-semibold text-foreground capitalize">{delivery_terms.delivery_method.replace(/_/g, " ")}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Expected Delivery</span>
                      <p className="font-semibold text-foreground">{format(new Date(delivery_terms.expected_delivery_date), "MMMM d, yyyy")}</p>
                    </div>
                    {delivery_terms.delivery_address_line1 && (
                      <div className="sm:col-span-2">
                        <span className="text-muted-foreground">Destination</span>
                        <p className="font-semibold text-foreground">
                          {delivery_terms.delivery_address_line1}
                          {delivery_terms.delivery_address_line2 && `, ${delivery_terms.delivery_address_line2}`}
                        </p>
                        <p className="text-foreground">
                          {[delivery_terms.delivery_city, delivery_terms.delivery_state, delivery_terms.delivery_postal_code].filter(Boolean).join(", ")}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Delivery evidence */}
                  {delivery_proof_files.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-foreground mb-2">Delivery Evidence</h4>
                      <div className="flex gap-2 flex-wrap">
                        {delivery_proof_files.map((pf) => (
                          <div key={pf.id} className="h-16 w-16 rounded-lg bg-muted border flex items-center justify-center overflow-hidden">
                            {pf.file_url && pf.mime_type?.startsWith("image/") ? (
                              <img src={pf.file_url} alt={pf.file_name || "Evidence"} className="h-full w-full object-cover" />
                            ) : (
                              <FileText className="h-5 w-5 text-muted-foreground" />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {delivery_tracking?.tracking_number && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Courier Reference:</span>
                      <span className="font-mono font-semibold text-foreground">{delivery_tracking.tracking_number}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Transaction Timeline */}
            <Card className="shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">Transaction Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <TransactionTimeline
                  statusHistory={status_history}
                  currentStatus={tx.status}
                  currentStatusIndex={currentStatusIndex}
                  pricing={pricing}
                  deliveryTracking={delivery_tracking}
                />
              </CardContent>
            </Card>

            {/* Buyer Protection */}
            <Card className="shadow-sm border-primary/20 bg-primary/5">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">Your Money is Protected</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  SafeDeal holds your payment in secure escrow until you confirm the item matches what was agreed. If there's an issue, you can raise a dispute.
                </p>
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-foreground">What happens next?</h4>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 text-success shrink-0 mt-0.5" />
                      Inspect the item carefully to ensure it matches the description
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 text-success shrink-0 mt-0.5" />
                      If everything is correct, click "Verify Item Received" to release funds
                    </li>
                    <li className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                      If item is damaged, wrong, or missing, raise a dispute immediately
                    </li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* Contact Seller */}
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">Contact Seller</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Have questions about your order? Contact the seller directly through SafeDeal's secure messaging.
                </p>
                <Button variant="outline" className="w-full font-semibold">
                  <MessageSquare className="h-4 w-4" /> Send Message to Seller
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Right sidebar */}
          <div className="space-y-6">
            {/* Next Action (desktop) */}
            <div className="hidden lg:block">
              <NextActionCard data={data} navigate={navigate} />
            </div>

            {/* Seller Information */}
            {seller && (
              <Card className="shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Seller Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                      {seller.avatar_url ? (
                        <img src={seller.avatar_url} alt={seller.full_name} className="h-full w-full rounded-full object-cover" />
                      ) : (
                        <span className="text-lg font-bold text-muted-foreground">{seller.full_name.charAt(0)}</span>
                      )}
                    </div>
                    <div>
                      <p className="font-bold text-foreground">{seller.full_name}</p>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Star className="h-3 w-3 text-warning fill-warning" /> 4.9
                      </div>
                    </div>
                  </div>
                  <Separator />
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Member Since</span>
                      <span className="font-semibold text-foreground">{format(new Date(seller.member_since), "MMMM yyyy")}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Response Time</span>
                      <span className="font-semibold text-foreground">Under 2 hours</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Verification</span>
                      <span className="font-semibold text-success flex items-center gap-1"><BadgeCheck className="h-3.5 w-3.5" /> Verified</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Payment Summary */}
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Payment Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Item Price</span>
                    <span className="font-semibold text-foreground">{formatCurrency(pricing.item_amount, pricing.currency_code)}</span>
                  </div>
                  {pricing.platform_fee_amount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Platform Fee</span>
                      <span className="text-foreground">{formatCurrency(pricing.platform_fee_amount, pricing.currency_code)}</span>
                    </div>
                  )}
                  {pricing.processing_fee_amount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Processing Fee</span>
                      <span className="text-foreground">{formatCurrency(pricing.processing_fee_amount, pricing.currency_code)}</span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between">
                    <span className="font-bold text-foreground">Total Paid</span>
                    <span className="font-bold text-foreground">{formatCurrency(pricing.buyer_total_amount, pricing.currency_code)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Currency</span>
                    <span className="font-semibold text-foreground">{pricing.currency_code}</span>
                  </div>
                </div>
                <div className="pt-2">
                  <span className="text-xs text-muted-foreground">Money Status</span>
                  <div className="mt-1">
                    <Badge variant="outline" className={`${mBadge.className} text-xs`}>{mBadge.label}</Badge>
                  </div>
                </div>
                <Button variant="outline" className="w-full mt-2" size="sm">
                  <Download className="h-4 w-4" /> Download Receipt
                </Button>
              </CardContent>
            </Card>

            {/* Dispute card if exists */}
            {dispute && (
              <Card className="shadow-sm border-destructive/20">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <Scale className="h-5 w-5 text-destructive" />
                    <CardTitle className="text-lg">Dispute</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Status</span>
                      <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 text-xs capitalize">{dispute.status.replace(/_/g, " ")}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Reason</span>
                      <span className="font-semibold text-foreground text-xs capitalize">{dispute.reason.replace(/_/g, " ")}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Opened</span>
                      <span className="text-foreground text-xs">{formatDistanceToNow(new Date(dispute.opened_at), { addSuffix: true })}</span>
                    </div>
                  </div>
                  <Button
                    className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90 font-semibold"
                    size="sm"
                    onClick={() => navigate(`/dashboard/disputes/${dispute.id}`)}
                  >
                    View Dispute <ChevronRight className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

/* ───── Next Action Card ───── */
function NextActionCard({ data, navigate }: { data: TransactionDetailResponse; navigate: ReturnType<typeof useNavigate> }) {
  const { transaction: tx, next_action, dispute } = data;
  const countdown = useCountdown(tx.verification_deadline_at);

  return (
    <Card className="shadow-md border-warning/30 bg-warning/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-warning" />
          {next_action.label}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{next_action.description}</p>

        {tx.status === "delivered_awaiting_verification" && countdown && (
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-1">Verification Countdown</p>
            <p className="text-3xl font-mono font-bold text-warning">{countdown}</p>
            <p className="text-xs text-muted-foreground mt-1">Funds auto-release if no action taken</p>
          </div>
        )}

        <div className="space-y-2">
          {tx.status === "delivered_awaiting_verification" && (
            <>
              <Button
                className="w-full bg-success text-success-foreground hover:bg-success/90 font-bold"
                onClick={() => navigate(`/dashboard/transactions/${tx.id}/verify`)}
              >
                <CheckCircle className="h-4 w-4" /> Verify Item Received
              </Button>
              <Button
                variant="outline"
                className="w-full border-destructive/30 text-destructive hover:bg-destructive/5 font-semibold"
                onClick={() => navigate(`/dashboard/transactions/${tx.id}/verify`)}
              >
                <Scale className="h-4 w-4" /> Raise Dispute
              </Button>
            </>
          )}
          {next_action.action === "view_dispute" && dispute && (
            <Button
              className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90 font-bold"
              onClick={() => navigate(`/dashboard/disputes/${dispute.id}`)}
            >
              <Scale className="h-4 w-4" /> View Dispute
            </Button>
          )}
        </div>

        {tx.status === "delivered_awaiting_verification" && (
          <>
            <Separator />
            <p className="text-xs font-semibold text-muted-foreground">Other Actions</p>
            <div className="space-y-1">
              <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground">
                <Download className="h-4 w-4" /> Download Receipt
              </Button>
              <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground">
                <HelpCircle className="h-4 w-4" /> Contact Support
              </Button>
              <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground">
                <Flag className="h-4 w-4" /> Report Issue
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ───── Timeline Component ───── */
function TransactionTimeline({
  statusHistory,
  currentStatus,
  currentStatusIndex,
  pricing,
  deliveryTracking,
}: {
  statusHistory: TransactionStatusEntry[];
  currentStatus: string;
  currentStatusIndex: number;
  pricing: TransactionDetailResponse["pricing"];
  deliveryTracking: TransactionDetailResponse["delivery_tracking"];
}) {
  const historyMap = new Map<string, TransactionStatusEntry>();
  for (const entry of statusHistory) {
    historyMap.set(entry.new_status, entry);
  }

  return (
    <div className="relative space-y-0">
      {timelineSteps.map((step, idx) => {
        const entry = historyMap.get(step.status);
        const stepIdx = getStatusIndex(step.status);
        // Special handling for "buyer_verification" and "completed"
        const isReached = step.status === "buyer_verification"
          ? currentStatus === "completed"
          : step.status === "completed"
            ? currentStatus === "completed"
            : stepIdx <= currentStatusIndex;
        const isCurrent = step.status === "buyer_verification"
          ? currentStatus === "delivered_awaiting_verification"
          : step.status === currentStatus;
        const Icon = step.icon;

        let subtitle = "";
        if (entry) {
          subtitle = format(new Date(entry.changed_at), "MMMM d, yyyy 'at' h:mm a");
        }

        // Extra info
        let extraInfo = "";
        if (step.status === "payment_secured" && isReached) {
          extraInfo = `${formatCurrency(pricing.buyer_total_amount, pricing.currency_code)} held securely in escrow`;
        }
        if (step.status === "seller_dispatched" && deliveryTracking?.tracking_number) {
          extraInfo = `Tracking: ${deliveryTracking.tracking_number}`;
        }
        if (step.status === "buyer_verification" && isCurrent) {
          extraInfo = "Action Required: Verify item received";
        }
        if (step.status === "completed" && !isReached) {
          extraInfo = "Pending buyer verification";
        }

        return (
          <div key={step.status} className="relative flex gap-4 pb-6 last:pb-0">
            {/* Vertical line */}
            {idx < timelineSteps.length - 1 && (
              <div className={`absolute left-[19px] top-10 w-0.5 h-[calc(100%-24px)] ${isReached ? "bg-success" : "bg-border"}`} />
            )}
            {/* Icon */}
            <div className={`relative z-10 h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${
              isCurrent ? "bg-warning/15 border-2 border-warning" :
              isReached ? "bg-success/15 border-2 border-success" :
              "bg-muted border-2 border-border"
            }`}>
              <Icon className={`h-4 w-4 ${
                isCurrent ? "text-warning" :
                isReached ? "text-success" :
                "text-muted-foreground"
              }`} />
            </div>
            {/* Content */}
            <div className="flex-1 min-w-0 pt-1.5">
              <p className={`text-sm font-semibold ${isReached || isCurrent ? "text-foreground" : "text-muted-foreground"}`}>
                {step.label}
              </p>
              {subtitle && (
                <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
              )}
              {extraInfo && (
                <p className={`text-xs mt-0.5 ${isCurrent ? "text-warning font-semibold" : "text-muted-foreground"}`}>
                  {extraInfo}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default BuyerTransactionDetail;
