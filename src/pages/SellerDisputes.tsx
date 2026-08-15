import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SellerNav } from "@/components/seller/SellerNav";
import { Footer } from "@/components/landing/Footer";
import { SellerDisputeSummaryCards } from "@/components/seller-disputes/SellerDisputeSummaryCards";
import { SellerDisputeTrustBanner } from "@/components/seller-disputes/SellerDisputeTrustBanner";
import { SellerDisputeFilters } from "@/components/seller-disputes/SellerDisputeFilters";
import { SellerDisputeTable } from "@/components/seller-disputes/SellerDisputeTable";
import { SellerDisputeActionPanel } from "@/components/seller-disputes/SellerDisputeActionPanel";
import { SellerDisputeBlockedPanel } from "@/components/seller-disputes/SellerDisputeBlockedPanel";
import { SellerDisputeEmptyState } from "@/components/seller-disputes/SellerDisputeEmptyState";
import { ExportDisputesDialog } from "@/components/seller-disputes/ExportDisputesDialog";
import { TransactionPagination } from "@/components/transactions/TransactionPagination";
import { getSellerDisputes, type SellerDisputeFilters as FiltersType } from "@/services/seller-disputes.service";
import { getSellerDashboard } from "@/services/seller-dashboard.service";

const SellerDisputes = () => {
  const [searchParams] = useSearchParams();
  const initialStatus = (() => {
    const f = searchParams.get("filter");
    return f === "seller_response_pending" || f === "open" || f === "under_review" || f === "resolved" ? f : "all";
  })();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState(initialStatus);
  const [reason, setReason] = useState("all");
  const [page, setPage] = useState(1);
  const [exportOpen, setExportOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status, reason]);

  const filters: FiltersType = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      status: status !== "all" ? status : undefined,
      reason: reason !== "all" ? reason : undefined,
      page,
      page_size: 20,
    }),
    [debouncedSearch, status, reason, page]
  );

  const { data: navData } = useQuery({
    queryKey: ["seller-dashboard"],
    queryFn: getSellerDashboard,
    staleTime: 60_000,
  });

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["seller-disputes", filters],
    queryFn: () => getSellerDisputes(filters),
    retry: 1,
    staleTime: 30_000,
  });

  const hasActiveFilters = search !== "" || status !== "all" || reason !== "all";

  const clearFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setStatus("all");
    setReason("all");
    setPage(1);
  };

  const totalAll = data
    ? data.summary.open_count + data.summary.under_review_count + data.summary.resolved_count
    : 0;

  const hasItems = data && data.items.length > 0;
  const isNoData = data && totalAll === 0 && !hasActiveFilters;
  const isFilterEmpty = data && data.items.length === 0 && (hasActiveFilters || totalAll > 0);

  if (isLoading && !data) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError && !data) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background gap-4 px-4 text-center">
        <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <RefreshCw className="h-7 w-7 text-destructive" />
        </div>
        <h2 className="text-xl font-bold text-foreground">Could not load disputes</h2>
        <p className="text-muted-foreground text-sm max-w-md">
          {(error as Error)?.message || "Please refresh or try again later."}
        </p>
        <Button onClick={() => refetch()}>Try Again</Button>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <SellerNav
        sellerName={navData?.seller.full_name ?? "Seller"}
        avatarUrl={navData?.seller.avatar_url ?? null}
      />

      {/* Compact header */}
      <div className="bg-gradient-to-br from-sky-50/60 via-background to-amber-50/60 dark:from-sky-950/15 dark:via-background dark:to-amber-950/15 border-b border-border/60">
        <div className="sd-page py-3 sm:py-4">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-primary mb-0.5">Dispute Management</p>
          <h1 className="sd-page-title animate-fade-in">Disputes</h1>
          <p className="sd-page-sub max-w-2xl">
            Track buyer claims, submit your evidence, and follow dispute outcomes tied to your transactions and payouts.
          </p>
        </div>
      </div>

      <main className="flex-1 sd-page sd-page-y sd-section-y">
        {/* Summary Cards */}
        <SellerDisputeSummaryCards
          summary={
            data?.summary ?? {
              open_count: 0,
              awaiting_response_count: 0,
              under_review_count: 0,
              resolved_count: 0,
              blocked_payout_amount: 0,
              blocked_payout_currency: null,
            }
          }
        />

        {/* Trust Banner */}
        <SellerDisputeTrustBanner />

        {/* Content: Empty or Table + Sidebar */}
        {!isLoading && !isError && isNoData ? (
          <SellerDisputeEmptyState />
        ) : (
          <>
            {/* Filters */}
            <SellerDisputeFilters
              search={search}
              onSearchChange={setSearch}
              status={status}
              onStatusChange={setStatus}
              reason={reason}
              onReasonChange={setReason}
              totalCount={data?.pagination.total_count ?? 0}
              onClearFilters={clearFilters}
              hasActiveFilters={hasActiveFilters}
              items={data?.items ?? []}
              onExportClick={() => setExportOpen(true)}
            />

            {/* Two-column layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              {/* Left: Table */}
              <div className="lg:col-span-2 space-y-3">
                {isFilterEmpty && (
                  <SellerDisputeEmptyState variant="no-filter-match" onClearFilters={clearFilters} />
                )}

                {hasItems && (
                  <>
                    <SellerDisputeTable items={data!.items} />
                    <TransactionPagination
                      page={data!.pagination.page}
                      pageSize={data!.pagination.page_size}
                      totalCount={data!.pagination.total_count}
                      totalPages={data!.pagination.total_pages}
                      onPageChange={setPage}
                    />
                  </>
                )}
              </div>

              {/* Right Sidebar */}
              <div className="space-y-3">
                <SellerDisputeActionPanel items={data?.action_needed ?? []} />
                <SellerDisputeBlockedPanel items={data?.blocked_payouts ?? []} />
              </div>
            </div>
          </>
        )}
      </main>

      <Footer />

      <ExportDisputesDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        currentStatusFilter={status}
        currentReasonFilter={reason}
        currentSearch={debouncedSearch}
      />
    </div>
  );
};

export default SellerDisputes;
