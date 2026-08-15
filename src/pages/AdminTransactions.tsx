import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  RefreshCw,
  Download,
  Search,
  SlidersHorizontal,
  Eye,
  Snowflake,
  Flame,
  Flag,
  ShieldAlert,
  MessageSquare,
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
  ShieldCheck,
  Truck,
  CheckCircle2,
  RotateCcw,
  Ban,
  FileText,
  Hourglass,
} from "lucide-react";
import { useNavigate, useLocation, useSearchParams } from "react-router";
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
import {
  addInternalNote,
  freezeTransaction,
  unfreezeTransaction,
  flagForReview,
  escalateDispute,
} from "@/services/admin-transaction-actions.service";
import { RowActionsMenu } from "@/components/admin/transactions/RowActionsMenu";
import { ActionConfirmDialog } from "@/components/admin/transactions/ActionConfirmDialog";
import { InternalNoteDialog } from "@/components/admin/transactions/InternalNoteDialog";
import { DetailDrawer } from "@/components/admin/transactions/DetailDrawer";
import { TransactionsEmptyState } from "@/components/admin/transactions/TransactionsEmptyState";
import { rowStateClass, pickEmptyVariant } from "@/components/admin/transactions/rowState";
import { runExport } from "@/services/admin-escrow.service";

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

// Operational flags returned in `flags[]` by admin-transactions-monitor.
const SECONDARY_FLAG_META: Record<string, { label: string; cls: string; Icon?: typeof Flag }> = {
  frozen:         { label: "Frozen",         cls: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",      Icon: Snowflake },
  admin_frozen:   { label: "Admin Frozen",   cls: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",      Icon: Snowflake },
  overdue:        { label: "Overdue",        cls: "bg-orange-500/15 text-orange-300 border-orange-500/30",Icon: Clock },
  payment_failed: { label: "Payment Failed", cls: "bg-red-500/15 text-red-400 border-red-500/30",         Icon: ShieldAlert },
  payout_failed:  { label: "Payout Failed",  cls: "bg-red-500/15 text-red-400 border-red-500/30",         Icon: ShieldAlert },
  risk_flagged:   { label: "Risk Flagged",   cls: "bg-red-500/15 text-red-400 border-red-500/30",         Icon: Flag },
};

// Neutral lifecycle pills shown when no risk/operational flag is present, so
// every row in the monitor communicates state at a glance.
const NEUTRAL_FLAG_META: Record<string, { label: string; cls: string; Icon?: typeof Flag }> = {
  funds_held:        { label: "Held Safely",      cls: "bg-sky-500/10 text-sky-300 border-sky-500/30",         Icon: ShieldCheck },
  held:              { label: "Held Safely",      cls: "bg-sky-500/10 text-sky-300 border-sky-500/30",         Icon: ShieldCheck },
  in_fulfillment:    { label: "In Fulfillment",   cls: "bg-indigo-500/10 text-indigo-300 border-indigo-500/30",Icon: Truck },
  dispatched:        { label: "In Transit",       cls: "bg-indigo-500/10 text-indigo-300 border-indigo-500/30",Icon: Truck },
  in_transit:        { label: "In Transit",       cls: "bg-indigo-500/10 text-indigo-300 border-indigo-500/30",Icon: Truck },
  delivered:         { label: "Awaiting Confirm", cls: "bg-amber-500/10 text-amber-300 border-amber-500/30",   Icon: Clock },
  delivered_awaiting_verification: { label: "Awaiting Confirm", cls: "bg-amber-500/10 text-amber-300 border-amber-500/30", Icon: Clock },
  completed:         { label: "Released",         cls: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30", Icon: CheckCircle2 },
  released:          { label: "Released",         cls: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30", Icon: CheckCircle2 },
  refunded:          { label: "Refunded",         cls: "bg-slate-500/10 text-slate-300 border-slate-500/30",   Icon: RotateCcw },
  cancelled:         { label: "Cancelled",        cls: "bg-zinc-500/10 text-zinc-300 border-zinc-500/30",      Icon: Ban },
  draft:             { label: "Draft",            cls: "bg-zinc-500/10 text-zinc-400 border-dashed border-zinc-500/40", Icon: FileText },
  awaiting_payment:  { label: "Awaiting Payment", cls: "bg-amber-500/10 text-amber-300 border-amber-500/30",   Icon: Hourglass },
};

function buildFlagBadges(t: {
  riskLevel: string;
  flags?: string[] | null;
  transactionStatus?: { key: string } | null;
  moneyStatus?: { key: string } | null;
}) {
  const out: { key: string; label: string; cls: string; Icon?: typeof Flag }[] = [];
  if (t.riskLevel && t.riskLevel !== "clean" && FLAG_META[t.riskLevel]) {
    out.push({ key: t.riskLevel, ...FLAG_META[t.riskLevel] });
  }
  const seen = new Set(out.map((b) => b.key));
  for (const f of t.flags ?? []) {
    if (seen.has(f)) continue;
    if (f === "risk_flagged" && t.riskLevel !== "clean") continue;
    if (f === "admin_frozen" && seen.has("frozen")) continue;
    if (f === "frozen" && seen.has("admin_frozen")) continue;
    const meta = SECONDARY_FLAG_META[f];
    if (!meta) continue;
    out.push({ key: f, ...meta });
    seen.add(f);
  }
  if (out.length === 0) {
    const tk = t.transactionStatus?.key;
    const mk = t.moneyStatus?.key;
    const neutral =
      (tk && NEUTRAL_FLAG_META[tk]) ||
      (mk && NEUTRAL_FLAG_META[mk]) ||
      null;
    if (neutral) {
      out.push({ key: `lifecycle:${tk ?? mk}`, ...neutral });
    }
  }
  return out;
}

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

/**
 * Realtime tables watched by the transactions monitor.
 * Each entry carries a server-side `filter` so Postgres only forwards rows
 * that are actually actionable in the admin view — routine happy-path status
 * flips (payment_secured → seller_preparing_delivery, etc.) never touch the
 * browser at platform scale. Audit item #12.
 */
const REALTIME_SUBS: Array<{ table: string; filter?: string }> = [
  { table: "transactions", filter: "status=in.(disputed,cancelled,timed_out,refunded)" },
  { table: "disputes", filter: "status=in.(open,escalated,under_review)" },
  { table: "release_review_queue" },
  { table: "payouts", filter: "status=in.(failed,blocked,reversed)" },
];

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
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  // Hydrate initial state from URL so direct URLs / refresh / browser back restore filters.
  const initialSort = (() => {
    const raw = searchParams.get("sort");
    if (!raw) return { by: "urgency" as SortKey, dir: "desc" as SortDir };
    const [k, d] = raw.split(":");
    return { by: (k || "urgency") as SortKey, dir: ((d as SortDir) || "desc") };
  })();
  const [activeQuick, setActiveQuick] = useState<AdminTxQuickFilter>(((searchParams.get("quick") as AdminTxQuickFilter) || "all"));
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [debouncedSearch, setDebouncedSearch] = useState(searchParams.get("q") ?? "");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [page, setPage] = useState(Number(searchParams.get("page") ?? "1") || 1);
  const [txStatus, setTxStatus] = useState<string>(searchParams.get("txStatus") ?? "");
  const [moneyStatus, setMoneyStatus] = useState<string>(searchParams.get("moneyStatus") ?? "");
  const [disputeStatus, setDisputeStatus] = useState<string>(searchParams.get("disputeStatus") ?? "");
  const [riskLevel, setRiskLevel] = useState<string>(searchParams.get("risk") ?? "");
  const [amountMin, setAmountMin] = useState<string>(searchParams.get("amountMin") ?? "");
  const [amountMax, setAmountMax] = useState<string>(searchParams.get("amountMax") ?? "");
  const [dateFrom, setDateFrom] = useState<string>(searchParams.get("dateFrom") ?? "");
  const [dateTo, setDateTo] = useState<string>(searchParams.get("dateTo") ?? "");
  const [sortBy, setSortBy] = useState<SortKey>(initialSort.by);
  const [sortDir, setSortDir] = useState<SortDir>(initialSort.dir);

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

  // Admin row actions state
  const [actionRow, setActionRow] = useState<AdminTxRow | null>(null);
  const [actionKind, setActionKind] = useState<null | "freeze" | "unfreeze" | "flag" | "escalate" | "note">(null);
  const [drawerSection, setDrawerSection] = useState<null | "timeline" | "ledger" | "messages">(null);

  const closeAction = () => { setActionKind(null); };
  const closeDrawer = () => { setDrawerSection(null); };

  const buildHandlers = (row: AdminTxRow) => ({
    onView: () => goToDetail(row),
    onAddNote: () => { setActionRow(row); setActionKind("note"); },
    onMessages: () => { setActionRow(row); setDrawerSection("messages"); },
    onTimeline: () => { setActionRow(row); setDrawerSection("timeline"); },
    onLedger: () => { setActionRow(row); setDrawerSection("ledger"); },
    onFreeze: () => { setActionRow(row); setActionKind("freeze"); },
    onUnfreeze: () => { setActionRow(row); setActionKind("unfreeze"); },
    onFlagForReview: () => { setActionRow(row); setActionKind("flag"); },
    onEscalateDispute: () => { setActionRow(row); setActionKind("escalate"); },
  });

  const goToDetail = (row: AdminTxRow) => {
    navigate(`/admin/transactions/${row.transactionId}`, {
      state: {
        returnTo: `${location.pathname}${location.search}`,
        monitorRow: row,
      },
    });
  };

  const handleRowKeyDown = (e: React.KeyboardEvent, row: AdminTxRow) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      goToDetail(row);
    }
  };

  const runAction = async (kind: typeof actionKind, reason: string) => {
    if (!actionRow || !kind) return;
    try {
      if (kind === "note") await addInternalNote(actionRow.transactionId, reason);
      else if (kind === "freeze") await freezeTransaction(actionRow.transactionId, reason);
      else if (kind === "unfreeze") await unfreezeTransaction(actionRow.transactionId, reason);
      else if (kind === "flag") await flagForReview(actionRow.transactionId, reason);
      else if (kind === "escalate") await escalateDispute(actionRow.transactionId, reason);
      sonnerToast.success("Action completed", { description: `#${actionRow.transactionCode}` });
      fetchData();
    } catch (e) {
      sonnerToast.error("Action failed", {
        description: `#${actionRow.transactionCode}: ${(e as Error).message}`,
        action: { label: "Retry", onClick: () => void runAction(kind, reason) },
      });
      throw e;
    }
  };

  // Debounce search
  useEffect(() => {
    const h = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(h);
  }, [search]);

  // Mirror state into URL (replace so browser back stays clean)
  useEffect(() => {
    const next = new URLSearchParams();
    if (debouncedSearch) next.set("q", debouncedSearch);
    if (activeQuick && activeQuick !== "all") next.set("quick", activeQuick);
    if (page && page !== 1) next.set("page", String(page));
    if (txStatus) next.set("txStatus", txStatus);
    if (moneyStatus) next.set("moneyStatus", moneyStatus);
    if (disputeStatus) next.set("disputeStatus", disputeStatus);
    if (riskLevel) next.set("risk", riskLevel);
    if (amountMin) next.set("amountMin", amountMin);
    if (amountMax) next.set("amountMax", amountMax);
    if (dateFrom) next.set("dateFrom", dateFrom);
    if (dateTo) next.set("dateTo", dateTo);
    if (sortBy !== "urgency" || sortDir !== "desc") next.set("sort", `${sortBy}:${sortDir}`);
    setSearchParams(next, { replace: true });
  }, [debouncedSearch, activeQuick, page, txStatus, moneyStatus, disputeStatus, riskLevel, amountMin, amountMax, dateFrom, dateTo, sortBy, sortDir, setSearchParams]);

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
        const msg = (e as Error).message || "Failed to load Transaction Monitor";
        setError(msg);
        if (reqId > 1) {
          sonnerToast.error("Failed to refresh", {
            description: msg,
            action: { label: "Retry", onClick: () => void fetchData() },
          });
        }
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
    for (const sub of REALTIME_SUBS) {
      const cfg: Record<string, string> = { event: "*", schema: "public", table: sub.table };
      if (sub.filter) cfg.filter = sub.filter;
      channel.on(
        "postgres_changes" as any,
        cfg as any,
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
  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    setExporting(true);
    try {
      toast({ title: "Preparing export…", description: "Generating CSV in the background." });
      const params: Record<string, unknown> = {};
      if (debouncedSearch) params.search = debouncedSearch;
      if (txStatus) params.transactionStatus = txStatus;
      if (moneyStatus) params.moneyStatus = moneyStatus;
      if (disputeStatus) params.disputeStatus = disputeStatus;
      if (riskLevel) params.riskLevel = riskLevel;
      if (amountMin) params.amountMin = Number(amountMin);
      if (amountMax) params.amountMax = Number(amountMax);
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      if (activeQuick && activeQuick !== "all") params.quickFilter = activeQuick;
      const { url, job } = await runExport("transactions_monitor", params);
      const a = document.createElement("a");
      a.href = url;
      a.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      toast({ title: "Export ready", description: `${job.row_count?.toLocaleString() ?? 0} rows downloaded.` });
    } catch (e) {
      toast({ title: "Export failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

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

  const hasFilters = Boolean(
    txStatus || moneyStatus || disputeStatus || riskLevel || amountMin || amountMax || dateFrom || dateTo,
  );
  const emptyVariant = pickEmptyVariant({
    hasSearch: Boolean(debouncedSearch),
    hasFilters,
    quick: activeQuick,
  });
  const listDimmed = isFetching && !initialLoad;

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
        value: summary ? formatMoneyCompact(summary.totalAmount, summary.currency) : "—",
        exact: summary ? formatMoney(summary.totalAmount, summary.currency) : null,
        iconCls: "bg-emerald-500/15 text-emerald-400",
      },
      {
        key: "in_escrow", icon: Landmark, label: "In Escrow",
        value: summary ? formatMoneyCompact(summary.inEscrowAmount, summary.currency) : "—",
        exact: summary ? formatMoney(summary.inEscrowAmount, summary.currency) : null,
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
              <LiveSyncPill state={liveSync} />
            </div>
            <div className="flex items-center gap-2">
              <AdminReadingModeControl variant="desktop" />
              <ThemeToggle />
              <span className="hidden text-[11px] text-muted-foreground xl:inline">
                Updated {lastUpdatedLabel}
              </span>
              <button
                type="button"
                onClick={handleExport}
                disabled={exporting}
                aria-label="Export transactions"
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted/60 px-3.5 py-2 text-sm text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 disabled:opacity-60 min-h-11"
              >
                {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {exporting ? "Exporting…" : "Export"}
              </button>
              <button
                type="button"
                onClick={handleRefresh}
                disabled={isFetching}
                aria-label="Refresh transactions"
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-500 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 min-h-11"
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
              className="flex h-11 w-11 items-center justify-center rounded-lg bg-muted text-foreground/90 hover:bg-muted/70"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1 text-center">
              <div className="truncate text-sm font-semibold leading-tight text-foreground">Transaction Monitor</div>
              <div className="inline-flex items-center justify-center">
                <LiveSyncPill state={liveSync} compact />
              </div>
            </div>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isFetching}
              aria-label="Refresh"
              className="flex h-11 w-11 items-center justify-center rounded-lg bg-muted text-foreground/90 hover:bg-muted/70 disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            </button>
          </div>
        </header>
      )} className="min-h-11">
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
            className="rounded-md border border-red-500/40 px-3 py-1 text-xs font-medium hover:bg-red-500/15 min-h-11"
          >
            Retry
          </button>
        </div>
      )}

      {/* Summary KPI cards */}
      <TooltipProvider delayDuration={150}>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6 motion-reduce:[&>*]:!animate-none">
          {summaryTiles.map((t, i) => {
            const Icon = t.icon;
            const card = (
              <div
                key={t.key}
                className={`sd-fade-in-stagger sd-delay-${Math.min(i + 1, 6)} flex min-h-[104px] flex-col rounded-xl border border-border bg-card p-3.5 transition-all motion-safe:hover:-translate-y-px hover:border-foreground/10`}
              >
                <div className={`mb-2.5 flex h-8 w-8 items-center justify-center rounded-lg ${t.iconCls}`}>
                  <Icon className="h-4 w-4" aria-hidden />
                </div>
                <div className="text-[11px] text-muted-foreground">{t.label}</div>
                <div className="mt-1 truncate text-xl font-semibold tracking-tight text-foreground tabular-nums">
                  {initialLoad && !summary ? (
                    <span className="inline-block h-5 w-20 animate-pulse rounded bg-muted" />
                  ) : (
                    t.value
                  )}
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
      <div
        className="-mx-1 flex snap-x snap-mandatory items-center gap-2 overflow-x-auto px-1 pb-1 motion-safe:animate-fade-in [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label="Quick filters"
      >
        {QUICK_FILTERS.map((f) => {
          const active = activeQuick === f.key;
          return (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveQuick(f.key)}
              className={`shrink-0 snap-start rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${
                active
                  ? "border-blue-500/40 bg-blue-500/15 text-blue-300 min-h-11"
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
            {isFetching && search !== debouncedSearch && (
              <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>
          <SortMenu value={`${sortBy}:${sortDir}`} label={currentSortLabel} onChange={(k, d) => { setSortBy(k); setSortDir(d); }} />
          <button
            type="button"
            onClick={() => setMobileSheetOpen(true)}
            className="inline-flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/60 px-3 py-2 text-sm text-foreground hover:bg-muted lg:hidden min-h-11"
          >
            <span className="inline-flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4" /> Filters
            </span>
          </button>
        </div>

        <div className="mt-3 hidden grid-cols-1 gap-2 sm:grid-cols-2 lg:grid lg:grid-cols-4">
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
          <FilterSelect
            label="Risk Level"
            value={riskLevel}
            onChange={setRiskLevel}
            options={RISK_LEVEL_OPTIONS}
          />
          <div className="grid grid-cols-2 gap-2">
            <FilterInput label="Min ₦" type="number" value={amountMin} onChange={setAmountMin} />
            <FilterInput label="Max ₦" type="number" value={amountMax} onChange={setAmountMax} />
          </div>
          <FilterInput label="From" type="date" value={dateFrom} onChange={setDateFrom} />
          <FilterInput label="To" type="date" value={dateTo} onChange={setDateTo} />
          <div className="flex items-end sm:col-span-2 lg:col-span-1">
            <button
              type="button"
              onClick={clearAllFilters}
              className="rounded-lg border border-border bg-muted/60 px-3 py-2 text-sm text-foreground hover:bg-muted min-h-11"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-xl border border-border bg-card lg:block">
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
            <span>Updated {lastUpdatedLabel}</span>
            <LiveSyncPill state={liveSync} compact />
          </div>
        </div>
        <div
          className={`max-h-[calc(100vh-360px)] overflow-auto transition-opacity ${listDimmed ? "opacity-60 pointer-events-none" : ""}`}
          aria-busy={listDimmed || undefined}
        >
          <table className="w-full text-sm">
            <caption className="sr-only">Platform transactions, sortable and filterable</caption>
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 text-left font-semibold">Transaction</th>
                <th className="px-3 py-2 text-left font-semibold">Item</th>
                <th className="px-3 py-2 text-left font-semibold">Parties</th>
                <th className="px-3 py-2 text-left font-semibold">Amount</th>
                <th className="px-3 py-2 text-left font-semibold">Status</th>
                <th className="px-3 py-2 text-left font-semibold">Escrow</th>
                <th className="px-3 py-2 text-left font-semibold">Flags</th>
                <th className="px-3 py-2 text-left font-semibold">Last Activity</th>
                <th className="w-[120px] px-3 py-2 text-left font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {initialLoad && rows.length === 0 ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/60">
                    <td colSpan={9} className="px-3 py-3">
                      <div className="h-6 w-full animate-pulse rounded bg-muted/60" />
                    </td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-2">
                    <TransactionsEmptyState variant={emptyVariant} onClearFilters={clearAllFilters} />
                  </td>
                </tr>
              ) : (
                rows.map((t, i) => (
                  <tr
                    key={t.transactionId}
                    onClick={() => goToDetail(t)}
                    onKeyDown={(e) => handleRowKeyDown(e, t)}
                    tabIndex={0}
                    role="button"
                    aria-label={`Open transaction ${t.transactionCode}`}
                    className={`${initialLoad && i < 6 ? `sd-fade-in-stagger sd-delay-${Math.min(i + 1, 6)}` : ""} ${rowStateClass(t)} border-b border-border/60 transition-colors hover:bg-muted/60 active:bg-muted/80 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/50 motion-reduce:transition-none`}
                  >
                    <td className="px-3 py-2.5 align-middle">
                      <div className="flex items-center gap-2">
                        {t.isFrozen ? <Snowflake className="h-3.5 w-3.5 text-cyan-400" aria-hidden /> : null}
                        <div>
                          <div className="font-medium text-foreground">#{t.transactionCode}</div>
                          <div className="text-xs text-muted-foreground">{formatDate(t.createdAt)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 align-middle">
                      <div className="line-clamp-1 font-medium text-foreground" title={t.itemTitle}>{t.itemTitle}</div>
                      {t.itemCategory ? (
                        <div className="text-xs text-muted-foreground">{t.itemCategory}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 align-middle">
                      <div className="text-xs">
                        <span className="text-muted-foreground">Buyer:</span>{" "}
                        <span className="text-foreground">{t.buyerName}</span>
                      </div>
                      <div className="text-xs">
                        <span className="text-muted-foreground">Seller:</span>{" "}
                        <span className="text-foreground">{t.sellerName}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 align-middle">
                      <div className="font-semibold text-foreground tabular-nums">
                        {formatMoney(t.amount, t.currency)}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Protection Fee: {formatMoney(t.protectionFee, t.currency)}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 align-middle">
                      <Badge
                        label={t.transactionStatus.label}
                        cls={STATUS_BADGE_CLS[t.transactionStatus.key] ?? "bg-muted text-muted-foreground border-border"}
                      />
                      <div className="mt-1 text-[11px] text-muted-foreground">{t.moneyStatus.label}</div>
                    </td>
                    <td className="px-3 py-2.5 align-middle">
                      {t.escrowStatus.key === "pending" || t.escrowStatus.key === "released" ? (
                        <span className="text-[11px] text-muted-foreground">{t.escrowStatus.label}</span>
                      ) : (
                        <Badge
                          label={t.escrowStatus.label}
                          cls={ESCROW_BADGE_CLS[t.escrowStatus.key] ?? "bg-muted text-muted-foreground border-border"}
                        />
                      )}
                    </td>
                    <td className="px-3 py-2.5 align-middle">
                      {(() => {
                        const badges = buildFlagBadges(t);
                        if (badges.length === 0) {
                          return <span className="text-xs text-muted-foreground">—</span>;
                        }
                        const visible = badges.slice(0, 2);
                        const overflow = badges.slice(2);
                        return (
                          <div className="flex flex-wrap items-center gap-1">
                            {visible.map((b) => (
                              <Badge key={b.key} label={b.label} cls={b.cls} Icon={b.Icon} />
                            ))}
                            {overflow.length > 0 && (
                              <span
                                title={overflow.map((b) => b.label).join(", ")}
                                className="inline-flex items-center rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground"
                              >
                                +{overflow.length}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-2.5 align-middle">
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
                    <td className="w-[120px] px-3 py-2.5 align-middle">
                       <div
                         className="flex items-center justify-start gap-1 text-muted-foreground"
                         onClick={(e) => e.stopPropagation()}
                       >
                         <IconBtn label="View details" onClick={() => goToDetail(t)}>
                          <Eye className="h-4 w-4" />
                        </IconBtn>
                        <IconBtn label="Add internal note" onClick={() => { setActionRow(t); setActionKind("note"); }}>
                          <MessageSquare className="h-4 w-4" />
                        </IconBtn>
                        <RowActionsMenu row={t} handlers={buildHandlers(t)} />
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
      <div
        className={`space-y-2.5 lg:hidden transition-opacity ${listDimmed ? "opacity-60 pointer-events-none" : ""}`}
        aria-busy={listDimmed || undefined}
      >
        <div className="flex items-center justify-between px-1">
          <h3 className="text-sm font-semibold text-foreground">Recent Transactions</h3>
          {pagination ? (
            <span className="text-[11px] text-muted-foreground">
              {pagination.totalCount.toLocaleString("en-NG")} total
            </span>
          ) : null}
        </div>
        {initialLoad && rows.length === 0 ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl border border-border bg-card" />
          ))
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-border bg-card">
            <TransactionsEmptyState variant={emptyVariant} onClearFilters={clearAllFilters} />
          </div>
        ) : (
          rows.map((t, i) => (
            <article
              key={t.transactionId}
              onClick={() => goToDetail(t)}
              onKeyDown={(e) => handleRowKeyDown(e, t)}
              tabIndex={0}
              role="button"
              aria-label={`Open transaction ${t.transactionCode}`}
              className={`${initialLoad && i < 6 ? `sd-fade-in-stagger sd-delay-${Math.min(i + 1, 6)}` : ""} ${rowStateClass(t)} rounded-xl border border-border bg-card p-3 cursor-pointer transition-colors hover:bg-muted/30 active:scale-[0.998] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50`}
            >
              <header className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {t.isFrozen ? <Snowflake className="h-3.5 w-3.5 shrink-0 text-cyan-400" aria-hidden /> : null}
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

              <div className="mt-2 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-1 text-sm font-medium text-foreground" title={t.itemTitle}>{t.itemTitle}</div>
                  <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {t.buyerName} <span aria-hidden>•</span> {t.sellerName}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-base font-semibold text-foreground tabular-nums">
                    {formatMoney(t.amount, t.currency)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Protection {formatMoney(t.protectionFee, t.currency)}
                  </div>
                </div>
              </div>

              {(() => {
                const flagBadges = buildFlagBadges(t);
                const showEscrow = t.escrowStatus.key !== "pending" && t.escrowStatus.key !== "released";
                if (!showEscrow && flagBadges.length === 0) return null;
                const visible = flagBadges.slice(0, 2);
                const overflow = flagBadges.slice(2);
                return (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {showEscrow && (
                      <Badge
                        label={t.escrowStatus.label}
                        cls={ESCROW_BADGE_CLS[t.escrowStatus.key] ?? "bg-muted text-muted-foreground border-border"}
                      />
                    )}
                    {visible.map((b) => (
                      <Badge key={b.key} label={b.label} cls={b.cls} Icon={b.Icon} />
                    ))}
                    {overflow.length > 0 && (
                      <span
                        title={overflow.map((b) => b.label).join(", ")}
                        className="inline-flex items-center rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground"
                      >
                        +{overflow.length}
                      </span>
                    )}
                  </div>
                );
              })()}

              {(t.lastActivityTone === "warn" || t.lastActivityTone === "danger") && (
                <div
                  className={`mt-2 text-[11px] ${
                    t.lastActivityTone === "danger" ? "text-red-400" : "text-orange-300"
                  }`}
                >
                  {t.lastActivityLabel}
                </div>
              )}

              <div
                className="mt-2 flex items-center justify-end gap-1 border-t border-border/60 pt-2 text-muted-foreground"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); goToDetail(t); }}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/60 px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 min-h-11"
                  aria-label={`View details for ${t.transactionCode}`}
                >
                  <Eye className="h-3.5 w-3.5" aria-hidden /> View
                </button>
                <RowActionsMenu row={t} handlers={buildHandlers(t)} />
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
      {/* Mobile spacer to keep last content above fixed bottom nav */}
      <div className="h-20 lg:hidden" aria-hidden />

      {/* Mobile filters sheet */}
      <Sheet open={mobileSheetOpen} onOpenChange={setMobileSheetOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto bg-card">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
          </SheetHeader>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FilterSelect label="Transaction Status" value={txStatus} onChange={setTxStatus} options={TX_STATUS_OPTIONS} />
            <FilterSelect label="Money Status" value={moneyStatus} onChange={setMoneyStatus} options={MONEY_STATUS_OPTIONS} />
            <FilterSelect label="Dispute Status" value={disputeStatus} onChange={setDisputeStatus} options={DISPUTE_STATUS_OPTIONS} />
            <FilterSelect label="Risk Level" value={riskLevel} onChange={setRiskLevel} options={RISK_LEVEL_OPTIONS} />
            <FilterInput label="Min ₦" type="number" value={amountMin} onChange={setAmountMin} />
            <FilterInput label="Max ₦" type="number" value={amountMax} onChange={setAmountMax} />
            <FilterInput label="From" type="date" value={dateFrom} onChange={setDateFrom} />
            <FilterInput label="To" type="date" value={dateTo} onChange={setDateTo} />
          </div>
          <SheetFooter className="mt-4 flex flex-row gap-2 sm:justify-between">
            <button
              type="button"
              onClick={clearAllFilters}
              className="flex-1 rounded-lg border border-border bg-muted/60 px-3 py-2 text-sm text-foreground hover:bg-muted min-h-11"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setMobileSheetOpen(false)}
              className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 min-h-11"
            >
              Apply
            </button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Admin action dialogs */}
      {actionRow && (
        <>
          <InternalNoteDialog
            open={actionKind === "note"}
            onOpenChange={(o) => !o && closeAction()}
            transactionCode={actionRow.transactionCode}
            onSubmit={(payload) => runAction("note", payload.note)}
          />
          <ActionConfirmDialog
            open={actionKind === "freeze"}
            onOpenChange={(o) => !o && closeAction()}
            title="Freeze transaction"
            description={`Funds for #${actionRow.transactionCode} will be moved to the frozen pool. No money is released or refunded.`}
            confirmLabel="Freeze transaction"
            confirmTone="danger"
            typeToConfirm="FREEZE"
            reasonPlaceholder="Why is this transaction being frozen?"
            onConfirm={(r) => runAction("freeze", r)}
          />
          <ActionConfirmDialog
            open={actionKind === "unfreeze"}
            onOpenChange={(o) => !o && closeAction()}
            title="Unfreeze transaction"
            description={`Funds for #${actionRow.transactionCode} will return to held escrow.`}
            confirmLabel="Unfreeze transaction"
            reasonPlaceholder="Why is this transaction being unfrozen?"
            onConfirm={(r) => runAction("unfreeze", r)}
          />
          <ActionConfirmDialog
            open={actionKind === "flag"}
            onOpenChange={(o) => !o && closeAction()}
            title="Flag for review"
            description={`Adds #${actionRow.transactionCode} to the release review queue.`}
            confirmLabel="Flag for review"
            reasonPlaceholder="Reason for flagging…"
            onConfirm={(r) => runAction("flag", r)}
          />
          <ActionConfirmDialog
            open={actionKind === "escalate"}
            onOpenChange={(o) => !o && closeAction()}
            title="Escalate dispute"
            description={`Marks the active dispute on #${actionRow.transactionCode} as under admin review.`}
            confirmLabel="Escalate dispute"
            confirmTone="danger"
            reasonPlaceholder="Reason for escalation…"
            onConfirm={(r) => runAction("escalate", r)}
          />
          <DetailDrawer
            open={drawerSection !== null}
            onOpenChange={(o) => !o && closeDrawer()}
            transactionId={actionRow.transactionId}
            transactionCode={actionRow.transactionCode}
            section={drawerSection ?? "timeline"}
          />
        </>
      )}
    </AdminLayout>
  );
}

/* ---------------- Subcomponents ---------------- */

function IconBtn({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label: string }) {
  return (
    <TooltipProvider delayDuration={200}>
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={(e) => { e.stopPropagation(); onClick(); }}
          className="rounded-md p-1.5 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 motion-reduce:transition-none min-h-11"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
    </TooltipProvider>
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
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={`relative flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${
        active ? "text-blue-400 min-h-11" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="h-5 w-5" aria-hidden />
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
          className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/60 px-2.5 py-1 text-foreground transition-colors hover:bg-muted disabled:opacity-50 min-h-11"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Prev
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!hasNext}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/60 px-2.5 py-1 text-foreground transition-colors hover:bg-muted disabled:opacity-50 min-h-11"
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
      className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/40 min-h-11"
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
        className="rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/40 min-h-11"
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

function SortMenu({
  value,
  label,
  onChange,
}: {
  value: string;
  label: string;
  onChange: (key: SortKey, dir: SortDir) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/60 px-3 py-2 text-sm text-foreground hover:bg-muted min-h-11"
        >
          <span className="inline-flex items-center gap-2">
            <ArrowUpDown className="h-4 w-4" />
            <span className="hidden sm:inline">Sort:</span> <span className="truncate max-w-[140px]">{label}</span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Sort transactions</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {SORT_OPTIONS.map((opt) => {
          const key = `${opt.key}:${opt.dir}`;
          return (
            <DropdownMenuItem
              key={key}
              onSelect={() => onChange(opt.key, opt.dir)}
              className={value === key ? "bg-muted" : ""}
            >
              {opt.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function LiveSyncPill({ state, compact = false }: { state: "connecting" | "live" | "off"; compact?: boolean }) {
  const conf =
    state === "live"
      ? { dot: "bg-emerald-400", border: "border-emerald-500/30", bg: "bg-emerald-500/10", text: "text-emerald-400", label: "Live sync", pulse: true }
      : state === "connecting"
      ? { dot: "bg-amber-400", border: "border-amber-500/30", bg: "bg-amber-500/10", text: "text-amber-400", label: "Connecting…", pulse: true }
      : { dot: "bg-muted-foreground", border: "border-border", bg: "bg-muted/40", text: "text-muted-foreground", label: "Offline", pulse: false };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border ${conf.border} ${conf.bg} ${compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-0.5 text-[11px]"} font-medium ${conf.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${conf.dot} ${conf.pulse ? "animate-pulse" : ""}`} />
      {conf.label}
    </span>
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
        className="rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/40 min-h-11"
      />
    </label>
  );
}
