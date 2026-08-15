import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BuyerNav } from "@/components/dashboard/BuyerNav";
import { Footer } from "@/components/landing/Footer";
import { TransactionFilters } from "@/components/transactions/TransactionFilters";
import { TransactionTable } from "@/components/transactions/TransactionTable";
import { TransactionPagination } from "@/components/transactions/TransactionPagination";
import { TransactionsEmptyState } from "@/components/transactions/TransactionsEmptyState";
import {
  getBuyerTransactions,
  type BuyerTransactionFilters,
  type BuyerTransactionsResponse,
} from "@/services/transactions.service";
import type { BuyerDashboardResponse } from "@/services/dashboard.service";

const BuyerTransactions = () => {
  const queryClient = useQueryClient();

  // Get buyer profile from dashboard cache
  const dashboardData = queryClient.getQueryData<BuyerDashboardResponse>([
    "buyer-dashboard",
  ]);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [transactionStatus, setTransactionStatus] = useState("all");
  const [moneyStatus, setMoneyStatus] = useState("all");
  const [page, setPage] = useState(1);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, transactionStatus, moneyStatus]);

  const filters: BuyerTransactionFilters = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      transaction_status: transactionStatus,
      money_status: moneyStatus,
      page,
      page_size: 8,
    }),
    [debouncedSearch, transactionStatus, moneyStatus, page]
  );

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["buyer-transactions", filters],
    queryFn: () => getBuyerTransactions(filters),
    retry: 1,
    staleTime: 30_000,
  });

  const hasActiveFilters =
    search !== "" || transactionStatus !== "all" || moneyStatus !== "all";

  const clearFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setTransactionStatus("all");
    setMoneyStatus("all");
    setPage(1);
  };

  const buyerName = dashboardData?.buyer?.full_name ?? "User";
  const avatarUrl = dashboardData?.buyer?.avatar_url ?? null;

  // Determine empty state type
  const isNoData = data && data.status_counts.all === 0;
  const isFilterEmpty =
    data &&
    data.status_counts.all > 0 &&
    data.transactions.length === 0;

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <BuyerNav buyerName={buyerName} avatarUrl={avatarUrl} />

      <main className="flex-1">
        {/* Header */}
        <section className="border-b bg-card/50">
          <div className="sd-page sd-page-y">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h1 className="sd-page-title">My Purchases</h1>
                <p className="sd-page-sub">
                  Track and manage all your SafeDeal transactions
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                className="gap-1.5 h-11 text-xs"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
            </div>
          </div>
        </section>

        <div className="sd-page sd-page-y space-y-4">
          {/* Loading */}
          {isLoading && (
            <>
              <TransactionFilters
                search={search}
                onSearchChange={setSearch}
                transactionStatus={transactionStatus}
                onTransactionStatusChange={setTransactionStatus}
                moneyStatus={moneyStatus}
                onMoneyStatusChange={setMoneyStatus}
                statusCounts={null}
                onClearFilters={clearFilters}
                hasActiveFilters={hasActiveFilters}
              />
              <TransactionTable transactions={[]} isLoading audience="buyer" />
            </>
          )}

          {/* Error */}
          {isError && !isLoading && (
            <div className="rounded-xl border bg-card p-8 text-center">
              <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-3">
                <RefreshCw className="h-5 w-5 text-destructive" />
              </div>
              <h2 className="text-base font-semibold text-foreground mb-1">
                Could not load your purchases
              </h2>
              <p className="text-muted-foreground text-sm max-w-md mx-auto mb-4">
                {(error as Error)?.message ||
                  "Please refresh or try again later."}
              </p>
              <Button onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4" />
                Try Again
              </Button>
            </div>
          )}

          {/* Success */}
          {data && !isLoading && !isError && (
            <>
              <div className="sd-fade-in-stagger sd-delay-1">
              <TransactionFilters
                search={search}
                onSearchChange={setSearch}
                transactionStatus={transactionStatus}
                onTransactionStatusChange={setTransactionStatus}
                moneyStatus={moneyStatus}
                onMoneyStatusChange={setMoneyStatus}
                statusCounts={data.status_counts}
                onClearFilters={clearFilters}
                hasActiveFilters={hasActiveFilters}
              />
              </div>

              {isNoData && (
                <TransactionsEmptyState variant="no-data" />
              )}

              {isFilterEmpty && (
                <TransactionsEmptyState
                  variant="no-filter-match"
                  onClearFilters={clearFilters}
                />
              )}

              {data.transactions.length > 0 && (
                <div className="sd-fade-in-stagger sd-delay-2 space-y-4">
                  <TransactionTable transactions={data.transactions} audience="buyer" />
                  <TransactionPagination
                    page={data.pagination.page}
                    pageSize={data.pagination.page_size}
                    totalCount={data.pagination.total_count}
                    totalPages={data.pagination.total_pages}
                    onPageChange={setPage}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default BuyerTransactions;
