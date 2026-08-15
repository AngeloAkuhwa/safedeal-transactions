import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCheck, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BuyerNav } from "@/components/dashboard/BuyerNav";
import { Footer } from "@/components/landing/Footer";
import { NotificationSummaryCards } from "@/components/notifications/NotificationSummaryCards";
import { NotificationFilters } from "@/components/notifications/NotificationFilters";
import { NotificationList } from "@/components/notifications/NotificationList";
import { NotificationEmptyState } from "@/components/notifications/NotificationEmptyState";
import { TransactionPagination } from "@/components/transactions/TransactionPagination";
import {
  getBuyerNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type BuyerNotificationFilters,
  type BuyerNotificationsResponse,
} from "@/services/notifications.service";
import { useBuyerIdentity } from "@/hooks/useBuyerIdentity";
import { toast } from "@/components/ui/sonner";

const BuyerNotifications = () => {
  const queryClient = useQueryClient();
  const { buyerName, avatarUrl } = useBuyerIdentity();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [type, setType] = useState("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset page on filter change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, type, unreadOnly]);

  const filters: BuyerNotificationFilters = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      type: type !== "all" ? type : undefined,
      is_read: unreadOnly ? false : undefined,
      page,
      page_size: 20,
    }),
    [debouncedSearch, type, unreadOnly, page]
  );

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["buyer-notifications", filters],
    queryFn: () => getBuyerNotifications(filters),
    retry: 1,
    staleTime: 30_000,
  });

  // Mark single read
  const markReadMutation = useMutation({
    mutationFn: markNotificationRead,
    onMutate: async (notificationId) => {
      await queryClient.cancelQueries({ queryKey: ["buyer-notifications"] });
      const previous = queryClient.getQueriesData<BuyerNotificationsResponse>({ queryKey: ["buyer-notifications"] });

      queryClient.setQueriesData<BuyerNotificationsResponse>(
        { queryKey: ["buyer-notifications"] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            summary: {
              ...old.summary,
              unread_count: Math.max(0, old.summary.unread_count - 1),
            },
            items: old.items.map((item) =>
              item.id === notificationId
                ? { ...item, is_read: true, read_at: new Date().toISOString() }
                : item
            ),
          };
        }
      );

      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        for (const [key, data] of context.previous) {
          queryClient.setQueryData(key, data);
        }
      }
      toast.error("Could not update notification");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["buyer-notifications"] });
    },
  });

  // Mark all read
  const markAllReadMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["buyer-notifications"] });
      const previous = queryClient.getQueriesData<BuyerNotificationsResponse>({ queryKey: ["buyer-notifications"] });

      queryClient.setQueriesData<BuyerNotificationsResponse>(
        { queryKey: ["buyer-notifications"] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            summary: {
              ...old.summary,
              unread_count: 0,
              verification_deadlines_count: 0,
              active_disputes_count: 0,
              escrow_alerts_count: 0,
            },
            items: old.items.map((item) => ({
              ...item,
              is_read: true,
              read_at: item.read_at || new Date().toISOString(),
            })),
          };
        }
      );

      return { previous };
    },
    onSuccess: () => {
      toast.success("All notifications marked as read");
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        for (const [key, data] of context.previous) {
          queryClient.setQueryData(key, data);
        }
      }
      toast.error("Could not mark all as read");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["buyer-notifications"] });
    },
  });


  const hasActiveFilters = search !== "" || type !== "all" || unreadOnly;

  const clearFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setType("all");
    setUnreadOnly(false);
    setPage(1);
  };

  const hasItems = data && data.items.length > 0;
  const isNoData = data && data.pagination.total_count === 0 && !hasActiveFilters;
  const isFilterEmpty = data && data.items.length === 0 && hasActiveFilters;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <BuyerNav buyerName={buyerName} avatarUrl={avatarUrl} />

      {/* Compact header */}
      <section className="border-b bg-card/50">
        <div className="sd-page sd-page-y">
          <div className="flex items-center justify-between gap-3 border-l-4 border-primary pl-3">
            <div>
              <h1 className="sd-page-title">Notifications</h1>
              <p className="sd-page-sub">
                Stay updated on your transactions, disputes, and important SafeDeal activity.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-11 text-xs"
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending || (data?.summary.unread_count === 0)}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Mark all as read</span>
              <span className="sm:hidden">Mark read</span>
            </Button>
          </div>
        </div>
      </section>

      <main className="flex-1">
        {/* Summary Cards */}
        <section className="sd-page mt-4 mb-4 sd-fade-in-stagger sd-delay-1">
          {data ? (
            <NotificationSummaryCards summary={data.summary} />
          ) : (
            <NotificationSummaryCards
              summary={{
                unread_count: 0,
                verification_deadlines_count: 0,
                active_disputes_count: 0,
                escrow_alerts_count: 0,
              }}
            />
          )}
        </section>

        <div className="sd-page pb-8 space-y-4">
          {/* Filters */}
          <NotificationFilters
            search={search}
            onSearchChange={setSearch}
            type={type}
            onTypeChange={setType}
            unreadOnly={unreadOnly}
            onUnreadOnlyChange={setUnreadOnly}
          />

          {/* Loading */}
          {isLoading && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
            </div>
          )}

          {/* Error */}
          {isError && !isLoading && (
            <div className="rounded-xl border bg-card p-8 text-center">
              <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-3">
                <RefreshCw className="h-5 w-5 text-destructive" />
              </div>
              <h2 className="text-base font-semibold text-foreground mb-1">
                Unable to load notifications
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
            <NotificationEmptyState variant="no-data" />
          )}

          {!isLoading && !isError && isFilterEmpty && (
            <NotificationEmptyState variant="no-filter-match" onClearFilters={clearFilters} />
          )}

          {/* Notification list */}
          {!isLoading && !isError && hasItems && (
            <div className="sd-fade-in-stagger sd-delay-2 space-y-4">
              <NotificationList
                items={data!.items}
                onMarkRead={(id) => markReadMutation.mutate(id)}
              />
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

export default BuyerNotifications;
