import { useState, useEffect, useMemo } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { RefreshCw, Shield, Check, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router";
import { supportLink } from "@/lib/support/support-copy";
import { BuyerNav } from "@/components/dashboard/BuyerNav";
import { Footer } from "@/components/landing/Footer";
import { BuyerDisputeSummaryCards } from "@/components/disputes/BuyerDisputeSummaryCards";
import { BuyerDisputeFilters } from "@/components/disputes/BuyerDisputeFilters";
import { BuyerDisputeList } from "@/components/disputes/BuyerDisputeList";
import { BuyerDisputeEmptyState } from "@/components/disputes/BuyerDisputeEmptyState";
import { TransactionPagination } from "@/components/transactions/TransactionPagination";
import {
  getBuyerDisputes,
  type BuyerDisputeFilters as DisputeFiltersType,
} from "@/services/disputes.service";
import { useBuyerIdentity } from "@/hooks/useBuyerIdentity";
import { ListSkeleton } from "@/components/common/PageSkeleton";

const BuyerDisputes = () => {
  const { buyerName, avatarUrl } = useBuyerIdentity();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset page on filter change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status]);

  const filters: DisputeFiltersType = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      status: status !== "all" ? status : undefined,
      page,
      page_size: 20,
    }),
    [debouncedSearch, status, page]
  );

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["buyer-disputes", filters],
    placeholderData: keepPreviousData,
    queryFn: () => getBuyerDisputes(filters),
    retry: 1,
    staleTime: 30_000,
  });


  const hasActiveFilters = search !== "" || status !== "all";

  const clearFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setStatus("all");
    setPage(1);
  };

  const totalAll = data
    ? data.summary.open_count + data.summary.under_review_count + data.summary.resolved_count
    : 0;

  const hasItems = data && data.items.length > 0;
  const isNoData = data && totalAll === 0 && !hasActiveFilters;
  const isFilterEmpty = data && data.items.length === 0 && (hasActiveFilters || totalAll > 0);

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <BuyerNav buyerName={buyerName} avatarUrl={avatarUrl} />

      {/* Compact header */}
      <section className="border-b bg-card/50">
        <div className="sd-page sd-page-y">
          <div className="flex items-center justify-between gap-3 border-l-4 border-destructive pl-3">
            <div>
              <h1 className="sd-page-title">My Disputes</h1>
              <p className="sd-page-sub">
                Review active and resolved disputes related to your transactions.
              </p>
            </div>
            <Button asChild variant="outline" size="sm" className="gap-1.5 h-11 text-xs">
              <Link to={supportLink(null, "dispute")}>
                <HelpCircle className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Dispute Help</span>
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <main className="flex-1">
        {/* Summary Cards */}
        <section className="sd-page mt-4 mb-4 sd-fade-in-stagger sd-delay-1">
          <BuyerDisputeSummaryCards
            summary={
              data?.summary ?? {
                open_count: 0,
                under_review_count: 0,
                resolved_count: 0,
                funds_frozen_count: 0,
              }
            }
          />
        </section>

        {/* Trust Banner */}
        <section className="sd-page mb-4 sd-fade-in-stagger sd-delay-2">
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
            <div className="flex flex-col lg:flex-row items-start lg:items-center gap-3 lg:gap-4">
              <Shield className="flex-shrink-0 h-4 w-4 text-primary-foreground" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-foreground mb-1">How SafeDeal Protects You</h3>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <Check className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
                    <span>SafeDeal reviews disputes using the locked transaction agreement and submitted evidence</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
                    <span>Funds remain frozen until the dispute is resolved</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
                    <span>All evidence submitted becomes part of the permanent dispute record</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <div className="sd-page pb-8 space-y-4">
          {/* Filters */}
          <BuyerDisputeFilters
            search={search}
            onSearchChange={setSearch}
            status={status}
            onStatusChange={setStatus}
            totalCount={data?.pagination.total_count ?? 0}
            onClearFilters={clearFilters}
            hasActiveFilters={hasActiveFilters}
          />

          {/* Loading */}
          {isLoading && (
            <ListSkeleton label="Loading your disputes" rows={3} />
          )}

          {/* Error */}
          {isError && !isLoading && (
            <div className="rounded-xl border bg-card p-8 text-center">
              <RefreshCw className="mx-auto h-5 w-5 text-destructive" />
              <h2 className="text-base font-semibold text-foreground mb-1">
                Unable to load disputes
              </h2>
              <p className="text-muted-foreground text-sm max-w-md mx-auto mb-4">
                {(error as Error)?.message || "Please refresh or try again later."}
              </p>
              <Button onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4" />
                Try Again
              </Button>
            </div>
          )}

          {/* Empty states */}
          {!isLoading && !isError && isNoData && (
            <BuyerDisputeEmptyState variant="no-data" />
          )}

          {!isLoading && !isError && isFilterEmpty && (
            <BuyerDisputeEmptyState variant="no-filter-match" onClearFilters={clearFilters} />
          )}

          {/* Disputes list */}
          {!isLoading && !isError && hasItems && (
            <div className="sd-fade-in-stagger sd-delay-3 space-y-4">
              <BuyerDisputeList items={data!.items} />
              <TransactionPagination
                page={data!.pagination.page}
                pageSize={data!.pagination.page_size}
                totalCount={data!.pagination.total_count}
                totalPages={data!.pagination.total_pages}
                onPageChange={setPage}
              />
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default BuyerDisputes;
