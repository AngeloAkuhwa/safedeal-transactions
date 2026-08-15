import { useState } from "react";
import { formatMoney } from "@/lib/format";
import { alwaysClaim } from "@/lib/trust/trust-claims";
import { useParams, Link, useNavigate } from "react-router";
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
  HelpCircle,
  ExternalLink,
  X,
  BadgeCheck,
  Star,
  Lock,
  Loader2,
  RefreshCw,
  Scale,
  Image as ImageIcon,
  ChevronRight,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { BuyerNav } from "@/components/dashboard/BuyerNav";
import { Footer } from "@/components/landing/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { getTransactionDetail } from "@/services/transaction-detail.service";
import type { TransactionDetailResponse } from "@/services/transaction-detail.service";
import { useBuyerIdentity } from "@/hooks/useBuyerIdentity";
import { InTransitBlock } from "@/components/transactions/InTransitBlock";
import { VerifyReceiptCTA } from "@/components/transactions/VerifyReceiptCTA";
import { DeliveryTermsCard } from "@/components/transactions/DeliveryTermsCard";
import { TransactionCompletionBanner } from "@/components/transactions/TransactionCompletionBanner";
import { TransactionConfirmationProgress } from "@/components/transactions/TransactionConfirmationProgress";
import { cn } from "@/lib/utils";
import { resolveTransactionLabel, resolveMoneyLabel, TONE_CLASSNAMES } from "@/lib/status-labels";
import { FEE_NAME, FEE_CAPTION } from "@/lib/payment/fee-policy";
import { keyActivate } from "@/lib/a11y";

/* ─── Helpers ─── */
/* ─── 8-step progress tracker ─── */
const PROGRESS_STEPS = [
  { key: "draft", label: "Created", icon: FileText },
  { key: "awaiting_payment", label: "Awaiting Payment", icon: Clock },
  { key: "payment_secured", label: "Payment Secured", icon: Shield },
  { key: "seller_preparing_delivery", label: "Preparing", icon: Package },
  { key: "seller_dispatched", label: "Dispatched", icon: Truck },
  { key: "delivered_awaiting_verification", label: "Delivered", icon: MapPin },
  { key: "buyer_verification", label: "Verification", icon: AlertTriangle },
  { key: "completed", label: "Completed", icon: CheckCircle },
];

const STATUS_ORDER = [
  "draft", "awaiting_buyer", "awaiting_payment", "payment_secured",
  "seller_preparing_delivery", "seller_dispatched",
  "delivered_awaiting_verification", "disputed", "completed", "refunded",
];

function getStatusIndex(status: string) {
  const idx = STATUS_ORDER.indexOf(status);
  return idx === -1 ? 0 : idx;
}

function getStepState(stepKey: string, currentStatus: string): "completed" | "current" | "upcoming" {
  const currentIdx = getStatusIndex(currentStatus);

  if (stepKey === "buyer_verification") {
    if (currentStatus === "completed") return "completed";
    if (currentStatus === "delivered_awaiting_verification") return "current";
    return getStatusIndex("delivered_awaiting_verification") < currentIdx ? "completed" : "upcoming";
  }
  if (stepKey === "completed") {
    return currentStatus === "completed" ? "completed" : "upcoming";
  }

  const stepIdx = getStatusIndex(stepKey);
  if (stepIdx < currentIdx) return "completed";
  if (stepIdx === currentIdx) return "current";
  return "upcoming";
}

/* ─── Lightbox ─── */
function Lightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt || "Image preview"}
      tabIndex={-1}
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
    >
      <button
        className="absolute top-4 right-4 text-white/70 hover:text-white bg-black/40 rounded-full p-2 transition-colors min-h-11 min-w-11 inline-flex items-center justify-center"
        onClick={onClose}
        aria-label="Close"
      >
        <X className="h-5 w-5" />
      </button>
      <img
        src={src}
        alt={alt}
        className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
      />
    </div>
  );
}

/* ─── Page ─── */
const BuyerTransactionTracking = () => {
  const { transactionId } = useParams<{ transactionId: string }>();
  const navigate = useNavigate();
  const { buyerName, avatarUrl } = useBuyerIdentity();
  const [lightboxSrc, setLightboxSrc] = useState<{ src: string; alt: string } | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["transaction-detail", transactionId],
    queryFn: () => getTransactionDetail(transactionId!),
    enabled: !!transactionId,
    retry: 1,
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background gap-4 px-4 text-center">
        <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <RefreshCw className="h-7 w-7 text-destructive" />
        </div>
        <h2 className="text-xl font-bold text-foreground">Could not load tracking info</h2>
        <p className="text-muted-foreground text-sm max-w-md">
          {(error as Error)?.message || "Please try again."}
        </p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => navigate(`/dashboard/transactions/${transactionId}`)}>
            <ArrowLeft className="h-4 w-4" /> Back to Transaction
          </Button>
          <Button onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" /> Retry
          </Button>
        </div>
      </div>
    );
  }

  const {
    transaction: tx, item, pricing, delivery_terms, delivery_tracking,
    delivery_proof_files, dispatch_evidence_files, seller, escrow, status_history, dispute, agreement, next_action, completion_event,
  } = data;
  const showInTransit = tx.status === "seller_dispatched" || tx.status === "delivered_awaiting_verification";
  const showVerifyCTA = tx.status === "delivered_awaiting_verification";

  const sEntry = resolveTransactionLabel(tx.status, "buyer");
  const mEntry = resolveMoneyLabel(tx.money_status, "buyer", {
    sellerConfirmed: tx.seller_confirmed_at ? true : false,
  });
  const sBadge = { label: sEntry.label, className: TONE_CLASSNAMES[sEntry.tone] };
  const mBadge = { label: mEntry.label, className: TONE_CLASSNAMES[mEntry.tone] };

  return (
    <div className="min-h-[100dvh] bg-muted/30 flex flex-col">
      <BuyerNav buyerName={buyerName} avatarUrl={avatarUrl} />

      {/* Breadcrumb */}
      <div className="bg-card border-b border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Link to="/dashboard/transactions" className="hover:text-foreground transition-colors">My Purchases</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <Link
            to={`/dashboard/transactions/${tx.id}`}
            className="hover:text-foreground transition-colors truncate max-w-[160px]"
          >
            {tx.transaction_code}
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-foreground font-medium">Tracking</span>
        </div>
      </div>

      {/* Trust banner */}
      <div className="bg-primary/5 border-b border-primary/20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-3 flex items-center gap-3">
          <Shield className="h-4 w-4 text-primary shrink-0" />
          <p className="text-xs sm:text-sm text-primary font-medium">
            {escrow?.state === "held"
              ? `Your payment of ${formatMoney(escrow.held_amount, pricing.currency_code)} is securely held in escrow — funds will only release once you verify receipt.`
              : escrow?.state === "released"
                ? "Transaction completed. Funds have been released to the seller."
                : escrow?.state === "refunded"
                  ? "Funds for this transaction have been refunded to you."
                  : escrow?.state === "frozen"
                    ? "Funds for this transaction are frozen while the dispute is reviewed."
                    : "No funds are held for this transaction yet."}
          </p>
        </div>
      </div>

      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 py-6 sm:py-8">

        {/* Transaction header */}
        <div className="bg-card rounded-2xl shadow-lg border border-border p-4 sm:p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-foreground mb-1">{item.title}</h1>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground font-mono">{tx.transaction_code}</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-xs text-muted-foreground">{format(new Date(tx.created_at), "MMM d, yyyy")}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge className={`${sBadge.className} text-xs font-bold px-3 py-1.5 rounded-full`}>{sBadge.label}</Badge>
              <Badge className={`${mBadge.className} text-xs font-bold px-3 py-1.5 rounded-full`}>{mBadge.label}</Badge>
            </div>
          </div>
        </div>

        {/* ── 8-step Progress Timeline ── */}
        <div className="bg-card rounded-2xl shadow-lg border border-border p-4 sm:p-6 mb-6">
          <h2 className="text-base sm:text-lg font-bold text-foreground mb-6 flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" />
            Order Progress
          </h2>
          <div className="overflow-x-auto pb-2">
            <div className="flex items-start min-w-[640px]">
              {PROGRESS_STEPS.map((step, i) => {
                const state = getStepState(step.key, tx.status);
                const Icon = step.icon;
                const isLast = i === PROGRESS_STEPS.length - 1;

                return (
                  <div key={step.key} className="flex items-start flex-1">
                    {/* Step */}
                    <div className="flex flex-col items-center flex-1">
                      <div className={cn(
                        "h-9 w-9 rounded-full flex items-center justify-center border-2 mb-2 transition-all",
                        state === "completed" && "bg-success/10 border-success",
                        state === "current" && "bg-primary border-primary animate-pulse",
                        state === "upcoming" && "bg-muted border-border",
                      )}>
                        <Icon className={cn(
                          "h-4 w-4",
                          state === "completed" && "text-success",
                          state === "current" && "text-primary-foreground",
                          state === "upcoming" && "text-muted-foreground/40",
                        )} />
                      </div>
                      <span className={cn(
                        "text-xs font-semibold text-center leading-tight max-w-[64px]",
                        state === "completed" && "text-success",
                        state === "current" && "text-primary",
                        state === "upcoming" && "text-muted-foreground/50",
                      )}>
                        {step.label}
                      </span>
                    </div>
                    {/* Connector */}
                    {!isLast && (
                      <div className={cn(
                        "flex-1 h-0.5 mt-4 mx-1",
                        state === "completed" ? "bg-success" : "bg-border",
                      )} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── 2-column grid ── */}
        <div className="grid lg:grid-cols-3 gap-5 sm:gap-6">

          {/* ═══ LEFT (2/3) ═══ */}
          <div className="lg:col-span-2 space-y-5 sm:space-y-6">

            {/* Phase A: handshake / awaiting-release progress. */}
            <TransactionConfirmationProgress
              buyerConfirmedAt={tx.buyer_confirmed_at ?? null}
              sellerConfirmedAt={tx.seller_confirmed_at ?? null}
              moneyStatus={tx.money_status}
            />

            {/* Completion banner — only after funds actually released. */}
            {tx.status === "completed" && tx.money_status === "funds_released" && completion_event && (
              <TransactionCompletionBanner
                variant={completion_event.variant}
                completedAt={completion_event.completed_at}
                fundsReleasedAt={completion_event.funds_released_at}
                perspective="buyer"
              />
            )}

            {showVerifyCTA && (
              <VerifyReceiptCTA
                transactionId={tx.id}
                deadlineAt={tx.verification_deadline_at}
                deliveredAt={delivery_tracking?.delivered_at ?? null}
              />
            )}

            {showInTransit && (
              <InTransitBlock
                deliveryTerms={delivery_terms}
                tracking={delivery_tracking}
                dispatchEvidence={dispatch_evidence_files}
                status={tx.status}
              />
            )}

            {/* Next Action */}
            {next_action && (
              <div className="rounded-2xl bg-gradient-to-br from-warning to-warning/90 p-5 text-warning-foreground shadow-lg">
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <h2 className="text-base font-bold">{next_action.label}</h2>
                </div>
                <p className="text-sm opacity-90 mb-4">{next_action.description}</p>
                {tx.status === "delivered_awaiting_verification" && (
                  <Button
                    className="w-full bg-white hover:bg-white/90 text-warning font-bold py-3 h-auto"
                    onClick={() => navigate(`/dashboard/transactions/${tx.id}/verify`)}
                  >
                    <CheckCircle className="h-4 w-4" /> Verify Item Received
                  </Button>
                )}
                {next_action.action === "view_dispute" && dispute && (
                  <Button
                    className="w-full bg-white hover:bg-white/90 text-warning font-bold h-11"
                    onClick={() => navigate(`/dashboard/disputes/${dispute.id}`)}
                  >
                    <Scale className="h-4 w-4" /> View Dispute
                  </Button>
                )}
              </div>
            )}

            {/* Delivery Tracking Card */}
            {(delivery_tracking || delivery_terms) && (
              <div className="bg-card rounded-2xl shadow-lg border border-border p-4 sm:p-6">
                <h2 className="text-base sm:text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                  <Truck className="h-5 w-5 text-primary" />
                  Delivery Tracking
                </h2>
                <div className="space-y-4">
                  {delivery_tracking?.courier_name && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground font-medium">Courier</span>
                      <span className="font-semibold text-foreground">{delivery_tracking.courier_name}</span>
                    </div>
                  )}
                  {delivery_tracking?.tracking_number && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground font-medium">Tracking Number</span>
                      <span className="font-mono font-semibold text-foreground text-xs bg-muted px-2 py-1 rounded">
                        {delivery_tracking.tracking_number}
                      </span>
                    </div>
                  )}
                  {delivery_tracking?.shipped_at && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground font-medium">Shipped</span>
                      <span className="font-semibold text-foreground">
                        {format(new Date(delivery_tracking.shipped_at), "MMM d, yyyy")}
                      </span>
                    </div>
                  )}
                  {(delivery_tracking?.expected_delivery_at || delivery_terms?.expected_delivery_date) && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground font-medium">Expected Delivery</span>
                      <span className="font-semibold text-foreground">
                        {format(
                          new Date(delivery_tracking?.expected_delivery_at || delivery_terms!.expected_delivery_date),
                          "MMM d, yyyy"
                        )}
                      </span>
                    </div>
                  )}
                  {delivery_tracking?.delivered_at && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground font-medium">Delivered</span>
                      <span className="font-semibold text-success">
                        {format(new Date(delivery_tracking.delivered_at), "MMM d, yyyy 'at' h:mm a")}
                      </span>
                    </div>
                  )}
                  {delivery_tracking?.tracking_url && (
                    <a
                      href={delivery_tracking.tracking_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 flex items-center justify-center gap-2 w-full bg-primary text-primary-foreground font-bold rounded-xl py-2.5 text-sm hover:bg-primary/90 transition-colors min-h-11"
                    >
                      <ExternalLink className="h-4 w-4" /> Track Package
                    </a>
                  )}
                  {!delivery_tracking?.tracking_number && !delivery_tracking?.tracking_url && (
                    <p className="text-sm text-muted-foreground italic">
                      Tracking information will be available once the seller dispatches the item.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Delivery Evidence */}
            {delivery_proof_files.length > 0 && (
              <div className="bg-card rounded-2xl shadow-lg border border-border p-4 sm:p-6">
                <h2 className="text-base sm:text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                  <ImageIcon className="h-5 w-5 text-primary" />
                  Delivery Evidence
                </h2>
                <p className="text-xs text-muted-foreground mb-4">
                  Proof of delivery uploaded by the seller. Click an image to enlarge.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {delivery_proof_files.map((pf) => (
                    <button
                      key={pf.id}
                      onClick={() =>
                        pf.file_url && pf.mime_type?.startsWith("image/")
                          ? setLightboxSrc({ src: pf.file_url, alt: pf.file_name || "Evidence" })
                          : pf.file_url && window.open(pf.file_url, "_blank")
                      }
                      className="h-36 rounded-xl bg-muted overflow-hidden hover:opacity-80 transition-opacity flex items-center justify-center border border-border"
                    >
                      {pf.file_url && pf.mime_type?.startsWith("image/") ? (
                        <img src={pf.file_url} alt={pf.file_name || "Evidence"} className="w-full h-full object-cover" />
                      ) : (
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <FileText className="h-8 w-8 opacity-40" />
                          <span className="text-xs">{pf.file_name || "Document"}</span>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Transaction Timeline / Audit Log */}
            <div className="bg-card rounded-2xl shadow-lg border border-border p-4 sm:p-6">
              <h2 className="text-base sm:text-lg font-bold text-foreground mb-5 flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                Transaction History
              </h2>
              {status_history.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No history yet.</p>
              ) : (
                <div className="relative">
                  {/* Vertical line */}
                  <div className="absolute left-4 top-4 bottom-4 w-0.5 bg-border" />
                  <div className="space-y-0">
                    {[...status_history].reverse().map((entry, i) => (
                      <div key={i} className="relative flex items-start gap-4 pb-5 last:pb-0">
                        <div className="relative z-10 h-8 w-8 rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center shrink-0">
                          <CheckCircle className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0 pt-0.5">
                          <p className="text-sm font-semibold text-foreground capitalize">
                            {entry.new_status.replace(/_/g, " ")}
                          </p>
                          {entry.old_status && (
                            <p className="text-xs text-muted-foreground">
                              from <span className="capitalize">{entry.old_status.replace(/_/g, " ")}</span>
                            </p>
                          )}
                          {entry.reason && (
                            <p className="text-xs text-muted-foreground mt-0.5">{entry.reason}</p>
                          )}
                          <p className="text-xs text-muted-foreground/70 mt-1">
                            {format(new Date(entry.changed_at), "MMM d, yyyy 'at' h:mm a")} ·{" "}
                            {formatDistanceToNow(new Date(entry.changed_at), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ═══ RIGHT SIDEBAR (1/3) ═══ */}
          <div className="space-y-5 sm:space-y-6">

            {delivery_terms && agreement && (
              <DeliveryTermsCard terms={delivery_terms} lockedAt={agreement.locked_at} compact />
            )}

            {/* Item Summary */}
            <div className="bg-card rounded-2xl shadow-lg border border-border p-4 sm:p-5">
              <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                <Package className="h-4 w-4 text-primary" />
                Item Summary
              </h3>
              <div className="h-32 rounded-xl bg-muted flex items-center justify-center mb-3 overflow-hidden">
                <ImageIcon className="h-10 w-10 text-muted-foreground/30" />
              </div>
              <p className="font-bold text-foreground text-sm mb-1">{item.title}</p>
              {item.condition && (
                <p className="text-xs text-muted-foreground capitalize">Condition: {item.condition}</p>
              )}
              {item.category && (
                <p className="text-xs text-muted-foreground">Category: {item.category}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">Qty: {item.quantity}</p>
            </div>

            {/* Seller Info */}
            {seller && (
              <div className="bg-card rounded-2xl shadow-lg border border-border p-4 sm:p-5">
                <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                  <BadgeCheck className="h-4 w-4 text-primary" />
                  Seller
                </h3>
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                    {seller.avatar_url ? (
                      <img src={seller.avatar_url} alt={seller.full_name} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-base font-bold text-muted-foreground">{seller.full_name.charAt(0)}</span>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">{seller.full_name}</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">Member since {format(new Date(seller.member_since), "MMMM yyyy")}</p>
              </div>
            )}

            {/* Payment Summary */}
            <div className="bg-card rounded-2xl shadow-lg border border-border p-4 sm:p-5">
              <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                <Lock className="h-4 w-4 text-primary" />
                Payment
              </h3>
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Item Price</span>
                  <span className="font-semibold text-foreground">{formatMoney(pricing.item_amount, pricing.currency_code)}</span>
                </div>
                {(pricing.service_fee_amount || 0) > 0 && (
                  <div className="flex justify-between text-xs text-muted-foreground border-b border-border pb-2">
                    <div>
                      <span>{FEE_NAME}{typeof pricing.service_fee_rate === "number" ? ` (${(pricing.service_fee_rate * 100).toFixed(1)}%)` : ""}</span>
                      <p className="text-xs text-muted-foreground mt-0.5">{FEE_CAPTION}</p>
                    </div>
                    <span className="font-semibold text-foreground">{formatMoney(pricing.service_fee_amount, pricing.currency_code)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-1">
                  <span className="text-sm font-bold text-foreground">Total</span>
                  <span className="text-sm font-bold text-primary">{formatMoney(pricing.total_amount, pricing.currency_code)}</span>
                </div>
              </div>
              <div className={`mt-3 text-xs font-semibold px-3 py-2 rounded-lg text-center ${mBadge.className}`}>
                {mBadge.label}
              </div>
            </div>

            {/* Help Card */}
            <div className="bg-muted/50 rounded-2xl border border-border p-4 sm:p-5">
              <h3 className="text-sm font-bold text-foreground mb-2 flex items-center gap-2">
                <HelpCircle className="h-4 w-4 text-primary" />
                Need Help?
              </h3>
              <p className="text-xs text-muted-foreground mb-3">
                If you have questions about this transaction or your delivery, our team is here to help.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs font-semibold rounded-xl"
                onClick={() => navigate(`/dashboard/transactions/${tx.id}`)}
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back to Transaction
              </Button>
            </div>
          </div>
        </div>
      </main>

      <Footer />

      {/* Lightbox */}
      {lightboxSrc && (
        <Lightbox
          src={lightboxSrc.src}
          alt={lightboxSrc.alt}
          onClose={() => setLightboxSrc(null)}
        />
      )}
    </div>
  );
};

export default BuyerTransactionTracking;
