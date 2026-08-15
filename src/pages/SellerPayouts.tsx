import { useState } from "react";
import { formatMoney } from "@/lib/format";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import {
  Loader2, RefreshCw, Wallet, TrendingUp, Shield, AlertTriangle,
  Search, Filter, Download, Clock, CheckCircle2,
  CreditCard, Banknote, Send, RotateCcw,
  Eye, FileText, AlertCircle, ChevronLeft, ChevronRight, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { SellerNav } from "@/components/seller/SellerNav";
import { Footer } from "@/components/landing/Footer";
import { EditPayoutDetailsModal } from "@/components/seller/EditPayoutDetailsModal";
import { ExportPayoutsDialog } from "@/components/seller/ExportPayoutsDialog";
import { resolvePayoutStatusLabel, TONE_CLASSNAMES } from "@/lib/status-labels";
import { getSellerPayouts, updatePayoutAccount } from "@/services/seller-payouts.service";
import { toast } from "@/hooks/use-toast";
import type { PayoutHistoryItem, UpcomingRelease, BlockedFund } from "@/services/seller-payouts.service";
import { PayoutAccountStateBadge, payoutAccountStateExplainer } from "@/components/payout/PayoutAccountStateBadge";
import { Skeleton } from "@/components/ui/skeleton";

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-NG", { month: "short", day: "numeric", year: "numeric" });
}

function CardInfoTip({ children }: { children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-label="More info" className="inline-flex items-center justify-center text-muted-foreground/60 hover:text-muted-foreground relative before:absolute before:-inset-4 before:content-['']">
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs">{children}</TooltipContent>
    </Tooltip>
  );
}

function PayoutStatusBadge({ status }: { status: string }) {
  const cfg = resolvePayoutStatusLabel(status);
  return <Badge variant="outline" className={TONE_CLASSNAMES[cfg.tone]}>{cfg.label}</Badge>;
}

function RowAction({ row, onFixPayout }: { row: PayoutHistoryItem; onFixPayout: () => void }) {
  if (row.status === "completed") {
    if (!row.transaction_id) return null;
    return (
      <Button variant="ghost" size="sm" className="h-11 text-xs" asChild>
        <Link to={`/seller/transactions/${row.transaction_id}`}>
          <Eye className="h-3 w-3 mr-1" /> View Payout
        </Link>
      </Button>
    );
  }
  if (row.status === "failed") {
    return (
      <Button variant="ghost" size="sm" className="h-11 text-xs text-destructive" asChild>
        <Link to="/seller/profile?section=payout">
          <RotateCcw className="h-3 w-3 mr-1" /> Fix payout account
        </Link>
      </Button>
    );
  }
  if (row.status === "pending" || row.status === "processing") {
    if (!row.transaction_id) return null;
    return (
      <Button variant="ghost" size="sm" className="h-11 text-xs" asChild>
        <Link to={`/seller/transactions/${row.transaction_id}`}>
          <Eye className="h-3 w-3 mr-1" /> View Transaction
        </Link>
      </Button>
    );
  }
  return null;
}

const VALID_PAYOUT_STATUS_FILTERS = new Set(["completed", "processing", "pending", "failed"]);

const SellerPayouts = () => {
  const [searchParams] = useSearchParams();
  const initialStatusFilter = (() => {
    const s = searchParams.get("status");
    return s && VALID_PAYOUT_STATUS_FILTERS.has(s) ? s : "";
  })();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState(initialStatusFilter);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["seller-payouts", page, statusFilter, search],
    queryFn: () => getSellerPayouts(page, 10, statusFilter, search),
    retry: 1,
    staleTime: 30_000,
  });

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  const handleSavePayoutAccount = async (accountData: {
    bank_code: string;
    bank_name: string;
    account_number: string;
    account_name: string;
  }) => {
    await updatePayoutAccount(accountData);
    toast({ title: "Payout account updated", description: "Your bank details have been saved successfully." });
    queryClient.invalidateQueries({ queryKey: ["seller-payouts"] });
  };

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] bg-background">
        <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-6">
          <Skeleton className="h-8 w-52" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background gap-4 px-4 text-center">
        <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <RefreshCw className="h-7 w-7 text-destructive" />
        </div>
        <h2 className="text-xl font-bold text-foreground">Could not load payouts</h2>
        <p className="text-muted-foreground text-sm max-w-md">
          {(error as Error)?.message || "Please refresh or try again later."}
        </p>
        <Button onClick={() => refetch()}>Try Again</Button>
      </div>
    );
  }

  const { seller, summary, payout_history, pagination, upcoming_releases, blocked_funds, payout_account } = data;
  const stuckPayouts = data.stuck_payouts ?? [];
  /**
   * Settlement window and the "stuck" threshold are SERVER facts. Restating
   * them as literals here produced two different answers on one page.
   */
  const settlementCopy = payout_account?.typical_processing_time?.trim() || null;
  const stuckHours = data.stuck_payout_threshold_hours ?? null;

  return (
    <TooltipProvider delayDuration={150}>
    <div className="min-h-[100dvh] bg-background">
      <SellerNav sellerName={seller.full_name} avatarUrl={seller.avatar_url} />

      <main className="sd-page sd-page-y sd-section-y">
        {/* Page Header */}
        <div>
          <p className="sd-eyebrow mb-0.5">Money management</p>
          <h1 className="sd-page-title animate-fade-in">Payouts</h1>
          <p className="sd-page-sub">
            Track released funds, pending releases, held escrow balances, and payout account activity.
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
          <SummaryCard
            label="Total Released"
            value={formatMoney(summary.total_released, summary.currency_code)}
            subtitle={`Paid into your bank account · ${formatMoney(summary.total_released_last_30, summary.currency_code)} in last 30 days`}
            icon={CheckCircle2}
            iconBg="bg-success/10"
            iconColor="text-success"
            badgeLabel="Released"
            badgeBg="bg-success/10 text-success"
            tooltip="Money already deposited to your bank account. Earnings from completed deals that haven't been transferred yet appear under Pending Release."
          />
          <SummaryCard
            label="Pending Release"
            value={formatMoney(summary.pending_release, summary.currency_code)}
            subtitle="Earned · awaiting bank transfer"
            icon={Clock}
            iconBg="bg-warning/10"
            iconColor="text-warning"
            badgeLabel="Pending"
            badgeBg="bg-warning/10 text-warning"
            tooltip={
              "Money the buyer has released to you but that hasn't been deposited to your bank account yet." +
              (settlementCopy ? ` Usually settles in ${settlementCopy}.` : "")
            }
          />
          <SummaryCard
            label="Held in Escrow"
            value={formatMoney(summary.held_in_escrow, summary.currency_code)}
            subtitle="Tied to active transactions"
            icon={Shield}
            iconBg="bg-primary/10"
            iconColor="text-primary"
            badgeLabel="Escrow"
            badgeBg="bg-primary/10 text-primary"
            tooltip="Your protected earnings currently locked in escrow, awaiting buyer confirmation. Disputed/frozen amounts appear under On Hold / Failed."
          />
          <SummaryCard
            label="On Hold / Failed"
            value={formatMoney(summary.on_hold_failed, summary.currency_code)}
            subtitle="Failed payouts + funds frozen by disputes"
            icon={AlertTriangle}
            iconBg="bg-destructive/10"
            iconColor="text-destructive"
            badgeLabel="Action Needed"
            badgeBg="bg-destructive/10 text-destructive"
            tooltip="Includes failed payouts and disputed funds frozen in escrow. Sum of seller-net at risk."
          />
        </div>

        {/* How Payouts Work */}
        <Card className="rounded-lg border-primary/10 bg-primary/[0.02]">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Info className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">How Payouts Work</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              SafeDeal holds funds securely until both you and the buyer confirm, then SafeDeal reviews and releases your payout.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { icon: Shield, label: "Funds Held", desc: "Payment secured in escrow" },
                { icon: CheckCircle2, label: "Both Confirm", desc: "Buyer and seller confirm receipt" },
                { icon: CreditCard, label: "SafeDeal Reviews", desc: "SafeDeal reviews and releases" },
                { icon: Send, label: "Funds Sent", desc: "Deposited to your account" },
              ].map((step, i) => (
                <div key={i} className={`flex flex-col items-center text-center gap-1.5 sd-fade-in-stagger sd-delay-${i + 1}`}>
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <step.icon className="h-4 w-4 text-primary" />
                  </div>
                  <span className="text-xs font-semibold text-foreground">{step.label}</span>
                  <span className="text-xs text-muted-foreground leading-snug">{step.desc}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* Left: Payout History */}
          <div className="lg:col-span-2 space-y-3">
            <Card className="rounded-lg">
              <CardHeader className="pb-2 pt-3 px-3 sm:px-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <CardTitle className="text-sm font-semibold">Payout History</CardTitle>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Search..."
                        className="pl-8 h-11 w-44 text-xs"
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                      />
                    </div>
                    <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v === "all" ? "" : v); setPage(1); }}>
                      <SelectTrigger className="h-11 w-36 text-xs">
                        <Filter className="h-3.5 w-3.5 mr-1.5" />
                        <SelectValue placeholder="All Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="completed">Released</SelectItem>
                        <SelectItem value="processing">Processing</SelectItem>
                        <SelectItem value="pending">Scheduled</SelectItem>
                        <SelectItem value="failed">Failed</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" className="h-11 text-xs" onClick={() => setExportOpen(true)}>
                      <Download className="h-3.5 w-3.5 mr-1.5" /> Export
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-0 pb-4">
                {payout_history.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                    <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mb-4">
                      <Wallet className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <h3 className="font-semibold text-foreground mb-1">No payouts yet</h3>
                    <p className="text-sm text-muted-foreground max-w-sm">
                      Once both parties confirm and SafeDeal releases, your payouts will appear here.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="divide-y divide-border md:hidden">
                      {payout_history.map((row: PayoutHistoryItem) => (
                        <article key={row.payout_id_full} className="space-y-3 p-4">
                          <div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs">{row.payout_id}</p><p className="text-sm font-medium">{row.transaction_code}</p><p className="text-xs text-muted-foreground">{row.buyer_name} · {formatDate(row.release_date)}</p></div><p className="text-sm font-semibold">{formatMoney(row.net_payout, row.currency_code)}</p></div>
                          <div className="flex items-center justify-between gap-2"><PayoutStatusBadge status={row.status} /><RowAction row={row} onFixPayout={() => setEditModalOpen(true)} /></div>
                        </article>
                      ))}
                    </div>
                    <div className="hidden overflow-auto md:block">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Payout ID</TableHead>
                            <TableHead>Transaction</TableHead>
                            <TableHead className="hidden md:table-cell">Buyer</TableHead>
                            <TableHead className="hidden lg:table-cell">Item</TableHead>
                            <TableHead className="text-right hidden sm:table-cell">Gross</TableHead>
                            <TableHead className="text-right hidden sm:table-cell">Fees</TableHead>
                            <TableHead className="text-right">Net Payout</TableHead>
                            <TableHead className="hidden md:table-cell">Date</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {payout_history.map((row: PayoutHistoryItem) => (
                            <TableRow key={row.payout_id_full}>
                              <TableCell className="font-mono text-xs">{row.payout_id}</TableCell>
                              <TableCell className="font-medium text-xs">
                                {row.transaction_id ? (
                                  <Link
                                    to={`/seller/transactions/${row.transaction_id}`}
                                    className="text-primary hover:underline"
                                  >
                                    {row.transaction_code}
                                  </Link>
                                ) : (
                                  <span>{row.transaction_code}</span>
                                )}
                              </TableCell>
                              <TableCell className="hidden md:table-cell text-sm">{row.buyer_name}</TableCell>
                              <TableCell className="hidden lg:table-cell text-sm max-w-[120px] truncate">{row.item_title}</TableCell>
                              <TableCell className="text-right hidden sm:table-cell text-sm">{formatMoney(row.gross_amount, row.currency_code)}</TableCell>
                              <TableCell className="text-right hidden sm:table-cell text-sm text-muted-foreground">-{formatMoney(row.fees, row.currency_code)}</TableCell>
                              <TableCell className="text-right font-semibold text-sm">{formatMoney(row.net_payout, row.currency_code)}</TableCell>
                              <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{formatDate(row.release_date)}</TableCell>
                              <TableCell><PayoutStatusBadge status={row.status} /></TableCell>
                              <TableCell className="text-right">
                                <RowAction row={row} onFixPayout={() => setEditModalOpen(true)} />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Pagination */}
                    {pagination.total_pages > 1 && (
                      <div className="flex items-center justify-between px-6 pt-4">
                        <p className="text-xs text-muted-foreground">
                          Showing {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total_count)} of {pagination.total_count}
                        </p>
                         <div className="flex items-center gap-1">
                           <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          <span className="text-sm px-2">{page} / {pagination.total_pages}</span>
                          <Button variant="outline" size="icon" disabled={page >= pagination.total_pages} onClick={() => setPage(page + 1)}>
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Sidebar */}
          <div className="space-y-3">
            {/* Stuck Payouts Alert */}
            {stuckPayouts.length > 0 && (
              <Card className="rounded-lg border-warning/40 bg-warning/[0.04]">
                <CardContent className="p-3 flex items-start gap-2.5">
                  <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-warning">
                      {stuckPayouts.length} payout{stuckPayouts.length > 1 ? "s" : ""} pending bank transfer
                      {stuckHours != null ? ` for over ${stuckHours} hours` : " longer than expected"}
                    </p>
                    {settlementCopy && (
                      <p className="text-xs text-muted-foreground">
                        Contact support if not received in {settlementCopy}.
                      </p>
                    )}
                    <ul className="text-xs text-muted-foreground space-y-0.5 mt-1.5">
                      {stuckPayouts.slice(0, 3).map((sp) => (
                        <li key={sp.payout_id_full} className="flex items-center justify-between gap-2">
                          {sp.transaction_id ? (
                            <Link to={`/seller/transactions/${sp.transaction_id}`} className="font-mono text-primary hover:underline">
                              {sp.transaction_code}
                            </Link>
                          ) : (
                            <span className="font-mono">{sp.transaction_code}</span>
                          )}
                          <span>{formatMoney(sp.amount, sp.currency_code)} · {sp.hours_pending}h</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Upcoming Releases */}
            <Card className="rounded-lg">
              <CardHeader className="pb-2 pt-3 px-3 sm:px-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                  <TrendingUp className="h-4 w-4 text-success" />
                  Upcoming Releases
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 px-3 sm:px-4 pb-3">
                {upcoming_releases.length === 0 ? (
                  <div className="text-center py-6">
                    <Clock className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">No upcoming releases right now.</p>
                  </div>
                ) : (
                  upcoming_releases.map((r: UpcomingRelease) => (
                    <div key={r.transaction_id} className="border rounded-md p-2.5 space-y-1.5 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center justify-between">
                        {r.transaction_id ? (
                          <Link to={`/seller/transactions/${r.transaction_id}`} className="text-xs font-mono text-primary hover:underline">
                            {r.transaction_code}
                          </Link>
                        ) : (
                          <span className="text-xs font-mono">{r.transaction_code}</span>
                        )}
                        <Badge variant="outline" className="bg-success/10 text-success border-success/20 text-xs py-0">{r.release_trigger}</Badge>
                      </div>
                      <p className="text-xs font-medium text-foreground truncate">{r.item_title}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">{r.buyer_name}</span>
                        <span className="text-xs font-bold text-foreground tabular-nums">{formatMoney(r.amount, r.currency_code)}</span>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Blocked / Delayed */}
            {blocked_funds.length > 0 && (
              <Card className="rounded-lg border-warning/30">
                <CardHeader className="pb-2 pt-3 px-3 sm:px-4">
                  <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4 text-warning" />
                    Blocked / Delayed Funds
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 px-3 sm:px-4 pb-3">
                  {blocked_funds.map((b: BlockedFund) => (
                    <div key={b.transaction_id} className="border border-warning/20 bg-warning/[0.03] rounded-md p-2.5 space-y-1.5">
                      <div className="flex items-center justify-between">
                        {b.transaction_id ? (
                          <Link to={`/seller/transactions/${b.transaction_id}`} className="text-xs font-mono text-primary hover:underline">
                            {b.transaction_code}
                          </Link>
                        ) : (
                          <span className="text-xs font-mono">{b.transaction_code}</span>
                        )}
                        <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 text-xs py-0">On Hold</Badge>
                      </div>
                      <p className="text-xs font-medium text-foreground truncate">{b.item_title}</p>
                      <div className="flex items-center gap-1.5">
                        <AlertCircle className="h-3.5 w-3.5 text-warning flex-shrink-0" />
                        <span className="text-xs text-warning">{b.blocker_reason}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">{b.buyer_name}</span>
                        <span className="text-xs font-bold text-foreground tabular-nums">{formatMoney(b.amount, b.currency_code)}</span>
                      </div>
                      {/* Context-aware action for blocked funds */}
                      {b.blocker_reason.includes("Dispute") && b.transaction_id && (
                        <Button variant="outline" size="sm" className="w-full h-11 text-xs mt-1" asChild>
                          <Link to={`/seller/transactions/${b.transaction_id}`}>View Dispute</Link>
                        </Button>
                      )}
                      {b.blocker_reason.includes("verification") && (
                        <Button variant="outline" size="sm" className="w-full h-11 text-xs mt-1" onClick={() => setEditModalOpen(true)}>
                          Fix Payout Details
                        </Button>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Payout Account */}
            <Card className={`rounded-lg ${!payout_account.verified ? "border-warning/30" : ""}`}>
              <CardHeader className="pb-2 pt-3 px-3 sm:px-4">
                <CardTitle className="text-sm font-semibold flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5">
                    <Banknote className="h-4 w-4 text-primary" />
                    Payout Account
                  </span>
                  <PayoutAccountStateBadge state={payout_account.account_state ?? null} />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 px-3 sm:px-4 pb-3">
                {payout_account.account_state && payout_account.account_state !== "verified_ready" && (
                  <div className="bg-warning/10 border border-warning/20 rounded-md p-2.5 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-warning">Finish Payout Setup</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {payoutAccountStateExplainer(payout_account.account_state)}
                      </p>
                      <Button size="sm" className="mt-2 h-11 text-xs" onClick={() => setEditModalOpen(true)}>
                        Complete Verification
                      </Button>
                    </div>
                  </div>
                )}

                <div className="space-y-1.5 text-[13px]">
                  <Row label="Bank Name" value={payout_account.bank_name ?? "Not set"} muted={!payout_account.bank_name} />
                  <Row label="Account Name" value={payout_account.account_name} />
                  <Row label="Account Number" value={payout_account.masked_account_number ?? "••••••••••"} muted={!payout_account.masked_account_number} />
                  <Row
                    label="Verification"
                    value={payout_account.verified ? "Verified" : "Not verified"}
                    valueClass={payout_account.verified ? "text-success" : "text-warning"}
                  />
                  <Row
                    label="Last Payout"
                    value={payout_account.last_payout_date ? formatDate(payout_account.last_payout_date) : "—"}
                    muted={!payout_account.last_payout_date}
                  />
                  <Row label="Processing Time" value={payout_account.typical_processing_time} />
                </div>

                <Button variant="outline" size="sm" className="w-full mt-2 h-11 text-xs" onClick={() => setEditModalOpen(true)}>
                  <FileText className="h-3.5 w-3.5 mr-1.5" /> Edit Payout Details
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      <Footer />

      <EditPayoutDetailsModal
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        onSave={handleSavePayoutAccount}
        existingAccount={payout_account.bank_name ? {
          bank_name: payout_account.bank_name,
          masked_account_number: payout_account.masked_account_number,
        } : null}
      />
      <ExportPayoutsDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        currentStatusFilter={statusFilter}
        currentSearch={search}
      />
    </div>
    </TooltipProvider>
  );
};

/* ── Helper sub-components ── */

function SummaryCard({
  label, value, subtitle, icon: Icon, iconBg, iconColor, badgeLabel, badgeBg, tooltip,
}: {
  label: string; value: string; subtitle: string;
  icon: React.ElementType; iconBg: string; iconColor: string;
  badgeLabel: string; badgeBg: string; tooltip?: React.ReactNode;
}) {
  return (
    <Card className="sd-card sd-metric h-full">
      <CardContent className="p-3">
        <div className="flex items-start justify-between mb-2">
          <div className={`h-7 w-7 rounded-md ${iconBg} flex items-center justify-center`}>
            <Icon className={`h-[14px] w-[14px] ${iconColor}`} />
          </div>
          <span className={`inline-flex items-center px-1.5 py-px rounded-full text-xs font-semibold ${badgeBg}`}>
            {badgeLabel}
          </span>
        </div>
        <div className="space-y-0.5">
          <p className="text-xs font-medium text-muted-foreground inline-flex items-center gap-1">
            {label}
            {tooltip && <CardInfoTip>{tooltip}</CardInfoTip>}
          </p>
          <p className="sd-kpi-value tabular-nums">{value}</p>
          <p className="sd-kpi-helper">{subtitle}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function Row({ label, value, muted, valueClass }: { label: string; value: string; muted?: boolean; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={valueClass ?? (muted ? "text-muted-foreground" : "text-foreground font-medium")}>{value}</span>
    </div>
  );
}

export default SellerPayouts;
