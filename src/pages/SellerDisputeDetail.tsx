import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, RefreshCw, ChevronRight, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SellerNav } from "@/components/seller/SellerNav";
import { Footer } from "@/components/landing/Footer";
import { DisputeStatusBadge } from "@/components/disputes/DisputeStatusBadge";
import { DisputeMoneyStatusBadge } from "@/components/disputes/DisputeMoneyStatusBadge";
import { DisputeInfoBanner } from "@/components/disputes/DisputeInfoBanner";
import { DisputeTimeline } from "@/components/disputes/DisputeTimeline";
import { DisputeSupportCard } from "@/components/disputes/DisputeSupportCard";
import { DisputeResolutionSection } from "@/components/disputes/DisputeResolutionSection";
import { AgreementSnapshotSection } from "@/components/disputes/AgreementSnapshotSection";
import { DeliveryProofSection } from "@/components/disputes/DeliveryProofSection";
import { BuyerClaimSection } from "@/components/disputes/BuyerClaimSection";
import { SellerResponseSection } from "@/components/disputes/SellerResponseSection";
import { SellerResponseForm } from "@/components/seller-disputes/SellerResponseForm";
import { SellerPayoutImpactCard } from "@/components/seller-disputes/SellerPayoutImpactCard";
import { getSellerDisputeDetail } from "@/services/seller-dispute-detail.service";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

function formatDisputeRef(id: string): string {
  return `DSP-${id.substring(0, 8).toUpperCase()}`;
}

const SellerDisputeDetail = () => {
  const { disputeId } = useParams<{ disputeId: string }>();
  const [sellerName, setSellerName] = useState("Seller");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

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

  const showResponseForm =
    data &&
    !data.seller_response.has_response &&
    (data.dispute.status === "open" || data.dispute.status === "seller_response_pending");

  // Build a "seller" object to pass to DisputeCaseSummary-like display
  // but here the counterparty is the buyer
  const buyerForSummary = data?.buyer
    ? { id: data.buyer.id, name: data.buyer.name, avatar_url: data.buyer.avatar_url }
    : null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SellerNav sellerName={sellerName} avatarUrl={avatarUrl} />

      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          {/* Breadcrumb */}
          <nav className="flex items-center text-sm text-muted-foreground">
            <Link to="/seller" className="hover:text-foreground transition-colors">
              Seller
            </Link>
            <ChevronRight className="h-4 w-4 mx-1" />
            <Link to="/seller/disputes" className="hover:text-foreground transition-colors">
              Disputes
            </Link>
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
              <h2 className="text-xl font-bold text-foreground mb-2">
                Unable to load dispute
              </h2>
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
              {/* Page header */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
                    Dispute Case
                  </h1>
                  <p className="text-muted-foreground text-sm mt-1">
                    {formatDisputeRef(data.dispute.id)} · {data.dispute.reason_label}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <DisputeStatusBadge status={data.dispute.status} />
                  <DisputeMoneyStatusBadge status={data.transaction.money_status} />
                </div>
              </div>

              {/* Info banner */}
              <DisputeInfoBanner status={data.dispute.status} />

              {/* 2-column layout */}
              <div className="grid lg:grid-cols-3 gap-6">
                {/* Left column */}
                <div className="lg:col-span-2 space-y-6">
                  {/* Case summary card */}
                  <div className="rounded-2xl border bg-card overflow-hidden">
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

                      {buyerForSummary && (
                        <div className="flex items-center gap-3 pt-2 border-t border-border">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                            {buyerForSummary.name?.charAt(0)?.toUpperCase() ?? "?"}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              {buyerForSummary.name ?? "Unknown Buyer"}
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

                  {/* Evidence comparison */}
                  <div className="grid md:grid-cols-2 gap-6">
                    <BuyerClaimSection
                      reasonLabel={data.dispute.reason_label}
                      claim={data.buyer_claim}
                    />
                    <SellerResponseSection
                      sellerResponse={data.seller_response}
                      responseDueAt={data.dispute.seller_response_due_at}
                    />
                  </div>

                  {/* Seller response form */}
                  {showResponseForm && (
                    <SellerResponseForm
                      disputeId={data.dispute.id}
                      onSuccess={() => refetch()}
                    />
                  )}

                  {/* Agreement snapshot */}
                  <AgreementSnapshotSection snapshot={data.agreement_snapshot} />

                  {/* Delivery proof */}
                  <DeliveryProofSection deliveryProof={data.delivery_proof} />
                </div>

                {/* Right column */}
                <div className="space-y-6">
                  <SellerPayoutImpactCard impact={data.payout_impact} />
                  <DisputeTimeline
                    timeline={data.timeline}
                    currentStatus={data.dispute.status}
                  />
                  <DisputeSupportCard />
                </div>
              </div>

              {/* Resolution section */}
              {data.outcome && (
                <DisputeResolutionSection
                  outcome={data.outcome}
                  currencyCode={data.pricing?.currency_code ?? "NGN"}
                />
              )}
            </>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default SellerDisputeDetail;
