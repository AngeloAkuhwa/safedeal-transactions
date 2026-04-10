import { useParams, Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, ChevronRight, ArrowLeft, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SellerNav } from "@/components/seller/SellerNav";
import { Footer } from "@/components/landing/Footer";
import { DisputeStatusBadge } from "@/components/disputes/DisputeStatusBadge";
import { DisputeMoneyStatusBadge } from "@/components/disputes/DisputeMoneyStatusBadge";
import { AgreementSnapshotSection } from "@/components/disputes/AgreementSnapshotSection";
import { DeliveryProofSection } from "@/components/disputes/DeliveryProofSection";
import { BuyerClaimSection } from "@/components/disputes/BuyerClaimSection";
import { SellerResponseSection } from "@/components/disputes/SellerResponseSection";
import { DisputeSupportCard } from "@/components/disputes/DisputeSupportCard";
import { SellerResponseForm } from "@/components/seller-disputes/SellerResponseForm";
import { SellerPayoutImpactCard } from "@/components/seller-disputes/SellerPayoutImpactCard";
import { SellerDisputeContextBanner } from "@/components/seller-disputes/SellerDisputeContextBanner";
import { SellerDisputeTimeline } from "@/components/seller-disputes/SellerDisputeTimeline";
import { getSellerDisputeDetail } from "@/services/seller-dispute-detail.service";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

function formatDisputeRef(id: string): string {
  return `DSP-${id.substring(0, 8).toUpperCase()}`;
}

function formatDeadlineCountdown(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffH = Math.ceil(diffMs / (1000 * 60 * 60));
  if (diffH <= 0) return "Overdue";
  if (diffH <= 24) return `${diffH}h remaining`;
  const diffD = Math.ceil(diffH / 24);
  return `${diffD}d remaining`;
}

const SellerDisputeDetail = () => {
  const { disputeId } = useParams<{ disputeId: string }>();
  const [searchParams] = useSearchParams();
  const section = searchParams.get("section");
  const [sellerName, setSellerName] = useState("Seller");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const scrolledRef = useRef(false);

  useEffect(() => {
    const loadProfile = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase
        .from("profiles")
        .select("full_name, avatar_url")
        .eq("id", session.user.id)
        .single();
      if (data) {
        setSellerName(data.full_name || "Seller");
        setAvatarUrl(data.avatar_url);
      }
    };
    loadProfile();
  }, []);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["seller-dispute-detail", disputeId],
    queryFn: () => getSellerDisputeDetail(disputeId!),
    enabled: !!disputeId,
    retry: 1,
    staleTime: 30_000,
  });

  // Auto-scroll to section from query param
  useEffect(() => {
    if (data && section && !scrolledRef.current) {
      scrolledRef.current = true;
      requestAnimationFrame(() => {
        const el = document.getElementById(section);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    }
  }, [data, section]);

  const showResponseForm =
    data &&
    !data.seller_response.has_response &&
    (data.dispute.status === "open" || data.dispute.status === "seller_response_pending");

  const deadlineText = data?.dispute.seller_response_due_at
    ? formatDeadlineCountdown(data.dispute.seller_response_due_at)
    : null;

  const isDeadlineUrgent = data?.dispute.seller_response_due_at
    ? new Date(data.dispute.seller_response_due_at).getTime() - Date.now() < 24 * 60 * 60 * 1000
    : false;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SellerNav sellerName={sellerName} avatarUrl={avatarUrl} />

      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          {/* Breadcrumb */}
          <nav className="flex items-center text-sm text-muted-foreground">
            <Link to="/seller" className="hover:text-foreground transition-colors">Seller</Link>
            <ChevronRight className="h-4 w-4 mx-1" />
            <Link to="/seller/disputes" className="hover:text-foreground transition-colors">Disputes</Link>
            <ChevronRight className="h-4 w-4 mx-1" />
            <span className="text-foreground font-medium">
              {data ? formatDisputeRef(data.dispute.id) : "…"}
            </span>
          </nav>

          {/* Loading */}
          {isLoading && (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}

          {/* Error */}
          {isError && !isLoading && (
            <div className="rounded-2xl border bg-card p-12 text-center">
              <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
                <RefreshCw className="h-7 w-7 text-destructive" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-2">Unable to load dispute</h2>
              <p className="text-muted-foreground text-sm max-w-md mx-auto mb-4">
                {(error as Error)?.message || "Please try again."}
              </p>
              <div className="flex items-center justify-center gap-3">
                <Button variant="outline" asChild>
                  <Link to="/seller/disputes">
                    <ArrowLeft className="h-4 w-4" />
                    Back to Disputes
                  </Link>
                </Button>
                <Button onClick={() => refetch()}>
                  <RefreshCw className="h-4 w-4" />
                  Try Again
                </Button>
              </div>
            </div>
          )}

          {/* Content */}
          {data && !isLoading && !isError && (
            <>
              {/* ═══ OVERVIEW SECTION ═══ */}
              <div id="overview" className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
                    Dispute Case
                  </h1>
                  <p className="text-muted-foreground text-sm mt-1">
                    {formatDisputeRef(data.dispute.id)} · {data.dispute.reason_label}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <DisputeStatusBadge status={data.dispute.status} />
                  <DisputeMoneyStatusBadge status={data.transaction.money_status} />
                  {/* Response deadline badge */}
                  {deadlineText && showResponseForm && (
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-xs font-semibold gap-1",
                        isDeadlineUrgent
                          ? "bg-destructive/10 text-destructive border-destructive/20"
                          : "bg-warning/10 text-warning border-warning/20"
                      )}
                    >
                      <Clock className="h-3 w-3" />
                      {deadlineText}
                    </Badge>
                  )}
                </div>
              </div>

              {/* ═══ CONTEXTUAL BANNERS ═══ */}
              <SellerDisputeContextBanner
                status={data.dispute.status}
                responseDueAt={data.dispute.seller_response_due_at}
                isPayoutBlocked={data.payout_impact.is_blocked}
                hasResponse={data.seller_response.has_response}
              />

              {/* ═══ 2-COLUMN LAYOUT ═══ */}
              <div className="grid lg:grid-cols-3 gap-6">
                {/* Left column */}
                <div className="lg:col-span-2 space-y-6">
                  {/* Transaction details card */}
                  <div className="rounded-2xl border bg-card overflow-hidden" id="overview-card">
                    <div className="bg-muted/50 border-b border-border p-4 sm:p-6">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-bold text-foreground">Transaction Details</h3>
                        {data.transaction.code && (
                          <Link
                            to={`/seller/transactions/${data.transaction.id}`}
                            className="text-xs font-mono text-primary hover:underline"
                          >
                            #{data.transaction.code}
                          </Link>
                        )}
                      </div>
                    </div>
                    <div className="p-4 sm:p-6 space-y-4">
                      {data.item && (
                        <div>
                          <p className="text-base font-semibold text-foreground">
                            {data.item.title ?? "Untitled Item"}
                          </p>
                          {data.item.condition_label && (
                            <p className="text-sm text-muted-foreground">
                              Condition: {data.item.condition_label}
                            </p>
                          )}
                        </div>
                      )}

                      {data.buyer && (
                        <div className="flex items-center gap-3 pt-2 border-t border-border">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                            {data.buyer.name?.charAt(0)?.toUpperCase() ?? "?"}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              {data.buyer.name ?? "Unknown Buyer"}
                            </p>
                            <p className="text-xs text-muted-foreground">Buyer</p>
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Total Amount</p>
                          <p className="text-base font-bold text-foreground">
                            {data.pricing
                              ? new Intl.NumberFormat("en-NG", {
                                  style: "currency",
                                  currency: data.pricing.currency_code,
                                  minimumFractionDigits: 0,
                                }).format(data.pricing.buyer_total_amount)
                              : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Transaction Date</p>
                          <p className="text-sm font-medium text-foreground">
                            {new Date(data.transaction.created_at).toLocaleDateString("en-NG", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ═══ BUYER CLAIM ═══ */}
                  <div id="claim">
                    <BuyerClaimSection
                      reasonLabel={data.dispute.reason_label}
                      claim={data.buyer_claim}
                    />
                  </div>

                  {/* ═══ SELLER RESPONSE / FORM ═══ */}
                  {showResponseForm ? (
                    <SellerResponseForm
                      disputeId={data.dispute.id}
                      onSuccess={() => refetch()}
                    />
                  ) : (
                    <div id="respond">
                      <SellerResponseSection
                        sellerResponse={data.seller_response}
                        responseDueAt={data.dispute.seller_response_due_at}
                      />
                    </div>
                  )}

                  {/* ═══ AGREEMENT SNAPSHOT ═══ */}
                  <div id="agreement">
                    <AgreementSnapshotSection snapshot={data.agreement_snapshot} />
                  </div>

                  {/* ═══ DELIVERY PROOF ═══ */}
                  <div id="delivery">
                    <DeliveryProofSection deliveryProof={data.delivery_proof} />
                  </div>

                  {/* ═══ EVIDENCE GALLERY ═══ */}
                  {(data.buyer_claim.evidence.length > 0 || data.seller_response.evidence.length > 0) && (
                    <div id="evidence" className="rounded-2xl border bg-card overflow-hidden">
                      <div className="bg-muted/50 border-b border-border p-4 sm:p-6">
                        <h3 className="text-lg font-bold text-foreground">Evidence Gallery</h3>
                      </div>
                      <div className="p-4 sm:p-6">
                        <div className="grid md:grid-cols-2 gap-6">
                          {/* Buyer evidence */}
                          <div>
                            <p className="text-sm font-semibold text-foreground mb-3">
                              Buyer Evidence ({data.buyer_claim.evidence.length})
                            </p>
                            {data.buyer_claim.evidence.length === 0 ? (
                              <p className="text-xs text-muted-foreground">No evidence submitted</p>
                            ) : (
                              <div className="grid grid-cols-2 gap-2">
                                {data.buyer_claim.evidence.map((e) => (
                                  <div key={e.id} className="rounded-lg border overflow-hidden">
                                    {e.file_url && e.mime_type?.startsWith("image/") ? (
                                      <img src={e.file_url} alt={e.file_name ?? ""} className="w-full h-24 object-cover" />
                                    ) : (
                                      <div className="w-full h-24 bg-muted flex items-center justify-center text-xs text-muted-foreground">
                                        {e.file_name ?? "File"}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          {/* Seller evidence */}
                          <div>
                            <p className="text-sm font-semibold text-foreground mb-3">
                              Seller Evidence ({data.seller_response.evidence.length})
                            </p>
                            {data.seller_response.evidence.length === 0 ? (
                              <p className="text-xs text-muted-foreground">No evidence submitted</p>
                            ) : (
                              <div className="grid grid-cols-2 gap-2">
                                {data.seller_response.evidence.map((e) => (
                                  <div key={e.id} className="rounded-lg border overflow-hidden">
                                    {e.file_url && e.mime_type?.startsWith("image/") ? (
                                      <img src={e.file_url} alt={e.file_name ?? ""} className="w-full h-24 object-cover" />
                                    ) : (
                                      <div className="w-full h-24 bg-muted flex items-center justify-center text-xs text-muted-foreground">
                                        {e.file_name ?? "File"}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ═══ RESOLUTION ═══ */}
                  {data.outcome && (
                    <div id="resolution" className="rounded-2xl border bg-card overflow-hidden">
                      <div className="bg-success/5 border-b border-success/20 p-4 sm:p-6">
                        <h3 className="text-lg font-bold text-foreground">Resolution</h3>
                      </div>
                      <div className="p-4 sm:p-6 space-y-4">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className="text-xs font-bold bg-success/15 text-success border-success/20"
                          >
                            {data.outcome.outcome_type.replace(/_/g, " ")}
                          </Badge>
                        </div>
                        <p className="text-sm text-foreground">{data.outcome.decision_summary}</p>
                        <div className="grid grid-cols-2 gap-4 pt-3 border-t border-border">
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Released to You</p>
                            <p className="text-lg font-bold text-success">
                              {new Intl.NumberFormat("en-NG", {
                                style: "currency",
                                currency: data.pricing?.currency_code ?? "NGN",
                                minimumFractionDigits: 0,
                              }).format(data.outcome.release_amount)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Refunded to Buyer</p>
                            <p className="text-lg font-bold text-foreground">
                              {new Intl.NumberFormat("en-NG", {
                                style: "currency",
                                currency: data.pricing?.currency_code ?? "NGN",
                                minimumFractionDigits: 0,
                              }).format(data.outcome.refund_amount)}
                            </p>
                          </div>
                        </div>
                        {/* Payout effect */}
                        <div className="bg-muted/50 rounded-lg p-3">
                          <p className="text-xs text-foreground">
                            {data.outcome.release_amount > 0 && data.outcome.refund_amount > 0
                              ? "Partial release: Part of the funds will be released to you, and the remainder refunded to the buyer."
                              : data.outcome.release_amount > 0
                                ? "Your payout will be released in full."
                                : "Funds have been refunded to the buyer."}
                          </p>
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border">
                          <span>
                            Resolved {new Date(data.outcome.resolved_at).toLocaleDateString("en-NG", {
                              month: "short", day: "numeric", year: "numeric",
                            })}
                          </span>
                          {data.outcome.resolved_by_name && (
                            <span>By: {data.outcome.resolved_by_name}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Right sidebar */}
                <div className="space-y-6">
                  <SellerPayoutImpactCard impact={data.payout_impact} />
                  <SellerDisputeTimeline
                    timeline={data.timeline}
                    currentStatus={data.dispute.status}
                  />
                  <DisputeSupportCard />
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default SellerDisputeDetail;
