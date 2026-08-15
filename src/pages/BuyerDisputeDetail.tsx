import { useParams, Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, ChevronRight, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BuyerNav } from "@/components/dashboard/BuyerNav";
import { Footer } from "@/components/landing/Footer";
import { DisputeStatusBadge } from "@/components/disputes/DisputeStatusBadge";
import { DisputeMoneyStatusBadge } from "@/components/disputes/DisputeMoneyStatusBadge";
import { DisputeInfoBanner } from "@/components/disputes/DisputeInfoBanner";
import { PossibleOutcomesPanel } from "@/components/disputes/PossibleOutcomesPanel";
import { DisputeCaseSummary } from "@/components/disputes/DisputeCaseSummary";
import { BuyerClaimSection } from "@/components/disputes/BuyerClaimSection";
import { SellerResponseSection } from "@/components/disputes/SellerResponseSection";
import { DisputeTimeline } from "@/components/disputes/DisputeTimeline";
import { DisputeSupportCard } from "@/components/disputes/DisputeSupportCard";
import { DisputeResolutionSection } from "@/components/disputes/DisputeResolutionSection";
import { AgreementSnapshotSection } from "@/components/disputes/AgreementSnapshotSection";
import { DeliveryProofSection } from "@/components/disputes/DeliveryProofSection";
import { getDisputeById } from "@/services/disputes.service";
import { useBuyerIdentity } from "@/hooks/useBuyerIdentity";
import { ListSkeleton } from "@/components/common/PageSkeleton";

function formatDisputeRef(id: string): string {
  return `DSP-${id.substring(0, 8).toUpperCase()}`;
}

const BuyerDisputeDetail = () => {
  const { disputeId } = useParams<{ disputeId: string }>();
  const { buyerName, avatarUrl } = useBuyerIdentity();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["dispute-detail", disputeId],
    queryFn: () => getDisputeById(disputeId!),
    enabled: !!disputeId,
    retry: 1,
    staleTime: 30_000,
  });

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <BuyerNav buyerName={buyerName} avatarUrl={avatarUrl} />

      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          {/* Breadcrumb */}
          <nav className="flex items-center text-sm text-muted-foreground">
            <Link to="/dashboard" className="hover:text-foreground transition-colors">
              Dashboard
            </Link>
            <ChevronRight className="h-4 w-4 mx-1" />
            <Link to="/dashboard/disputes" className="hover:text-foreground transition-colors">
              Disputes
            </Link>
            <ChevronRight className="h-4 w-4 mx-1" />
            <span className="text-foreground font-medium">
              {data ? formatDisputeRef(data.dispute.id) : "…"}
            </span>
          </nav>

          {/* Loading */}
          {isLoading && (
            <ListSkeleton label="Loading this dispute" rows={3} />
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
                  <Link to="/dashboard/disputes">
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
                    Dispute Status
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

              {/* Possible outcomes */}
              <PossibleOutcomesPanel status={data.dispute.status} />

              {/* 2-column layout */}
              <div className="grid lg:grid-cols-3 gap-6">
                {/* Left column */}
                <div className="lg:col-span-2 space-y-6">
                  <DisputeCaseSummary
                    transaction={data.transaction}
                    item={data.item}
                    pricing={data.pricing}
                    seller={data.seller}
                  />

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

                  {/* Agreement snapshot */}
                  <AgreementSnapshotSection snapshot={data.agreement_snapshot} />

                  {/* Delivery proof */}
                  <DeliveryProofSection deliveryProof={data.delivery_proof} />
                </div>

                {/* Right column */}
                <div className="space-y-6">
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

export default BuyerDisputeDetail;
