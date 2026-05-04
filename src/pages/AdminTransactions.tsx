import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  RefreshCw,
  Download,
  Search,
  SlidersHorizontal,
  Eye,
  MoreVertical,
  Snowflake,
  Flame,
  Flag,
  ShieldAlert,
  MessageSquare,
  ArrowLeftRight,
  Receipt,
  Banknote,
  Landmark,
  Scale,
  Clock,
  LineChart,
  User,
  Home,
  Menu,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Loader2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AdminReadingModeControl } from "@/components/admin/AdminReadingModeControl";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatMoney, formatMoneyCompact } from "@/lib/format";
import { toast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import {
  AdminAccessRequiredError,
  getAdminTransactionsMonitor,
  type AdminTxMonitorResponse,
  type AdminTxQuickFilter,
  type AdminTxRow,
  type AdminTxMonitorParams,
} from "@/services/admin-transactions-monitor.service";

/* ---------------- Visual helpers ---------------- */

const STATUS_BADGE_CLS: Record<string, string> = {
  awaiting_payment: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  funds_held: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  in_fulfillment: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  dispatched: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  delivered: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  completed: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  cancelled: "bg-muted text-muted-foreground border-border",
  in_dispute: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  refunded: "bg-muted text-muted-foreground border-border",
  failed: "bg-red-500/15 text-red-400 border-red-500/30",
};

const ESCROW_BADGE_CLS: Record<string, string> = {
  released: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  held: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  refunded: "bg-muted text-muted-foreground border-border",
  frozen: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  pending: "bg-muted text-muted-foreground border-border",
};

const FLAG_META: Record<string, { label: string; cls: string; Icon?: typeof Flag }> = {
  clean: { label: "Clean", cls: "bg-muted text-muted-foreground border-border" },
  escalated: { label: "Escalated", cls: "bg-orange-500/15 text-orange-300 border-orange-500/30", Icon: Flag },
  high_risk: { label: "High Risk", cls: "bg-red-500/15 text-red-400 border-red-500/30", Icon: ShieldAlert },
  fraud_watch: { label: "Fraud Watch", cls: "bg-red-500/15 text-red-400 border-red-500/30", Icon: Flame },
};

const QUICK_FILTERS: { key: AdminTxQuickFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "awaiting_payment", label: "Awaiting Payment" },
  { key: "funds_held", label: "Funds Held" },
  { key: "in_dispute", label: "In Dispute" },
  { key: "overdue", label: "Overdue" },
  { key: "refunded", label: "Refunded" },
  { key: "failed", label: "Failed" },
  { key: "flagged", label: "Flagged" },
  { key: "frozen", label: "Frozen" },
];

function Badge({ label, cls, Icon }: { label: string; cls: string; Icon?: typeof Flag }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold ${cls}`}>
      {Icon ? <Icon className="h-3 w-3" /> : null}
      {label}
    </span>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-NG", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}

/* ---------------- Page ---------------- */

const SIDEBAR_BADGES = {
  disputes: 0,
  identity: 0,
  payouts: 0,
  flagged_users: 0,
  exports: 0,
} as const;

const PAGE_SIZE = 25;

const TX_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "awaiting_payment", label: "Awaiting Payment" },
  { value: "payment_secured", label: "Funds Held" },
  { value: "seller_preparing_delivery", label: "In Fulfillment" },
  { value: "seller_dispatched", label: "Dispatched" },
  { value: "delivered_awaiting_verification", label: "Delivered" },
  { value: "completed", label: "Completed" },
  { value: "disputed", label: "In Dispute" },
  { value: "refunded", label: "Refunded" },
  { value: "cancelled", label: "Cancelled" },
  { value: "timed_out", label: "Timed Out" },
];
const MONEY_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "not_secured", label: "Not Secured" },
  { value: "payment_pending", label: "Payment Pending" },
  { value: "funds_held_in_escrow", label: "Held" },
  { value: "funds_frozen", label: "Frozen" },
  { value: "funds_pending_release", label: "Awaiting Release" },
  { value: "funds_releasing", label: "Releasing" },
  { value: "funds_released", label: "Released" },
  { value: "refund_pending", label: "Refund Pending" },
  { value: "refund_issued", label: "Refunded" },
];
const DISPUTE_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "seller_response_pending", label: "Awaiting Seller" },
  { value: "under_review", label: "Under Review" },
  { value: "resolved", label: "Resolved" },
];
const RISK_LEVEL_OPTIONS: { value: string; label: string }[] = [
  { value: "clean", label: "Clean" },
  { value: "escalated", label: "Escalated" },
  { value: "high_risk", label: "High Risk" },
  { value: "fraud_watch", label: "Fraud Watch" },
];

type SortKey = NonNullable<AdminTxMonitorParams["sortBy"]>;
type SortDir = NonNullable<AdminTxMonitorParams["sortDirection"]>;
const SORT_OPTIONS: { key: SortKey; dir: SortDir; label: string }[] = [
  { key: "urgency", dir: "desc", label: "Urgency (default)" },
  { key: "created_at", dir: "desc", label: "Newest" },
  { key: "created_at", dir: "asc", label: "Oldest" },
  { key: "amount", dir: "desc", label: "Amount: High → Low" },
  { key: "amount", dir: "asc", label: "Amount: Low → High" },
  { key: "last_activity_at", dir: "desc", label: "Last activity" },
  { key: "status", dir: "asc", label: "Status" },
  { key: "risk_level", dir: "desc", label: "Risk level" },
];

const REALTIME_TABLES = [
  "transactions",
  "transaction_events",
  "money_status_history",
  "disputes",
  "payments",
  "payouts",
  "release_review_queue",
] as const;

function relativeMinutes(from: Date | null): string {
  if (!from) return "—";
  const ms = Date.now() - from.getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  return `${Math.round(h / 24)} day(s) ago`;
}

export default function AdminTransactions() {
  const navigate = useNavigate();
  const [activeQuick, setActiveQuick] = useState<AdminTxQuickFilter>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [txStatus, setTxStatus] = useState<string>("");
  const [moneyStatus, setMoneyStatus] = useState<string>("");
  const [disputeStatus, setDisputeStatus] = useState<string>("");
  const [riskLevel, setRiskLevel] = useState<string>("");
  const [amountMin, setAmountMin] = useState<string>("");
  const [amountMax, setAmountMax] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [sortBy, setSortBy] = useState<SortKey>("urgency");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [data, setData] = useState<AdminTxMonitorResponse | null>(null);
  const [initialLoad, setInitialLoad] = useState(true);
  const [isFetching, setIsFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [lastUpdatedTick, setLastUpdatedTick] = useState(0);
  const [liveSync, setLiveSync] = useState<"connecting" | "live" | "off">("connecting");
  const reqIdRef = useRef(0);
  const realtimeDebounceRef = useRef<number | null>(null);
  const lastRealtimeToastRef = useRef<number>(0);

  // Debounce search
  useEffect(() => {
    const h = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(h);
  }, [search]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [activeQuick, debouncedSearch, txStatus, moneyStatus, disputeStatus, riskLevel, amountMin, amountMax, dateFrom, dateTo, sortBy, sortDir]);

  const fetchData = useCallback(async () => {
    const reqId = ++reqIdRef.current;
    setIsFetching(true);
    setError(null);
    try {
      const resp = await getAdminTransactionsMonitor({
        search: debouncedSearch || undefined,
        quickFilter: activeQuick,
        transactionStatus: txStatus || undefined,
        moneyStatus: moneyStatus || undefined,
        disputeStatus: disputeStatus || undefined,
        riskLevel: riskLevel || undefined,
        amountMin: amountMin ? Number(amountMin) : undefined,
        amountMax: amountMax ? Number(amountMax) : undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        page,
        pageSize: PAGE_SIZE,
        sortBy,
        sortDirection: sortDir,
      });
      if (reqIdRef.current !== reqId) return;
      setData(resp);
      setLastUpdated(new Date());
    } catch (e) {
      if (reqIdRef.current !== reqId) return;
      if (e instanceof AdminAccessRequiredError) {
        setAccessDenied(true);
      } else {
        setError((e as Error).message || "Failed to load transactions");
      }
    } finally {
      if (reqIdRef.current === reqId) {
        setIsFetching(false);
        setInitialLoad(false);
      }
    }
  }, [debouncedSearch, activeQuick, page, txStatus, moneyStatus, disputeStatus, riskLevel, amountMin, amountMax, dateFrom, dateTo, sortBy, sortDir]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Tick "last updated" label every 30s
  useEffect(() => {
    const id = setInterval(() => setLastUpdatedTick((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, []);

  // Realtime subscription
  useEffect(() => {
    if (accessDenied) return;
    setLiveSync("connecting");
    const channel = supabase.channel("admin-tx-monitor");
    for (const table of REALTIME_TABLES) {
      channel.on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table },
        () => {
          if (realtimeDebounceRef.current) window.clearTimeout(realtimeDebounceRef.current);
          realtimeDebounceRef.current = window.setTimeout(() => {
            fetchData();
            const now = Date.now();
            if (now - lastRealtimeToastRef.current > 5000) {
              lastRealtimeToastRef.current = now;
              sonnerToast("Transaction monitor updated", { duration: 2500 });
            }
          }, 1500);
        },
      );
    }
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") setLiveSync("live");
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setLiveSync("off");
    });
    return () => {
      if (realtimeDebounceRef.current) window.clearTimeout(realtimeDebounceRef.current);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessDenied]);

  const handleRefresh = () => {
    fetchData();
  };
  const handleExport = () =>
    toast({ title: "Export queued", description: "Your export will appear in /admin/exports when ready." });
  const handleRowAction = (label: string, code: string) =>
    toast({ title: label, description: `${code} — coming soon` });

  const clearAllFilters = useCallback(() => {
    setActiveQuick("all");
    setSearch("");
    setTxStatus("");
    setMoneyStatus("");
    setDisputeStatus("");
    setRiskLevel("");
    setAmountMin("");
    setAmountMax("");
    setDateFrom("");
    setDateTo("");
  }, []);

  const lastUpdatedLabel = useMemo(() => relativeMinutes(lastUpdated), [lastUpdated, lastUpdatedTick]);
  const currentSortLabel = useMemo(
    () => SORT_OPTIONS.find((o) => o.key === sortBy && o.dir === sortDir)?.label ?? "Custom",
    [sortBy, sortDir],
  );

  const summary = data?.summary;
  const rows = data?.rows ?? [];
  const pagination = data?.pagination;

  const summaryTiles = useMemo(
    () => [
      {
        key: "total_tx", icon: Receipt, label: "Total Transactions",
        value: summary ? summary.totalTransactions.toLocaleString("en-NG") : "—",
        exact: null,
        iconCls: "bg-blue-500/15 text-blue-400",
      },
      {
        key: "total_amount", icon: Banknote, label: "Total Amount",
        value: summary ? formatMoneyCompact(summary.totalAmount) : "—",
        exact: summary ? formatMoney(summary.totalAmount) : null,
        iconCls: "bg-emerald-500/15 text-emerald-400",
      },
      {
        key: "in_escrow", icon: Landmark, label: "In Escrow",
        value: summary ? formatMoneyCompact(summary.inEscrowAmount) : "—",
        exact: summary ? formatMoney(summary.inEscrowAmount) : null,
        iconCls: "bg-purple-500/15 text-purple-400",
      },
      {
        key: "in_dispute", icon: Scale, label: "In Dispute",
        value: summary ? summary.inDisputeCount.toLocaleString("en-NG") : "—",
        exact: null,
        iconCls: "bg-orange-500/15 text-orange-400",
      },
      {
        key: "awaiting", icon: Clock, label: "Awaiting Action",
        value: summary ? summary.awaitingActionCount.toLocaleString("en-NG") : "—",
        exact: null,
        iconCls: "bg-yellow-500/15 text-yellow-400",
      },
      {
        key: "flagged", icon: Flag, label: "Flagged",
        value: summary ? summary.flaggedCount.toLocaleString("en-NG") : "—",
        exact: null,
        iconCls: "bg-red-500/15 text-red-400",
      },
    ],
    [summary],
  );

  if (accessDenied) {
    return (
      <AdminLayout title="Transaction Monitor" subtitle="Admin access required" badges={SIDEBAR_BADGES}>
        <div className="rounded-xl border border-border bg-card p-10 text-center">
          <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-red-400" />
          <h2 className="text-base font-semibold text-foreground">Admin access required</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            You don't have permission to view the Transaction Monitor.
          </p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Transaction Monitor"
      subtitle="Monitor and investigate all platform transactions"
      badges={SIDEBAR_BADGES}
      headerSlot={
        <div className="sticky top-0 z-30 hidden border-b border-border bg-background/85 backdrop-blur lg:block">
          <div className="flex items-center justify-between gap-4 px-8 py-4">
            <div className="flex min-w-0 items-center gap-4">
              <div>
                <h1 className="text-xl font-semibold leading-tight text-foreground">Transaction Monitor</h1>
                <p className="text-xs text-muted-foreground">Monitor and investigate all platform transactions</p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                Live
              </span>
            </div>
            <div className="flex items-center gap-2">
              <AdminReadingModeControl variant="desktop" />
              <ThemeToggle />
              <button
                type="button"
                onClick={handleExport}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted/60 px-3.5 py-2 text-sm text-foreground transition-colors hover:bg-muted"
              >
                <Download className="h-4 w-4" />
                Export
              </button>
              <button
                type="button"
                onClick={handleRefresh}
                disabled={isFetching}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-500 disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>
          </div>
        </div>
      }
      mobileHeaderSlot={({ onOpenMenu }) => (
        <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <button
              type="button"
              onClick={onOpenMenu}
              aria-label="Open menu"
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-foreground/90 hover:bg-muted/70"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1 text-center">
              <div className="truncate text-sm font-semibold leading-tight text-foreground">Transaction Monitor</div>
              <div className="inline-flex items-center gap-1.5 text-[10px] font-medium text-emerald-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                Live
              </div>
            </div>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isFetching}
              aria-label="Refresh"
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-foreground/90 hover:bg-muted/70 disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            </button>
          </div>
        </header>
      )}
    >
      {/* Error banner */}
      {error && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
          <div className="inline-flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            <span>Failed to load transactions: {error}</span>
          </div>
          <button
            type="button"
            onClick={fetchData}
            className="rounded-md border border-red-500/40 px-3 py-1 text-xs font-medium hover:bg-red-500/15"
          >
            Retry
          </button>
        </div>
      )}

      {/* Summary KPI cards */}
      <TooltipProvider delayDuration={150}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {summaryTiles.map((t, i) => {
            const Icon = t.icon;
            const card = (
              <div
                key={t.key}
                className={`sd-fade-in-stagger sd-delay-${Math.min(i + 1, 6)} rounded-xl border border-border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-foreground/10`}
              >
                <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-lg ${t.iconCls}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="text-[11px] text-muted-foreground">{t.label}</div>
                <div className="mt-1 truncate text-2xl font-semibold tracking-tight text-foreground">
                  {isFetching && !summary ? <span className="inline-block h-6 w-16 animate-pulse rounded bg-muted" /> : t.value}
                </div>
              </div>
            );
            if (t.exact) {
              return (
                <Tooltip key={t.key}>
                  <TooltipTrigger asChild>{card}</TooltipTrigger>
                  <TooltipContent>{t.exact}</TooltipContent>
                </Tooltip>
              );
            }
            return card;
          })}
        </div>
      </TooltipProvider>

      {/* Quick filter chips */}
      <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1 animate-fade-in">
        {QUICK_FILTERS.map((f) => {
          const active = activeQuick === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setActiveQuick(f.key)}
              className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? "border-blue-500/40 bg-blue-500/15 text-blue-300"
                  : "border-border bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Search + filters panel */}
      <div className="rounded-xl border border-border bg-card p-3 animate-fade-in">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <ResponsiveSearchInput value={search} onChange={setSearch} />
          </div>
          <button
            type="button"
            onClick={() => setFiltersOpen((s) => !s)}
            className="inline-flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/60 px-3 py-2 text-sm text-foreground hover:bg-muted lg:hidden"
          >
            <span className="inline-flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4" /> Filters
            </span>
          </button>
        </div>

        <div
          className={`mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4 ${filtersOpen ? "" : "hidden"} lg:grid`}
        >
          <FilterSelect
            label="Transaction Status"
            value={txStatus}
            onChange={setTxStatus}
            options={TX_STATUS_OPTIONS}
          />
          <FilterSelect
            label="Money Status"
            value={moneyStatus}
            onChange={setMoneyStatus}
            options={MONEY_STATUS_OPTIONS}
          />
          <FilterSelect
            label="Dispute Status"
            value={disputeStatus}
            onChange={setDisputeStatus}
            options={DISPUTE_STATUS_OPTIONS}
          />
          <div className="grid grid-cols-2 gap-2">
            <FilterInput label="Min ₦" type="number" value={amountMin} onChange={setAmountMin} />
            <FilterInput label="Max ₦" type="number" value={amountMax} onChange={setAmountMax} />
          </div>
          <FilterInput label="From" type="date" value={dateFrom} onChange={setDateFrom} />
          <FilterInput label="To" type="date" value={dateTo} onChange={setDateTo} />
          <div className="flex items-end justify-end sm:col-span-2 lg:col-span-2">
            <button
              type="button"
              onClick={() => {
                setActiveQuick("all");
                setSearch("");
                setTxStatus("");
                setMoneyStatus("");
                setDisputeStatus("");
                setAmountMin("");
                setAmountMax("");
                setDateFrom("");
                setDateTo("");
              }}
              className="rounded-lg border border-border bg-muted/60 px-3 py-2 text-sm text-foreground hover:bg-muted"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden rounded-xl border border-border bg-card lg:block">
        <div className="flex items-center justify-between border-b border-border p-3">
          <h3 className="text-sm font-semibold text-foreground">
            Transactions
            {pagination && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                ({pagination.totalCount.toLocaleString("en-NG")} total)
              </span>
            )}
          </h3>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 text-emerald-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> Live sync
            </span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 text-left font-semibold">Transaction</th>
                <th className="px-3 py-2 text-left font-semibold">Item</th>
                <th className="px-3 py-2 text-left font-semibold">Parties</th>
                <th className="px-3 py-2 text-left font-semibold">Amount</th>
                <th className="px-3 py-2 text-left font-semibold">Status</th>
                <th className="px-3 py-2 text-left font-semibold">Escrow</th>
                <th className="px-3 py-2 text-left font-semibold">Flags</th>
                <th className="px-3 py-2 text-left font-semibold">Last Activity</th>
                <th className="px-3 py-2 text-left font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isFetching && rows.length === 0 ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/60">
                    <td colSpan={9} className="px-3 py-3">
                      <div className="h-6 w-full animate-pulse rounded bg-muted/60" />
                    </td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center text-sm text-muted-foreground">
                    No transactions match the current filters.
                  </td>
                </tr>
              ) : (
                rows.map((t, i) => (
                  <tr
                    key={t.transactionId}
                    className={`sd-fade-in-stagger sd-delay-${Math.min(i + 1, 6)} border-b border-border/60 transition-colors hover:bg-muted/40`}
                  >
                    <td className="px-3 py-3 align-top">
                      <div className="flex items-start gap-2">
                        {t.isFrozen ? <Snowflake className="mt-0.5 h-3.5 w-3.5 text-cyan-400" /> : null}
                        <div>
                          <div className="font-medium text-foreground">#{t.transactionCode}</div>
                          <div className="text-xs text-muted-foreground">{formatDate(t.createdAt)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="font-medium text-foreground">{t.itemTitle}</div>
                      {t.itemCategory ? (
                        <div className="text-xs text-muted-foreground">{t.itemCategory}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="text-xs">
                        <span className="text-muted-foreground">Buyer:</span>{" "}
                        <span className="text-foreground">{t.buyerName}</span>
                      </div>
                      <div className="text-xs">
                        <span className="text-muted-foreground">Seller:</span>{" "}
                        <span className="text-foreground">{t.sellerName}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="font-semibold text-foreground tabular-nums">
                        {formatMoney(t.amount, t.currency)}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Protection Fee: {formatMoney(t.protectionFee, t.currency)}
                      </div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <Badge
                        label={t.transactionStatus.label}
                        cls={STATUS_BADGE_CLS[t.transactionStatus.key] ?? "bg-muted text-muted-foreground border-border"}
                      />
                      <div className="mt-1 text-[11px] text-muted-foreground">{t.moneyStatus.label}</div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <Badge
                        label={t.escrowStatus.label}
                        cls={ESCROW_BADGE_CLS[t.escrowStatus.key] ?? "bg-muted text-muted-foreground border-border"}
                      />
                    </td>
                    <td className="px-3 py-3 align-top">
                      <Badge
                        label={FLAG_META[t.riskLevel].label}
                        cls={FLAG_META[t.riskLevel].cls}
                        Icon={FLAG_META[t.riskLevel].Icon}
                      />
                    </td>
                    <td className="px-3 py-3 align-top">
                      <span
                        className={`text-xs ${
                          t.lastActivityTone === "danger"
                            ? "text-red-400"
                            : t.lastActivityTone === "warn"
                              ? "text-orange-300"
                              : "text-muted-foreground"
                        }`}
                      >
                        {t.lastActivityLabel}
                      </span>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="flex items-center justify-start gap-1.5 text-muted-foreground">
                        <IconBtn label="View" onClick={() => handleRowAction("View transaction", t.transactionCode)}>
                          <Eye className="h-4 w-4" />
                        </IconBtn>
                        {t.riskLevel !== "clean" || t.transactionStatus.key === "in_dispute" ? (
                          <>
                            <IconBtn label="Notes" onClick={() => handleRowAction("Open notes", t.transactionCode)}>
                              <MessageSquare className="h-4 w-4" />
                            </IconBtn>
                            <IconBtn label="Trace funds" onClick={() => handleRowAction("Trace funds", t.transactionCode)}>
                              <ArrowLeftRight className="h-4 w-4" />
                            </IconBtn>
                            {t.actionAvailability.canFreeze && (
                              <IconBtn label="Freeze" onClick={() => handleRowAction("Freeze transaction", t.transactionCode)}>
                                <Snowflake className="h-4 w-4" />
                              </IconBtn>
                            )}
                          </>
                        ) : null}
                        <IconBtn label="More" onClick={() => handleRowAction("More actions", t.transactionCode)}>
                          <MoreVertical className="h-4 w-4" />
                        </IconBtn>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {/* Pagination footer */}
        {pagination && pagination.totalCount > 0 && (
          <PaginationBar
            page={pagination.page}
            pageSize={pagination.pageSize}
            totalCount={pagination.totalCount}
            hasNext={pagination.hasNextPage}
            hasPrev={pagination.hasPreviousPage}
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => p + 1)}
          />
        )}
      </div>

      {/* Mobile card list */}
      <div className="space-y-3 lg:hidden pb-20">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-sm font-semibold text-foreground">Recent Transactions</h3>
          {pagination ? (
            <span className="text-[11px] text-muted-foreground">
              {pagination.totalCount.toLocaleString("en-NG")} total
            </span>
          ) : null}
        </div>
        {isFetching && rows.length === 0 ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl border border-border bg-card" />
          ))
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
            No transactions match.
          </div>
        ) : (
          rows.map((t, i) => (
            <article
              key={t.transactionId}
              className={`sd-fade-in-stagger sd-delay-${Math.min(i + 1, 6)} rounded-xl border border-border bg-card p-3`}
            >
              <header className="flex items-start justify-between">
                <div className="flex items-start gap-2">
                  {t.isFrozen ? <Snowflake className="mt-0.5 h-3.5 w-3.5 text-cyan-400" /> : null}
                  <div>
                    <div className="text-sm font-semibold text-foreground">#{t.transactionCode}</div>
                    <div className="text-[11px] text-muted-foreground">{formatDate(t.createdAt)}</div>
                  </div>
                </div>
                <Badge
                  label={t.transactionStatus.label}
                  cls={STATUS_BADGE_CLS[t.transactionStatus.key] ?? "bg-muted text-muted-foreground border-border"}
                />
              </header>

              <div className="mt-2">
                <div className="text-sm font-medium text-foreground">{t.itemTitle}</div>
                {t.itemCategory ? (
                  <div className="text-[11px] text-muted-foreground">{t.itemCategory}</div>
                ) : null}
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2 border-t border-border pt-2 text-[11px]">
                <div>
                  <div className="text-muted-foreground">Buyer</div>
                  <div className="truncate text-foreground">{t.buyerName}</div>
                </div>
                <div className="text-right">
                  <div className="text-muted-foreground">Seller</div>
                  <div className="truncate text-foreground">{t.sellerName}</div>
                </div>
              </div>

              {(t.riskLevel !== "clean" || t.isFrozen) && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
                  {t.escrowStatus.key !== "pending" && t.escrowStatus.key !== "released" && (
                    <Badge
                      label={t.escrowStatus.label}
                      cls={ESCROW_BADGE_CLS[t.escrowStatus.key] ?? "bg-muted text-muted-foreground border-border"}
                    />
                  )}
                  {t.riskLevel !== "clean" && (
                    <Badge
                      label={FLAG_META[t.riskLevel].label}
                      cls={FLAG_META[t.riskLevel].cls}
                      Icon={FLAG_META[t.riskLevel].Icon}
                    />
                  )}
                </div>
              )}

              <div className="mt-2 flex items-end justify-between border-t border-border pt-2">
                <div>
                  <div className="text-base font-semibold text-foreground tabular-nums">
                    {formatMoney(t.amount, t.currency)}
                  </div>
                  <div
                    className={`text-[11px] ${
                      t.lastActivityTone === "danger" ? "text-red-400" : "text-muted-foreground"
                    }`}
                  >
                    Protection: {formatMoney(t.protectionFee, t.currency)}
                  </div>
                  {t.lastActivityTone === "danger" ? (
                    <div className="mt-0.5 text-[11px] text-red-400">{t.lastActivityLabel}</div>
                  ) : null}
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <IconBtn label="View" onClick={() => handleRowAction("View transaction", t.transactionCode)}>
                    <Eye className="h-4 w-4 text-blue-400" />
                  </IconBtn>
                  <IconBtn label="More" onClick={() => handleRowAction("More actions", t.transactionCode)}>
                    <MoreVertical className="h-4 w-4" />
                  </IconBtn>
                </div>
              </div>
            </article>
          ))
        )}
        {pagination && pagination.totalCount > 0 && (
          <PaginationBar
            page={pagination.page}
            pageSize={pagination.pageSize}
            totalCount={pagination.totalCount}
            hasNext={pagination.hasNextPage}
            hasPrev={pagination.hasPreviousPage}
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => p + 1)}
          />
        )}
      </div>

      {/* Mobile bottom navigation */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="grid grid-cols-4">
          <BottomNav active label="Transactions" Icon={Receipt} onClick={() => {}} />
          <BottomNav label="Disputes" Icon={Scale} onClick={() => navigate("/admin/dashboard")} />
          <BottomNav label="Dashboard" Icon={LineChart} onClick={() => navigate("/admin/dashboard")} />
          <BottomNav label="Profile" Icon={User} onClick={() => toast({ title: "Profile", description: "Coming soon" })} />
        </div>
      </nav>
    </AdminLayout>
  );
}

/* ---------------- Subcomponents ---------------- */

function IconBtn({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="rounded-md p-1.5 transition-colors hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}

function BottomNav({
  Icon,
  label,
  active,
  badge,
  onClick,
}: {
  Icon: typeof Home;
  label: string;
  active?: boolean;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors ${
        active ? "text-blue-400" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="h-5 w-5" />
      {label}
      {badge && badge > 0 ? (
        <span className="absolute right-[28%] top-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-orange-500 px-1 text-[9px] font-bold text-white">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

function PaginationBar({
  page, pageSize, totalCount, hasNext, hasPrev, onPrev, onNext,
}: {
  page: number; pageSize: number; totalCount: number;
  hasNext: boolean; hasPrev: boolean;
  onPrev: () => void; onNext: () => void;
}) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border p-3 text-xs text-muted-foreground">
      <span>
        Page {page} of {totalPages}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPrev}
          disabled={!hasPrev}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/60 px-2.5 py-1 text-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Prev
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!hasNext}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/60 px-2.5 py-1 text-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          Next <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function ResponsiveSearchInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [isLg, setIsLg] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 1024px)").matches : false,
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const handler = (e: MediaQueryListEvent) => setIsLg(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={isLg ? "Search transaction code..." : "Search transactions..."}
      aria-label="Search transactions"
      className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/40"
    />
  );
}
function FilterSelect({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/40"
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

function FilterInput({
  label, value, onChange, type,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type: "text" | "number" | "date";
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/40"
      />
    </label>
  );
}
