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
  Layers,
  Tag,
  Lock,
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

/* ───── Next Action Card (reusable for mobile + sidebar) ───── */
function NextActionCard({
  nextAction,
  txStatus,
  txId,
  countdown,
  dispute,
  navigate,
}: {
  nextAction: TransactionDetailResponse["next_action"];
  txStatus: string;
  txId: string;
  countdown: string;
  dispute: TransactionDetailResponse["dispute"];
  navigate: ReturnType<typeof useNavigate>;
}) {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-warning to-warning/80 p-6 text-warning-foreground shadow-lg">
      <div className="flex items-start gap-3 mb-4">
        <div className="h-10 w-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold">{nextAction.label}</h2>
        </div>
      </div>

      <Separator className="bg-white/20 mb-4" />

      <p className="text-sm opacity-90 mb-4">{nextAction.description}</p>

      {txStatus === "delivered_awaiting_verification" && countdown && (
        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20 mb-5 text-center">
          <p className="text-xs opacity-80 mb-1">Verification Countdown</p>
          <p className="text-4xl font-bold tabular-nums">{countdown}</p>
          <p className="text-xs opacity-80 mt-1">Funds auto-release if no action taken</p>
        </div>
      )}

      <div className="space-y-2">
        {txStatus === "delivered_awaiting_verification" && (
          <>
            <Button
              className="w-full bg-white hover:bg-white/90 text-warning font-bold h-11"
              onClick={() => navigate(`/dashboard/transactions/${txId}/verify`)}
            >
              <CheckCircle className="h-4 w-4" /> Verify Item Received
            </Button>
            <Button
              className="w-full bg-white/10 hover:bg-white/20 text-warning-foreground border border-white/20 font-semibold h-11"
              onClick={() => navigate(`/dashboard/transactions/${txId}/verify`)}
            >
              <Scale className="h-4 w-4" /> Raise Dispute
            </Button>
          </>
        )}
        {nextAction.action === "view_dispute" && dispute && (
          <Button
            className="w-full bg-white hover:bg-white/90 text-warning font-bold h-11"
            onClick={() => navigate(`/dashboard/disputes/${dispute.id}`)}
          >
            <Scale className="h-4 w-4" /> View Dispute
          </Button>
        )}
      </div>

      {txStatus === "delivered_awaiting_verification" && (
        <div className="mt-5 pt-4 border-t border-white/20">
          <p className="text-xs font-semibold opacity-80 mb-3">Other Actions</p>
          <div className="space-y-1.5">
            <button className="w-full flex items-center gap-2.5 text-sm bg-white/10 hover:bg-white/20 rounded-lg px-3 py-2 transition-colors">
              <Download className="h-4 w-4" /> Download Receipt
            </button>
            <button className="w-full flex items-center gap-2.5 text-sm bg-white/10 hover:bg-white/20 rounded-lg px-3 py-2 transition-colors">
              <HelpCircle className="h-4 w-4" /> Contact Support
            </button>
            <button className="w-full flex items-center gap-2.5 text-sm bg-white/10 hover:bg-white/20 rounded-lg px-3 py-2 transition-colors">
              <Flag className="h-4 w-4" /> Report Issue
            </button>
          </div>
        </div>
      )}
    </div>
  );
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

  const countdown = useCountdown(data?.transaction.verification_deadline_at ?? null);

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

      {/* Back link bar */}
      <div className="bg-muted/50 border-b border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-3">
          <Link to="/dashboard/transactions" className="inline-flex items-center gap-1.5 text-primary hover:text-primary/80 text-sm font-medium transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back to My Purchases
          </Link>
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 py-6">

        {/* ── Header Card (dark background) ── */}
        <div className="rounded-xl bg-foreground text-background p-6 mb-6 sm:mb-8 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-xl sm:text-2xl font-bold">{tx.transaction_code}</h1>
                <Badge className="bg-success/20 text-success border-success/30 text-xs font-bold">{sBadge.label}</Badge>
              </div>
              <p className="text-sm opacity-70">
                Created on {format(new Date(tx.created_at), "MMMM d, yyyy 'at' h:mm a")}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold">
                <Truck className="h-4 w-4" /> Track Order
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="inline-flex items-center gap-1.5 text-sm font-medium opacity-70 hover:opacity-100 transition-opacity">
                    <MoreHorizontal className="h-4 w-4" /> More Actions
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {agreement && (
                    <DropdownMenuItem onClick={() => navigate(`/dashboard/transactions/${tx.id}/agreement`)}>
                      <FileText className="h-4 w-4 mr-2" /> View Locked Agreement
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem><Download className="h-4 w-4 mr-2" /> Download Receipt</DropdownMenuItem>
                  <DropdownMenuItem><HelpCircle className="h-4 w-4 mr-2" /> Contact Support</DropdownMenuItem>
                  <DropdownMenuItem><Flag className="h-4 w-4 mr-2" /> Report Issue</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Escrow banner nested inside header card */}
          {escrow && (escrow.state === "funds_held" || tx.money_status === "funds_held_in_escrow") && (
            <div className="mt-4 bg-primary/10 border border-primary/20 rounded-xl p-4 flex items-start gap-3">
              <Shield className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold">Escrow Protection Active</p>
                <p className="text-sm opacity-70 mt-0.5">
                  Your payment of <span className="font-semibold">{formatCurrency(escrow.held_amount, pricing.currency_code)}</span> is securely held by SafeDeal. Funds will be released to the seller once you verify the item received matches what was agreed.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── 3-Column Grid ── */}
        <div className="grid lg:grid-cols-3 gap-6 sm:gap-8">

          {/* ═══ LEFT COLUMN (2/3) ═══ */}
          <div className="lg:col-span-2 space-y-6">

            {/* Mobile-only Next Action */}
            {next_action && (
              <div className="lg:hidden">
                <NextActionCard
                  nextAction={next_action}
                  txStatus={tx.status}
                  txId={tx.id}
                  countdown={countdown}
                  dispute={dispute}
                  navigate={navigate}
                />
              </div>
            )}

            {/* ── Item Details ── */}
            <Card className="shadow-sm">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-2">
                  <Package className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">Item Details</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="aspect-square rounded-xl bg-muted flex items-center justify-center">
                    <ImageIcon className="h-16 w-16 text-muted-foreground/30" />
                  </div>
                  <div className="space-y-4">
                    <h3 className="text-xl font-bold text-foreground">{item.title}</h3>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 text-sm">
                        <Layers className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-muted-foreground">Quantity:</span>
                        <span className="font-semibold text-foreground">{item.quantity}</span>
                      </div>
                      {item.condition && (
                        <div className="flex items-center gap-3 text-sm">
                          <Star className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="text-muted-foreground">Condition:</span>
                          <span className="font-semibold text-foreground">{item.condition}</span>
                        </div>
                      )}
                      {item.category && (
                        <div className="flex items-center gap-3 text-sm">
                          <Tag className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="text-muted-foreground">Category:</span>
                          <span className="font-semibold text-foreground">{item.category}</span>
                        </div>
                      )}
                    </div>
                    {item.description && (
                      <div className="pt-2">
                        <h4 className="text-sm font-semibold text-foreground mb-1.5">Description</h4>
                        <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ── Delivery Details ── */}
            {delivery_terms && (
              <Card className="shadow-sm">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-2">
                    <Truck className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg">Delivery Details</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Delivery Method</p>
                        <p className="font-semibold text-foreground capitalize">{delivery_terms.delivery_method.replace(/_/g, " ")}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Expected Delivery</p>
                        <p className="font-semibold text-foreground">{format(new Date(delivery_terms.expected_delivery_date), "MMMM d, yyyy")}</p>
                      </div>
                      {delivery_terms.delivery_address_line1 && (
                        <div>
                          <p className="text-muted-foreground">Destination</p>
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
                    <div className="space-y-3">
                      {delivery_proof_files.length > 0 && (
                        <div>
                          <p className="text-sm font-semibold text-foreground mb-2">Delivery Evidence</p>
                          <div className="grid grid-cols-2 gap-2">
                            {delivery_proof_files.map((pf) => (
                              <div key={pf.id} className="aspect-video rounded-lg bg-muted border flex items-center justify-center overflow-hidden">
                                {pf.file_url && pf.mime_type?.startsWith("image/") ? (
                                  <img src={pf.file_url} alt={pf.file_name || "Evidence"} className="h-full w-full object-cover" />
                                ) : (
                                  <FileText className="h-8 w-8 text-muted-foreground/40" />
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {delivery_tracking?.tracking_number && (
                        <p className="text-sm text-muted-foreground">
                          Courier Reference: <span className="font-mono font-semibold text-foreground">{delivery_tracking.tracking_number}</span>
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── Transaction Timeline ── */}
            <Card className="shadow-sm">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">Transaction Timeline</CardTitle>
                </div>
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

            {/* ── Buyer Protection ── */}
            <Card className="shadow-sm">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">Buyer Protection</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-start gap-3">
                  <Shield className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Your Money is Protected</p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      SafeDeal holds your payment in secure escrow until you confirm the item matches what was agreed. If there's an issue, you can raise a dispute.
                    </p>
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-foreground mb-3">What happens next?</h4>
                  <ul className="space-y-2.5">
                    <li className="flex items-start gap-2.5 text-sm text-muted-foreground">
                      <CheckCircle className="h-4 w-4 text-success shrink-0 mt-0.5" />
                      Inspect the item carefully to ensure it matches the description
                    </li>
                    <li className="flex items-start gap-2.5 text-sm text-muted-foreground">
                      <CheckCircle className="h-4 w-4 text-success shrink-0 mt-0.5" />
                      If everything is correct, click "Verify Item Received" to release funds
                    </li>
                    <li className="flex items-start gap-2.5 text-sm text-muted-foreground">
                      <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                      If item is damaged, wrong, or missing, raise a dispute immediately
                    </li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* ── Contact Seller ── */}
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
                <Button className="w-full font-semibold">
                  <MessageSquare className="h-4 w-4" /> Send Message to Seller
                </Button>
              </CardContent>
            </Card>

            {/* ── Dispute Card ── */}
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

          {/* ═══ RIGHT SIDEBAR (1/3) ═══ */}
          <div className="space-y-6">

            {/* Desktop-only Next Action (sticky) */}
            {next_action && (
              <div className="hidden lg:block sticky top-24">
                <div className="space-y-6">
                  <NextActionCard
                    nextAction={next_action}
                    txStatus={tx.status}
                    txId={tx.id}
                    countdown={countdown}
                    dispute={dispute}
                    navigate={navigate}
                  />

                  {/* ── Seller Information ── */}
                  {seller && (
                    <Card className="shadow-sm">
                      <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                          <BadgeCheck className="h-5 w-5 text-primary" />
                          <CardTitle className="text-lg">Seller Information</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex items-center gap-4">
                          <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center shrink-0">
                            {seller.avatar_url ? (
                              <img src={seller.avatar_url} alt={seller.full_name} className="h-full w-full rounded-full object-cover" />
                            ) : (
                              <span className="text-xl font-bold text-muted-foreground">{seller.full_name.charAt(0)}</span>
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-foreground text-lg">{seller.full_name}</p>
                              <BadgeCheck className="h-4 w-4 text-primary" />
                            </div>
                            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                              <Star className="h-3.5 w-3.5 text-warning fill-warning" />
                              <span className="font-semibold text-foreground">4.9</span>
                              <span>•</span>
                              <span>127 transactions</span>
                            </div>
                          </div>
                        </div>
                        <Separator />
                        <div className="space-y-0 text-sm divide-y divide-border">
                          <div className="flex justify-between py-3 first:pt-0">
                            <span className="text-muted-foreground">Member Since</span>
                            <span className="font-semibold text-foreground">{format(new Date(seller.member_since), "MMMM yyyy")}</span>
                          </div>
                          <div className="flex justify-between py-3">
                            <span className="text-muted-foreground">Response Time</span>
                            <span className="font-semibold text-foreground">Under 2 hours</span>
                          </div>
                          <div className="flex justify-between py-3 last:pb-0">
                            <span className="text-muted-foreground">Verification Status</span>
                            <span className="font-semibold text-success flex items-center gap-1">
                              <BadgeCheck className="h-3.5 w-3.5" /> Verified
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* ── Payment Summary ── */}
                  <Card className="shadow-sm">
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-primary" />
                        <CardTitle className="text-lg">Payment Summary</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2.5 text-sm">
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
                          <span className="font-bold text-lg text-primary">{formatCurrency(pricing.buyer_total_amount, pricing.currency_code)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Currency</span>
                          <span className="font-semibold text-foreground">{pricing.currency_code}</span>
                        </div>
                      </div>
                      <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-start gap-3">
                        <Lock className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-semibold text-foreground">Money Status</p>
                          <p className="text-sm text-muted-foreground mt-0.5">{mBadge.label}</p>
                        </div>
                      </div>
                      <Button variant="outline" className="w-full font-semibold">
                        <Download className="h-4 w-4" /> Download Receipt
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}

            {/* Mobile-only Seller + Payment (when no next_action, sidebar still shows on desktop) */}
            {!next_action && (
              <>
                {seller && (
                  <Card className="shadow-sm">
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-2">
                        <BadgeCheck className="h-5 w-5 text-primary" />
                        <CardTitle className="text-lg">Seller Information</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center gap-4">
                        <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center shrink-0">
                          {seller.avatar_url ? (
                            <img src={seller.avatar_url} alt={seller.full_name} className="h-full w-full rounded-full object-cover" />
                          ) : (
                            <span className="text-xl font-bold text-muted-foreground">{seller.full_name.charAt(0)}</span>
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-foreground text-lg">{seller.full_name}</p>
                            <BadgeCheck className="h-4 w-4 text-primary" />
                          </div>
                          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <Star className="h-3.5 w-3.5 text-warning fill-warning" />
                            <span className="font-semibold text-foreground">4.9</span>
                            <span>•</span>
                            <span>127 transactions</span>
                          </div>
                        </div>
                      </div>
                      <Separator />
                      <div className="space-y-0 text-sm divide-y divide-border">
                        <div className="flex justify-between py-3 first:pt-0">
                          <span className="text-muted-foreground">Member Since</span>
                          <span className="font-semibold text-foreground">{format(new Date(seller.member_since), "MMMM yyyy")}</span>
                        </div>
                        <div className="flex justify-between py-3">
                          <span className="text-muted-foreground">Response Time</span>
                          <span className="font-semibold text-foreground">Under 2 hours</span>
                        </div>
                        <div className="flex justify-between py-3 last:pb-0">
                          <span className="text-muted-foreground">Verification Status</span>
                          <span className="font-semibold text-success flex items-center gap-1">
                            <BadgeCheck className="h-3.5 w-3.5" /> Verified
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Card className="shadow-sm">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-primary" />
                      <CardTitle className="text-lg">Payment Summary</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2.5 text-sm">
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
                        <span className="font-bold text-lg text-primary">{formatCurrency(pricing.buyer_total_amount, pricing.currency_code)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Currency</span>
                        <span className="font-semibold text-foreground">{pricing.currency_code}</span>
                      </div>
                    </div>
                    <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-start gap-3">
                      <Lock className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-foreground">Money Status</p>
                        <p className="text-sm text-muted-foreground mt-0.5">{mBadge.label}</p>
                      </div>
                    </div>
                    <Button variant="outline" className="w-full font-semibold">
                      <Download className="h-4 w-4" /> Download Receipt
                    </Button>
                  </CardContent>
                </Card>
              </>
            )}

            {/* Mobile-only Seller + Payment when next_action exists */}
            {next_action && (
              <div className="lg:hidden space-y-6">
                {seller && (
                  <Card className="shadow-sm">
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-2">
                        <BadgeCheck className="h-5 w-5 text-primary" />
                        <CardTitle className="text-lg">Seller Information</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center gap-4">
                        <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center shrink-0">
                          {seller.avatar_url ? (
                            <img src={seller.avatar_url} alt={seller.full_name} className="h-full w-full rounded-full object-cover" />
                          ) : (
                            <span className="text-xl font-bold text-muted-foreground">{seller.full_name.charAt(0)}</span>
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-foreground text-lg">{seller.full_name}</p>
                            <BadgeCheck className="h-4 w-4 text-primary" />
                          </div>
                          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <Star className="h-3.5 w-3.5 text-warning fill-warning" />
                            <span className="font-semibold text-foreground">4.9</span>
                            <span>•</span>
                            <span>127 transactions</span>
                          </div>
                        </div>
                      </div>
                      <Separator />
                      <div className="space-y-0 text-sm divide-y divide-border">
                        <div className="flex justify-between py-3 first:pt-0">
                          <span className="text-muted-foreground">Member Since</span>
                          <span className="font-semibold text-foreground">{format(new Date(seller.member_since), "MMMM yyyy")}</span>
                        </div>
                        <div className="flex justify-between py-3">
                          <span className="text-muted-foreground">Response Time</span>
                          <span className="font-semibold text-foreground">Under 2 hours</span>
                        </div>
                        <div className="flex justify-between py-3 last:pb-0">
                          <span className="text-muted-foreground">Verification Status</span>
                          <span className="font-semibold text-success flex items-center gap-1">
                            <BadgeCheck className="h-3.5 w-3.5" /> Verified
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
                <Card className="shadow-sm">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-primary" />
                      <CardTitle className="text-lg">Payment Summary</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2.5 text-sm">
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
                        <span className="font-bold text-lg text-primary">{formatCurrency(pricing.buyer_total_amount, pricing.currency_code)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Currency</span>
                        <span className="font-semibold text-foreground">{pricing.currency_code}</span>
                      </div>
                    </div>
                    <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-start gap-3">
                      <Lock className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-foreground">Money Status</p>
                        <p className="text-sm text-muted-foreground mt-0.5">{mBadge.label}</p>
                      </div>
                    </div>
                    <Button variant="outline" className="w-full font-semibold">
                      <Download className="h-4 w-4" /> Download Receipt
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

/* ───── Timeline Component (connected vertical line) ───── */
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
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-5 top-5 bottom-5 w-0.5 bg-border" />

      <div className="space-y-0">
        {timelineSteps.map((step, i) => {
          const entry = historyMap.get(step.status);
          const stepIdx = getStatusIndex(step.status);
          const isReached = step.status === "buyer_verification"
            ? currentStatus === "completed"
            : step.status === "completed"
              ? currentStatus === "completed"
              : stepIdx <= currentStatusIndex;
          const isCurrent = step.status === "buyer_verification"
            ? currentStatus === "delivered_awaiting_verification"
            : step.status === currentStatus;

          let subtitle = "";
          if (entry) {
            subtitle = format(new Date(entry.changed_at), "MMMM d, yyyy 'at' h:mm a");
          }

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

          const isLast = i === timelineSteps.length - 1;

          return (
            <div key={step.status} className="relative flex items-start gap-4 pb-6 last:pb-0">
              {/* Circle */}
              <div className={`relative z-10 h-10 w-10 rounded-full flex items-center justify-center shrink-0 border-4 border-background shadow-lg ${
                isReached
                  ? "bg-success/20"
                  : isCurrent
                    ? "bg-warning animate-pulse"
                    : "bg-muted"
              }`}>
                {isReached ? (
                  <CheckCircle className="h-5 w-5 text-success" />
                ) : isCurrent ? (
                  <Clock className="h-5 w-5 text-warning-foreground" />
                ) : (
                  <div className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
                )}
              </div>

              {/* Content card */}
              <div className={`flex-1 rounded-xl p-3 sm:p-4 min-w-0 ${
                isCurrent
                  ? "bg-warning/5 border-2 border-warning/30"
                  : isReached
                    ? "bg-success/5"
                    : "bg-muted/50"
              }`}>
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
    </div>
  );
}

export default BuyerTransactionDetail;
