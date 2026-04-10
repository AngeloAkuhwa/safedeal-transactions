import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { SellerNav } from "@/components/seller/SellerNav";
import { Footer } from "@/components/landing/Footer";
import { EditPayoutDetailsModal } from "@/components/seller/EditPayoutDetailsModal";
import { getSellerPayouts, updatePayoutAccount } from "@/services/seller-payouts.service";
import { toast } from "@/hooks/use-toast";
import type { PayoutHistoryItem, UpcomingRelease, BlockedFund } from "@/services/seller-payouts.service";

function formatCurrency(amount: number) {
  return `₦${amount.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-NG", { month: "short", day: "numeric", year: "numeric" });
}

function PayoutStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    completed: { label: "Released", className: "bg-success/10 text-success border-success/20" },
    processing: { label: "Processing", className: "bg-primary/10 text-primary border-primary/20" },
    pending: { label: "Scheduled", className: "bg-warning/10 text-warning border-warning/20" },
    failed: { label: "Failed", className: "bg-destructive/10 text-destructive border-destructive/20" },
    cancelled: { label: "Cancelled", className: "bg-muted text-muted-foreground border-border" },
  };
  const cfg = map[status] ?? map.cancelled;
  return <Badge variant="outline" className={cfg.className}>{cfg.label}</Badge>;
}

function RowAction({ row, onFixPayout }: { row: PayoutHistoryItem; onFixPayout: () => void }) {
  if (row.status === "completed") {
    return (
      <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
        <Link to={`/seller/transactions/${row.transaction_id}`}>
          <Eye className="h-3 w-3 mr-1" /> View Payout
        </Link>
      </Button>
    );
  }
  if (row.status === "failed") {
    return (
      <Button
        variant="ghost" size="sm"
        className="h-7 text-xs text-destructive"
        onClick={() => toast({ title: "Retry queued", description: "Payout retry has been queued. Please check back shortly." })}
      >
        <RotateCcw className="h-3 w-3 mr-1" /> Retry
      </Button>
    );
  }
  if (row.status === "pending" || row.status === "processing") {
    return (
      <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
        <Link to={`/seller/transactions/${row.transaction_id}`}>
          <Eye className="h-3 w-3 mr-1" /> View Transaction
        </Link>
      </Button>
    );
  }
  return null;
}

const SellerPayouts = () => {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [editModalOpen, setEditModalOpen] = useState(false);
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
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4 px-4 text-center">
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

  return (
    <div className="min-h-screen bg-background">
      <SellerNav sellerName={seller.full_name} avatarUrl={seller.avatar_url} />

      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Payouts</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Track released funds, pending releases, held escrow balances, and payout account activity.
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard
            label="Total Released"
            value={formatCurrency(summary.total_released)}
            subtitle={`₦${summary.total_released_last_30.toLocaleString("en-NG")} in last 30 days`}
            icon={CheckCircle2}
            iconBg="bg-success/10"
            iconColor="text-success"
            badgeLabel="Released"
            badgeBg="bg-success/10 text-success"
          />
          <SummaryCard
            label="Pending Release"
            value={formatCurrency(summary.pending_release)}
            subtitle="Awaiting confirmation or processing"
            icon={Clock}
            iconBg="bg-warning/10"
            iconColor="text-warning"
            badgeLabel="Pending"
            badgeBg="bg-warning/10 text-warning"
          />
          <SummaryCard
            label="Held in Escrow"
            value={formatCurrency(summary.held_in_escrow)}
            subtitle="Tied to active transactions"
            icon={Shield}
            iconBg="bg-primary/10"
            iconColor="text-primary"
            badgeLabel="Escrow"
            badgeBg="bg-primary/10 text-primary"
          />
          <SummaryCard
            label="On Hold / Failed"
            value={formatCurrency(summary.on_hold_failed)}
            subtitle="Delayed by disputes or issues"
            icon={AlertTriangle}
            iconBg="bg-destructive/10"
            iconColor="text-destructive"
            badgeLabel="Action Needed"
            badgeBg="bg-destructive/10 text-destructive"
          />
        </div>

        {/* How Payouts Work */}
        <Card className="rounded-2xl border-primary/10 bg-primary/[0.02]">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Info className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-foreground">How Payouts Work</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-5">
              SafeDeal holds funds securely until the buyer confirms receipt or the auto-release window expires, then processes your payout.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { icon: Shield, label: "Payment Held", desc: "Funds secured in escrow" },
                { icon: CheckCircle2, label: "Buyer Confirms", desc: "Or auto-release / admin decision" },
                { icon: CreditCard, label: "Payout Processing", desc: "Funds being transferred" },
                { icon: Send, label: "Funds Sent", desc: "Deposited to your account" },
              ].map((step, i) => (
                <div key={i} className="flex flex-col items-center text-center gap-2">
                  <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <step.icon className="h-5 w-5 text-primary" />
                  </div>
                  <span className="text-sm font-medium text-foreground">{step.label}</span>
                  <span className="text-xs text-muted-foreground">{step.desc}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Payout History */}
          <div className="lg:col-span-2 space-y-4">
            <Card className="rounded-2xl">
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <CardTitle className="text-lg">Payout History</CardTitle>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search..."
                        className="pl-9 h-9 w-48"
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                      />
                    </div>
                    <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v === "all" ? "" : v); setPage(1); }}>
                      <SelectTrigger className="h-9 w-36">
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
                    <Button variant="outline" size="sm" className="h-9">
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
                      Once buyers confirm delivery or auto-release triggers, your payouts will appear here.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="overflow-auto">
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
                                <Link
                                  to={`/seller/transactions/${row.transaction_id}`}
                                  className="text-primary hover:underline"
                                >
                                  {row.transaction_code}
                                </Link>
                              </TableCell>
                              <TableCell className="hidden md:table-cell text-sm">{row.buyer_name}</TableCell>
                              <TableCell className="hidden lg:table-cell text-sm max-w-[120px] truncate">{row.item_title}</TableCell>
                              <TableCell className="text-right hidden sm:table-cell text-sm">{formatCurrency(row.gross_amount)}</TableCell>
                              <TableCell className="text-right hidden sm:table-cell text-sm text-muted-foreground">-{formatCurrency(row.fees)}</TableCell>
                              <TableCell className="text-right font-semibold text-sm">{formatCurrency(row.net_payout)}</TableCell>
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
                          <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          <span className="text-sm px-2">{page} / {pagination.total_pages}</span>
                          <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= pagination.total_pages} onClick={() => setPage(page + 1)}>
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
          <div className="space-y-5">
            {/* Upcoming Releases */}
            <Card className="rounded-2xl">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-success" />
                  Upcoming Releases
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {upcoming_releases.length === 0 ? (
                  <div className="text-center py-6">
                    <Clock className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No upcoming releases right now.</p>
                  </div>
                ) : (
                  upcoming_releases.map((r: UpcomingRelease) => (
                    <div key={r.transaction_id} className="border rounded-xl p-3.5 space-y-2 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center justify-between">
                        <Link to={`/seller/transactions/${r.transaction_id}`} className="text-xs font-mono text-primary hover:underline">
                          {r.transaction_code}
                        </Link>
                        <Badge variant="outline" className="bg-success/10 text-success border-success/20 text-xs">{r.release_trigger}</Badge>
                      </div>
                      <p className="text-sm font-medium text-foreground truncate">{r.item_title}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">{r.buyer_name}</span>
                        <span className="text-sm font-bold text-foreground">{formatCurrency(r.amount)}</span>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Blocked / Delayed */}
            {blocked_funds.length > 0 && (
              <Card className="rounded-2xl border-warning/30">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-warning" />
                    Blocked / Delayed Funds
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {blocked_funds.map((b: BlockedFund) => (
                    <div key={b.transaction_id} className="border border-warning/20 bg-warning/[0.03] rounded-xl p-3.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <Link to={`/seller/transactions/${b.transaction_id}`} className="text-xs font-mono text-primary hover:underline">
                          {b.transaction_code}
                        </Link>
                        <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 text-xs">On Hold</Badge>
                      </div>
                      <p className="text-sm font-medium text-foreground truncate">{b.item_title}</p>
                      <div className="flex items-center gap-1.5">
                        <AlertCircle className="h-3.5 w-3.5 text-warning flex-shrink-0" />
                        <span className="text-xs text-warning">{b.blocker_reason}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">{b.buyer_name}</span>
                        <span className="text-sm font-bold text-foreground">{formatCurrency(b.amount)}</span>
                      </div>
                      {/* Context-aware action for blocked funds */}
                      {b.blocker_reason.includes("Dispute") && (
                        <Button variant="outline" size="sm" className="w-full h-7 text-xs mt-1" asChild>
                          <Link to={`/seller/transactions/${b.transaction_id}`}>View Dispute</Link>
                        </Button>
                      )}
                      {b.blocker_reason.includes("verification") && (
                        <Button variant="outline" size="sm" className="w-full h-7 text-xs mt-1" onClick={() => setEditModalOpen(true)}>
                          Fix Payout Details
                        </Button>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Payout Account */}
            <Card className={`rounded-2xl ${!payout_account.verified ? "border-warning/30" : ""}`}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Banknote className="h-4 w-4 text-primary" />
                  Payout Account
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {!payout_account.verified && (
                  <div className="bg-warning/10 border border-warning/20 rounded-lg p-3 flex items-start gap-2.5">
                    <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-warning">Verification Incomplete</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Complete payout verification to receive funds.</p>
                      <Button size="sm" className="mt-2 h-7 text-xs" onClick={() => setEditModalOpen(true)}>
                        Complete Verification
                      </Button>
                    </div>
                  </div>
                )}

                <div className="space-y-2.5 text-sm">
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

                <Button variant="outline" size="sm" className="w-full mt-2" onClick={() => setEditModalOpen(true)}>
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
    </div>
  );
};

/* ── Helper sub-components ── */

function SummaryCard({
  label, value, subtitle, icon: Icon, iconBg, iconColor, badgeLabel, badgeBg,
}: {
  label: string; value: string; subtitle: string;
  icon: React.ElementType; iconBg: string; iconColor: string;
  badgeLabel: string; badgeBg: string;
}) {
  return (
    <Card className="rounded-2xl shadow-md hover:shadow-lg transition-all">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className={`h-11 w-11 rounded-xl ${iconBg} flex items-center justify-center`}>
            <Icon className={`h-5 w-5 ${iconColor}`} />
          </div>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${badgeBg}`}>
            {badgeLabel}
          </span>
        </div>
        <div className="space-y-0.5">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold text-foreground">{value}</p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
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
