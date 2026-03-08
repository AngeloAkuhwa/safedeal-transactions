import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, Shield, Check, BookOpen, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import type { BuyerDashboardResponse } from "@/services/dashboard.service";

const BuyerDisputes = () => {
  const queryClient = useQueryClient();
  const dashboardData = queryClient.getQueryData<BuyerDashboardResponse>(["buyer-dashboard"]);

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
    queryFn: () => getBuyerDisputes(filters),
    retry: 1,
    staleTime: 30_000,
  });

  const buyerName = dashboardData?.buyer?.full_name ?? "User";
  const avatarUrl = dashboardData?.buyer?.avatar_url ?? null;

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
    <div className="min-h-screen bg-background flex flex-col">
      <BuyerNav buyerName={buyerName} avatarUrl={avatarUrl} />

      {/* Hero */}
      <section className="bg-destructive py-10 sm:py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-destructive-foreground mb-2">
                My Disputes
              </h1>
              <p className="text-destructive-foreground/80 text-base sm:text-lg">
                Track all active and resolved disputes related to your protected transactions.
              </p>
            </div>
            <Button
              variant="secondary"
              className="bg-destructive-foreground text-destructive hover:bg-destructive-foreground/90 font-semibold"
            >
              <HelpCircle className="h-4 w-4" />
              Dispute Help
            </Button>
          </div>
        </div>
      </section>

      <main className="flex-1">
        {/* Summary Cards */}
        <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 -mt-6 mb-8">
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
        <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mb-8">
          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6 lg:p-8">
            <div className="flex flex-col lg:flex-row items-start lg:items-center gap-4 lg:gap-6">
              <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center flex-shrink-0">
                <Shield className="h-5 w-5 text-primary-foreground" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-foreground mb-2">How SafeDeal Protects You</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span>SafeDeal reviews disputes using the locked transaction agreement and submitted evidence</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span>Funds remain frozen until the dispute is resolved</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span>All evidence submitted becomes part of the permanent dispute record</span>
                  </li>
                </ul>
              </div>
              <Button className="flex-shrink-0 gap-2">
                <BookOpen className="h-4 w-4" />
                Dispute Guide
              </Button>
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-12 space-y-6">
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
            <div className="flex items-center justify-center py-16">
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
            <>
              <BuyerDisputeList items={data!.items} />
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
      </main>

      <Footer />
    </div>
  );
};

export default BuyerDisputes;
