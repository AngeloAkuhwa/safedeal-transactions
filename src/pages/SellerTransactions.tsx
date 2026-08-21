import { useState, useEffect } from "react";
import { formatMoney } from "@/lib/format";
import { useSearchParams, useNavigate, Link } from "react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  Loader2, RefreshCw, Plus, Search, Download, FileText,
  TrendingUp, CheckCircle, ArrowLeftRight, ChevronLeft, ChevronRight,
  Shield, QrCode, Info, MessageCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SellerNav } from "@/components/seller/SellerNav";
import { SellerTrustBanner } from "@/components/seller/SellerTrustBanner";
import { Footer } from "@/components/landing/Footer";
import { MoneyStatusBadge } from "@/components/transactions/MoneyStatusBadge";
import { ExportPreviewDialog } from "@/components/seller/ExportPreviewDialog";
import { getSellerDashboard } from "@/services/seller-dashboard.service";
import {
  getSellerTransactions,
  type SellerTransactionsFilters,
} from "@/services/seller-transactions.service";
import { getSellerPayouts } from "@/services/seller-payouts.service";
import { resolveTransactionLabel, TONE_CLASSNAMES } from "@/lib/status-labels";
import { Skeleton } from "@/components/ui/skeleton";

const actionLabels: Record<string, { label: string; variant: "default" | "outline" }> = {
  payment_secured: { label: "Start Fulfillment", variant: "default" },
  seller_preparing_delivery: { label: "Update Delivery", variant: "default" },
  seller_dispatched: { label: "Upload Proof", variant: "default" },
  delivered_awaiting_verification: { label: "View Tracking", variant: "outline" },
  completed: { label: "View Receipt", variant: "outline" },
  awaiting_buyer: { label: "View Link", variant: "outline" },
  awaiting_payment: { label: "View Details", variant: "outline" },
  draft: { label: "Edit Draft", variant: "outline" },
};

function InfoTip({ children }: { children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="More info"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center justify-center text-muted-foreground/60 hover:text-muted-foreground transition-colors relative before:absolute before:-inset-4 before:content-[''] min-h-11 min-w-11"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs">
        {children}
      </TooltipContent>
    </Tooltip>
  );
}

const SellerTransactions = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("filter") ?? "all");
  const [dateFilter, setDateFilter] = useState(searchParams.get("date") ?? "all");
  const [page, setPage] = useState(1);
  const [exportOpen, setExportOpen] = useState(false);

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  // Reset page on filter change
  useEffect(() => { setPage(1); }, [debouncedSearch, statusFilter, dateFilter]);

  const filters: SellerTransactionsFilters = {
    search: debouncedSearch || undefined,
    status_filter: statusFilter !== "all" ? statusFilter : undefined,
    date_filter: dateFilter !== "all" ? dateFilter : undefined,
    page,
    page_size: 10,
  };

  const { data: navData } = useQuery({
    queryKey: ["seller-dashboard"],
    queryFn: getSellerDashboard,
    staleTime: 60_000,
  });

  // For the "Net Earned" card breakdown (paid-to-bank vs pending-bank-transfer)
  const { data: payoutsData } = useQuery({
    queryKey: ["seller-payouts", 1, "", ""],
    queryFn: () => getSellerPayouts(1, 10, "", ""),
    staleTime: 30_000,
  });

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["seller-transactions", filters],
    queryFn: () => getSellerTransactions(filters),
    retry: 1,
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });

  if (isLoading && !data) {
    return (
      // Skeleton in the real layout shape: a centred full-screen spinner made
      // the page jump on load and told the seller nothing about what loads.
      <div className="min-h-[100dvh] bg-background">
        <div className="sd-page space-y-3 py-4">
          <Skeleton className="h-8 w-56" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
          </div>
          <Skeleton className="h-16 rounded-lg" />
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
          </div>
        </div>
      </div>
    );
  }

  if (isError && !data) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background gap-4 px-4 text-center">
        <RefreshCw className="h-7 w-7 text-destructive" />
        <h2 className="text-xl font-bold text-foreground">Could not load transactions</h2>
        <p className="text-muted-foreground text-sm">{(error as Error)?.message}</p>
        <Button onClick={() => refetch()}>Try Again</Button>
      </div>
    );
  }

  const transactions = data?.transactions ?? [];
  const pagination = data?.pagination ?? { page: 1, page_size: 10, total_count: 0, total_pages: 1 };
  const summary = data?.summary ?? {
    total: 0,
    in_progress: 0,
    awaiting_payment_count: 0,
    in_fulfillment_count: 0,
    completed: 0,
    awaiting_seller_confirmation_count: 0,
    total_earned: 0,
  };

  return (
    <TooltipProvider delayDuration={150}>
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <SellerNav
        sellerName={navData?.seller.full_name ?? "Seller"}
        avatarUrl={navData?.seller.avatar_url ?? null}
      />

      {/* Compact header strip */}
      <div className="bg-gradient-to-br from-sky-50/60 via-background to-green-50/60 dark:from-sky-950/15 dark:via-background dark:to-green-950/15 border-b border-border/60">
        <div className="sd-page py-3 sm:py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary mb-0.5">Transaction Management</p>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
            <div>
              <h1 className="sd-page-title animate-fade-in">All Transactions</h1>
              <p className="sd-page-sub">Monitor and manage all your protected transactions</p>
            </div>
            <Button size="sm" className="h-11 text-xs gap-1.5" onClick={() => navigate("/seller/transactions/new")}>
              <Plus className="h-3.5 w-3.5" />
              Create New Transaction
            </Button>
          </div>
        </div>
      </div>

      {/* Summary Cards (moved above filters per polish spec) */}
      <div className="sd-page pt-3 sm:pt-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="sd-card sd-metric sd-fade-in-stagger sd-delay-1">
            <CardContent className="p-3">
              <p className="sd-eyebrow mb-1">Transactions</p>
              <p className="sd-kpi-value tabular-nums">{summary.total}</p>
              <p className="sd-kpi-helper">All transactions you've created</p>
              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                {summary.awaiting_payment_count ?? 0} awaiting · {summary.in_fulfillment_count ?? 0} in fulfillment · {summary.completed} completed
                {(summary.disputed_count ?? 0) > 0 && ` · ${summary.disputed_count} disputed`}
              </p>
            </CardContent>
          </Card>
          <Card className="sd-card sd-metric sd-fade-in-stagger sd-delay-2">
            <CardContent className="p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <p className="sd-eyebrow text-warning">Awaiting Buyer Payment</p>
                <InfoTip>Buyer started checkout but payment isn't complete yet.</InfoTip>
              </div>
              <p className="sd-kpi-value tabular-nums">{summary.awaiting_payment_count ?? 0}</p>
              <p className="sd-kpi-helper">Buyer hasn't paid yet</p>
            </CardContent>
          </Card>
          <Card className="sd-card sd-metric sd-fade-in-stagger sd-delay-3">
            <CardContent className="p-3">
              <p className="sd-eyebrow text-primary mb-1">In Fulfillment</p>
              <p className="sd-kpi-value tabular-nums">{summary.in_fulfillment_count ?? 0}</p>
              <p className="sd-kpi-helper">Paid · being delivered</p>
            </CardContent>
          </Card>
          <Card className="sd-card sd-metric sd-fade-in-stagger sd-delay-4">
            <CardContent className="p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <p className="sd-eyebrow text-success">Net Earned</p>
                <InfoTip>
                  Total amount you've earned from completed deals after SafeDeal fees.
                  Some may still be queued for bank transfer. See the Payouts tab for actual deposit status.
                </InfoTip>
              </div>
              <p className="sd-kpi-value tabular-nums">{formatMoney(summary.total_earned, "NGN")}</p>
              <p className="sd-kpi-helper">Includes paid to bank and pending bank transfer.</p>
              {payoutsData && (
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  {formatMoney(payoutsData.summary.total_released, "NGN")} paid · {formatMoney(payoutsData.summary.pending_release, "NGN")} pending
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Filters */}
      <div className="sd-page py-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by code, buyer, or item..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 h-11 border border-border rounded-md text-xs bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="min-w-[140px] flex-1 sm:flex-none sm:w-44 h-11 text-xs">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="payment-pending">Payment Pending</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="awaiting-delivery">Awaiting Delivery</SelectItem>
              <SelectItem value="awaiting-buyer-review">Awaiting Buyer Review</SelectItem>
              <SelectItem value="awaiting-seller-confirmation">Awaiting your confirmation</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="disputed">Disputed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
            </SelectContent>
          </Select>
          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger className="min-w-[120px] flex-1 sm:flex-none sm:w-36 h-11 text-xs">
              <SelectValue placeholder="All Time" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="this-week">This Week</SelectItem>
              <SelectItem value="this-month">This Month</SelectItem>
              <SelectItem value="this-quarter">This Quarter</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="gap-1.5 h-11 text-xs" onClick={() => setExportOpen(true)}>
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
        </div>
      </div>

      {/* Filter chip rail */}
      <div className="sd-page -mt-1 mb-2">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { key: "awaiting-seller-confirmation", label: "Awaiting Your Confirmation", count: summary.awaiting_seller_confirmation_count ?? 0, tone: "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100" },
            { key: "awaiting-delivery", label: "In Fulfillment", count: summary.in_fulfillment_count ?? 0, tone: "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15" },
            { key: "disputed", label: "Disputed", count: summary.disputed_count ?? 0, tone: "border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10" },
            { key: "completed", label: "Released", count: summary.completed ?? 0, tone: "border-success/30 bg-success/10 text-success hover:bg-success/15" },
          ].filter((c) => c.count > 0).map((chip) => {
            const active = statusFilter === chip.key;
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => setStatusFilter(active ? "all" : chip.key)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors ${chip.tone} ${active ? "ring-2 ring-offset-1 ring-primary/30" : ""} min-h-11 min-w-11 justify-center`}
              >
                {chip.label}
                <span className="inline-flex items-center justify-center min-w-[16px] h-4 rounded-full bg-background/70 text-xs font-bold px-1">
                  {chip.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <div className="sd-page pb-4">
        <Card className="rounded-lg shadow-sm overflow-hidden">
          {/* Mobile: card list. A 7-column table cannot be read at 360px, and
              horizontal scroll hid Status and Action entirely. */}
          <ul className="divide-y divide-border md:hidden">
            {transactions.length === 0 ? (
              <li className="py-12 text-center">
                <ArrowLeftRight className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" aria-hidden />
                <p className="text-sm font-medium text-foreground">No transactions found</p>
                <p className="mt-1 text-xs text-muted-foreground">Try adjusting your filters</p>
              </li>
            ) : (
              transactions.map((tx) => {
                const status = resolveTransactionLabel(tx.transaction_status, "seller");
                const action = actionLabels[tx.transaction_status] ?? { label: "View Details", variant: "outline" as const };
                return (
                  <li key={tx.transaction_id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/seller/transactions/${tx.transaction_id}`)}
                      className="w-full space-y-2 px-3 py-3 text-left transition-colors active:bg-muted/50 min-h-11"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 font-mono text-xs font-medium">
                          <Shield className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                          {tx.transaction_code}
                        </span>
                        <Badge variant="outline" className={TONE_CLASSNAMES[status.tone]}>{status.label}</Badge>
                      </div>
                      <p className="truncate text-sm font-medium text-foreground">{tx.item_title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {tx.item_category ? `${tx.item_category} · ` : ""}Qty {tx.item_quantity}
                      </p>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6 shrink-0">
                          <AvatarImage src={tx.buyer_avatar ?? undefined} alt="" />
                          <AvatarFallback className="text-xs">
                            {tx.buyer_name?.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() ?? "?"}
                          </AvatarFallback>
                        </Avatar>
                        <span className="min-w-0">
                          <span className="block truncate text-xs text-foreground">{tx.buyer_name}</span>
                          <span className="block truncate text-xs text-muted-foreground">{tx.buyer_email}</span>
                        </span>
                      </div>
                      {tx.last_message_preview && (
                        <p className="truncate text-xs italic text-muted-foreground">“{tx.last_message_preview}”</p>
                      )}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-bold text-foreground">{formatMoney(tx.amount, tx.currency_code)}</p>
                          <p className="text-xs text-muted-foreground">
                            Net {formatMoney(tx.seller_net > 0 ? tx.seller_net : tx.amount, tx.currency_code)}
                          </p>
                        </div>
                        <MoneyStatusBadge status={tx.money_status} audience="seller" />
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          variant={action.variant === "default" ? "default" : "outline"}
                          className="min-h-11 flex-1 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (tx.transaction_status === "awaiting_buyer") {
                              navigate(`/seller/transactions/${tx.transaction_id}/share`);
                            } else if (["payment_secured", "seller_preparing_delivery", "seller_dispatched"].includes(tx.transaction_status)) {
                              navigate(`/seller/transactions/${tx.transaction_id}/delivery`);
                            } else {
                              navigate(`/seller/transactions/${tx.transaction_id}`);
                            }
                          }}
                        >
                          {action.label}
                        </Button>
                        {(tx.unread_message_count ?? 0) > 0 && (
                          <Button
                            variant="outline"
                            className="min-h-11 min-w-11 shrink-0 px-0"
                            aria-label={`${tx.unread_message_count} unread messages`}
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/seller/transactions/${tx.transaction_id}#messages`);
                            }}
                          >
                            <MessageCircle className="h-4 w-4 text-primary" aria-hidden />
                          </Button>
                        )}
                        {tx.has_active_rider_token && (
                          <Button
                            variant="outline"
                            className="min-h-11 min-w-11 shrink-0 border-primary/30 px-0 text-primary"
                            aria-label="Rider confirmation link"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/seller/transactions/${tx.transaction_id}#rider`);
                            }}
                          >
                            <QrCode className="h-4 w-4" aria-hidden />
                          </Button>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })
            )}
          </ul>

          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider">Transaction Code</TableHead>
                  <TableHead className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider hidden sm:table-cell">Buyer</TableHead>
                  <TableHead className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider hidden lg:table-cell">Item</TableHead>
                  <TableHead className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider">
                    <span className="inline-flex items-center gap-1.5">
                      Amount
                      <InfoTip>
                        <span className="block">
                          <strong>Gross</strong>: total paid by the buyer before SafeDeal fees.
                          <br />
                          <strong>Net to seller</strong>: what you earn after SafeDeal fees.
                        </span>
                      </InfoTip>
                    </span>
                  </TableHead>
                  <TableHead className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider">
                    <span className="inline-flex items-center gap-1.5">
                      Money Status
                      <InfoTip>Where the buyer's money currently sits in the SafeDeal escrow flow.</InfoTip>
                    </span>
                  </TableHead>
                  <TableHead className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider">Status</TableHead>
                  <TableHead className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider w-32">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12">
                      <ArrowLeftRight className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                      <p className="text-sm font-medium text-foreground">No transactions found</p>
                      <p className="text-xs text-muted-foreground mt-1">Try adjusting your filters</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  transactions.map((tx) => {
                    const status = resolveTransactionLabel(tx.transaction_status, "seller");
                    const action = actionLabels[tx.transaction_status] ?? { label: "View Details", variant: "outline" as const };
                    const initials = tx.buyer_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

                    return (
                      <TableRow
                        key={tx.transaction_id}
                        className="sd-row-hover relative cursor-pointer"
                        onClick={() => navigate(`/seller/transactions/${tx.transaction_id}`)}
                      >
                        <TableCell className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Shield className="h-4 w-4 text-primary shrink-0" />
                            {/* Stretched link: the row's keyboard-reachable control. */}
                            <Link
                              to={`/seller/transactions/${tx.transaction_id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="font-mono text-sm font-medium after:absolute after:inset-0 after:content-[''] rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              {tx.transaction_code}
                            </Link>
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-3 hidden sm:table-cell">
                          <div className="flex items-center gap-2.5">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={tx.buyer_avatar ?? undefined} />
                              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-sm font-medium text-foreground">{tx.buyer_name}</p>
                              <p className="text-xs text-muted-foreground">{tx.buyer_email}</p>
                            </div>
                            {(tx.unread_message_count ?? 0) > 0 && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        navigate(`/seller/transactions/${tx.transaction_id}#messages`);
                                      }}
                                      aria-label={`${tx.unread_message_count} unread messages`}
                                      className="relative z-rail ml-1 inline-flex items-center justify-center h-7 w-7 rounded-full hover:bg-primary/10 transition-colors before:absolute before:-inset-2 before:content-['']"
                                    >
                                      <MessageCircle className="h-4 w-4 text-primary" />
                                      <span className="absolute -top-1 -right-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-xs font-bold text-destructive-foreground">
                                        {(tx.unread_message_count ?? 0) > 9 ? "9+" : tx.unread_message_count}
                                      </span>
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-[260px]">
                                    <p className="text-xs font-medium">New message{(tx.unread_message_count ?? 0) > 1 ? "s" : ""}</p>
                                    {tx.last_message_preview && (
                                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                        {tx.last_message_preview}
                                      </p>
                                    )}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-3 hidden md:table-cell">
                          <div>
                            <p className="text-sm text-foreground truncate max-w-[200px]">{tx.item_title}</p>
                            <p className="text-xs text-muted-foreground">
                              {tx.item_category}{tx.item_category ? " • " : ""}Qty: {tx.item_quantity}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <div className="space-y-0.5">
                            <p className="text-sm">
                              <span className="text-muted-foreground">Gross: </span>
                              <span className="font-bold text-foreground">
                                {formatMoney(tx.amount, tx.currency_code)}
                              </span>
                            </p>
                            <p className="text-xs">
                              <span className="text-muted-foreground">Net to seller: </span>
                              <span className="font-semibold text-foreground">
                                {formatMoney(tx.seller_net > 0 ? tx.seller_net : tx.amount, tx.currency_code)}
                              </span>
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <MoneyStatusBadge status={tx.money_status} audience="seller" />
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <Badge variant="outline" className={TONE_CLASSNAMES[status.tone]}>{status.label}</Badge>
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {tx.has_active_rider_token && (
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 shrink-0 border-primary/30 text-primary hover:bg-primary/10 relative before:absolute before:-inset-2 before:content-['']"
                                title="Rider confirmation link"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/seller/transactions/${tx.transaction_id}#rider`);
                                }}
                              >
                                <QrCode className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant={action.variant === "default" ? "default" : "outline"}
                              size="sm"
                              className="text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (tx.transaction_status === "awaiting_buyer") {
                                  navigate(`/seller/transactions/${tx.transaction_id}/share`);
                                } else if (["payment_secured", "seller_preparing_delivery", "seller_dispatched"].includes(tx.transaction_status)) {
                                  navigate(`/seller/transactions/${tx.transaction_id}/delivery`);
                                } else {
                                  navigate(`/seller/transactions/${tx.transaction_id}`);
                                }
                              }}
                            >
                              {action.label}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {pagination.total_pages > 0 && (
            <div className="flex flex-col items-center justify-between gap-3 border-t px-3 py-3 sm:flex-row sm:px-6 sm:py-4">
              <p className="text-xs text-muted-foreground sm:text-sm">
                Showing {(pagination.page - 1) * pagination.page_size + 1}-
                {Math.min(pagination.page * pagination.page_size, pagination.total_count)} of{" "}
                {pagination.total_count} transactions
              </p>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-11 w-11 sm:h-8 sm:w-8"
                  aria-label="Previous page"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {Array.from({ length: Math.min(pagination.total_pages, 5) }, (_, i) => i + 1).map((p) => (
                  <Button
                    key={p}
                    variant={p === page ? "default" : "outline"}
                    size="sm"
                    className="h-11 w-11 p-0 sm:h-8 sm:w-8"
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </Button>
                ))}
                <Button
                  variant="outline"
                  size="icon"
                  className="h-11 w-11 sm:h-8 sm:w-8"
                  aria-label="Next page"
                  disabled={page >= pagination.total_pages}
                  onClick={() => setPage(page + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Trust Banner */}
      <div className="sd-page py-4">
        <SellerTrustBanner />
      </div>

      <Footer />

      <ExportPreviewDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        initialStatusFilter={statusFilter}
        initialDateFilter={dateFilter}
      />
    </div>
    </TooltipProvider>
  );
};

export default SellerTransactions;
