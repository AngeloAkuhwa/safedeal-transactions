import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
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
    <div className="min-h-screen bg-background flex flex-col">
      <BuyerNav buyerName={buyerName} avatarUrl={avatarUrl} />

      <main className="flex-1">
        {/* Header */}
        <section className="border-b bg-card/50">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
                  My Purchases
                </h1>
                <p className="text-muted-foreground text-sm mt-1">
                  View and manage all your protected transactions.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                className="gap-1.5"
              >
                <RefreshCw className="h-4 w-4" />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-6">
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
              <TransactionTable transactions={[]} isLoading />
            </>
          )}

          {/* Error */}
          {isError && !isLoading && (
            <div className="rounded-2xl border bg-card p-12 text-center">
              <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
                <RefreshCw className="h-7 w-7 text-destructive" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-2">
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
                <>
                  <TransactionTable transactions={data.transactions} />
                  <TransactionPagination
                    page={data.pagination.page}
                    pageSize={data.pagination.page_size}
                    totalCount={data.pagination.total_count}
                    totalPages={data.pagination.total_pages}
                    onPageChange={setPage}
                  />
                </>
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
