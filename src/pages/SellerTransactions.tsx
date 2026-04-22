import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Loader2, RefreshCw, Plus, Search, Download, FileText,
  TrendingUp, CheckCircle, ArrowLeftRight, ChevronLeft, ChevronRight,
  Shield, QrCode, Info,
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

const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  draft: { label: "Draft", variant: "secondary" },
  awaiting_buyer: { label: "Awaiting Buyer", variant: "outline" },
  awaiting_payment: { label: "Payment Pending", variant: "outline" },
  payment_secured: { label: "Payment Secured", variant: "default" },
  seller_preparing_delivery: { label: "Preparing", variant: "default" },
  seller_dispatched: { label: "Dispatched", variant: "default" },
  delivered_awaiting_verification: { label: "Awaiting Buyer Review", variant: "secondary" },
  completed: { label: "Completed", variant: "default" },
  disputed: { label: "Disputed", variant: "destructive" },
  cancelled: { label: "Cancelled", variant: "secondary" },
  timed_out: { label: "Timed Out", variant: "secondary" },
  refunded: { label: "Refunded", variant: "secondary" },
};

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

function formatCurrency(amount: number, currency: string) {
  if (currency === "NGN") {
    return `₦${amount.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function InfoTip({ children }: { children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="More info"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center justify-center text-muted-foreground/60 hover:text-muted-foreground transition-colors"
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

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["seller-transactions", filters],
    queryFn: () => getSellerTransactions(filters),
    retry: 1,
    staleTime: 15_000,
  });

  if (isLoading && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError && !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4 px-4 text-center">
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
    total_earned: 0,
  };

  return (
    <TooltipProvider delayDuration={150}>
    <div className="min-h-screen bg-background flex flex-col">
      <SellerNav
        sellerName={navData?.seller.full_name ?? "Seller"}
        avatarUrl={navData?.seller.avatar_url ?? null}
      />

      {/* Hero */}
      <div className="bg-gradient-to-br from-sky-50 via-background to-green-50 dark:from-sky-950/20 dark:via-background dark:to-green-950/20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
          <p className="text-sm font-medium text-primary mb-1">Transaction Management</p>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-foreground">All Transactions</h1>
              <p className="text-muted-foreground text-sm mt-1">
                Monitor and manage all your protected transactions
              </p>
            </div>
            <Button className="gap-2" onClick={() => navigate("/seller/transactions/new")}>
              <Plus className="h-4 w-4" />
              Create New Transaction
            </Button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by code, buyer, or item..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="payment-pending">Payment Pending</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="awaiting-delivery">Awaiting Delivery</SelectItem>
              <SelectItem value="buyer-verification">Awaiting Buyer Review</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="disputed">Disputed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
            </SelectContent>
          </Select>
          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger className="w-36">
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
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setExportOpen(true)}>
            <Download className="h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-6">
        <Card className="rounded-2xl shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="px-6 py-3 text-xs font-semibold uppercase tracking-wider">Transaction Code</TableHead>
                  <TableHead className="px-6 py-3 text-xs font-semibold uppercase tracking-wider hidden sm:table-cell">Buyer</TableHead>
                  <TableHead className="px-6 py-3 text-xs font-semibold uppercase tracking-wider hidden md:table-cell">Item</TableHead>
                  <TableHead className="px-6 py-3 text-xs font-semibold uppercase tracking-wider">Amount</TableHead>
                  <TableHead className="px-6 py-3 text-xs font-semibold uppercase tracking-wider">Money Status</TableHead>
                  <TableHead className="px-6 py-3 text-xs font-semibold uppercase tracking-wider">Status</TableHead>
                  <TableHead className="px-6 py-3 text-xs font-semibold uppercase tracking-wider w-36">Action</TableHead>
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
                    const status = statusLabels[tx.transaction_status] ?? { label: tx.transaction_status, variant: "secondary" as const };
                    const action = actionLabels[tx.transaction_status] ?? { label: "View Details", variant: "outline" as const };
                    const initials = tx.buyer_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

                    return (
                      <TableRow
                        key={tx.transaction_id}
                        className="hover:bg-muted/30 cursor-pointer"
                        onClick={() => navigate(`/seller/transactions/${tx.transaction_id}`)}
                      >
                        <TableCell className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <Shield className="h-4 w-4 text-primary shrink-0" />
                            <span className="font-mono text-sm font-medium">{tx.transaction_code}</span>
                          </div>
                        </TableCell>
                        <TableCell className="px-6 py-4 hidden sm:table-cell">
                          <div className="flex items-center gap-2.5">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={tx.buyer_avatar ?? undefined} />
                              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-sm font-medium text-foreground">{tx.buyer_name}</p>
                              <p className="text-xs text-muted-foreground">{tx.buyer_email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="px-6 py-4 hidden md:table-cell">
                          <div>
                            <p className="text-sm text-foreground truncate max-w-[200px]">{tx.item_title}</p>
                            <p className="text-xs text-muted-foreground">
                              {tx.item_category}{tx.item_category ? " • " : ""}Qty: {tx.item_quantity}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="px-6 py-4">
                          <div>
                            <p className="text-sm font-bold">{formatCurrency(tx.amount, tx.currency_code)}</p>
                            {tx.seller_net > 0 && tx.seller_net !== tx.amount && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Net: {formatCurrency(tx.seller_net, tx.currency_code)}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="px-6 py-4">
                          <MoneyStatusBadge status={tx.money_status} />
                        </TableCell>
                        <TableCell className="px-6 py-4">
                          <Badge variant={status.variant}>{status.label}</Badge>
                        </TableCell>
                        <TableCell className="px-6 py-4">
                          <div className="flex items-center gap-1.5">
                            {tx.has_active_rider_token && (
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 shrink-0 border-primary/30 text-primary hover:bg-primary/10"
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
            <div className="flex items-center justify-between px-6 py-4 border-t">
              <p className="text-sm text-muted-foreground">
                Showing {(pagination.page - 1) * pagination.page_size + 1}-
                {Math.min(pagination.page * pagination.page_size, pagination.total_count)} of{" "}
                {pagination.total_count} transactions
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
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
                    className="h-8 w-8 p-0"
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </Button>
                ))}
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
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

      {/* Summary Cards */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="rounded-2xl shadow-md">
            <CardContent className="p-5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">All Time</p>
              <p className="text-3xl font-bold text-foreground">{summary.total}</p>
              <p className="text-sm text-muted-foreground">Total Transactions</p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl shadow-md">
            <CardContent className="p-5">
              <p className="text-xs font-medium text-warning uppercase tracking-wider mb-1">Awaiting Payment</p>
              <p className="text-3xl font-bold text-foreground">{summary.awaiting_payment_count ?? 0}</p>
              <p className="text-sm text-muted-foreground">Buyer hasn't paid yet</p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl shadow-md">
            <CardContent className="p-5">
              <p className="text-xs font-medium text-primary uppercase tracking-wider mb-1">In Fulfillment</p>
              <p className="text-3xl font-bold text-foreground">{summary.in_fulfillment_count ?? 0}</p>
              <p className="text-sm text-muted-foreground">Paid · being delivered</p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl shadow-md">
            <CardContent className="p-5">
              <p className="text-xs font-medium text-success uppercase tracking-wider mb-1">Revenue</p>
              <p className="text-3xl font-bold text-foreground">{formatCompact(summary.total_earned)}</p>
              <p className="text-sm text-muted-foreground">{summary.completed} completed · total net</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Trust Banner */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-12">
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
