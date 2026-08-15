import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  RefreshCw,
  Download,
  Search,
  Scale,
  Clock,
  AlertTriangle,
  Check,
  Flag,
  Loader2,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  Activity,
  Menu,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/hooks/use-toast";
import { formatMoney } from "@/lib/format";
import { deriveDisputeDisplay } from "@/lib/dispute-display-status";
import {
  AdminAccessRequiredError,
  exportAdminDisputesQueue,
  getAdminDisputesQueue,
  resolveDispute,
  disputeRequestMoreInfo,
  type DisputeQueueParams,
  type DisputeQueueQuick,
  type DisputeQueueResponse,
  type DisputeQueueRow,
} from "@/services/admin-disputes.service";
import { ResolveDisputeDialog } from "@/components/admin/transactions/ResolveDisputeDialog";
import { keyActivate } from "@/lib/a11y";

/* ---------- visual helpers ---------- */

const PRIORITY_DOT: Record<DisputeQueueRow["priority"], string> = {
  overdue: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-yellow-400",
  low: "bg-emerald-500",
  resolved: "bg-emerald-500",
};

const PRIORITY_TEXT: Record<DisputeQueueRow["priority"], string> = {
  overdue: "text-red-400",
  high: "text-orange-400",
  medium: "text-yellow-300",
  low: "text-emerald-400",
  resolved: "text-emerald-400",
};

const PRIORITY_ACCENT: Record<DisputeQueueRow["priority"], string> = {
  overdue: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-yellow-400",
  low: "bg-emerald-500",
  resolved: "bg-emerald-500",
};

const QUICK_FILTERS: { id: DisputeQueueQuick; label: string }[] = [
  { id: "all", label: "All" },
  { id: "overdue", label: "Overdue" },
  { id: "open", label: "Open" },
  { id: "awaiting_seller", label: "Awaiting Seller" },
  { id: "under_review", label: "Under Review" },
  { id: "escalated", label: "Escalated" },
  { id: "resolved", label: "Resolved" },
];

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function humanizeSla(sla: DisputeQueueRow["sla"]): { label: string; sub: string; tone: string } {
  if (sla.resolved_at_iso) {
    return { label: `Resolved ${timeAgo(sla.resolved_at_iso)}`, sub: "", tone: "text-emerald-400" };
  }
  if (sla.overdue_by_minutes != null) {
    const m = sla.overdue_by_minutes;
    const txt = m >= 1440 ? `${Math.floor(m / 1440)} days overdue` : m >= 60 ? `${Math.floor(m / 60)} hours overdue` : `${m} min overdue`;
    const due = sla.due_at_iso ? new Date(sla.due_at_iso) : null;
    return { label: txt, sub: due ? `Due: ${due.toLocaleString("en-NG", { timeZone: "Africa/Lagos", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : "", tone: "text-red-400" };
  }
  if (sla.due_in_minutes != null) {
    const m = sla.due_in_minutes;
    const txt = m >= 1440 ? `Due in ${Math.floor(m / 1440)} days` : m >= 60 ? `Due in ${Math.floor(m / 60)} hours` : `Due in ${m} min`;
    const due = sla.due_at_iso ? new Date(sla.due_at_iso) : null;
    const tone = m < 240 ? "text-orange-400" : "text-muted-foreground";
    return { label: txt, sub: due ? `Due: ${due.toLocaleString("en-NG", { timeZone: "Africa/Lagos", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : "", tone };
  }
  return { label: "—", sub: "", tone: "text-muted-foreground" };
}

function statusDisplay(row: DisputeQueueRow): { label: string; tone: string } {
  if (row.dispute_status === "resolved") {
    const derived = deriveDisputeDisplay({
      disputeStatus: "resolved",
      outcome: row.outcome ? { outcome_type: row.outcome.type, refund_amount: row.outcome.refund_amount, release_amount: row.outcome.release_amount } : null,
      moneyStatus: row.money_status,
    });
    if (derived) {
      const tone =
        derived.tone === "success" ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" :
        derived.tone === "warning" ? "bg-orange-500/15 text-orange-300 border-orange-500/30" :
        derived.tone === "danger" ? "bg-red-500/15 text-red-300 border-red-500/30" :
        derived.tone === "info" ? "bg-blue-500/15 text-blue-300 border-blue-500/30" :
        "bg-muted text-muted-foreground border-border";
      return { label: derived.label, tone };
    }
  }
  const map: Record<string, { label: string; tone: string }> = {
    open: { label: "Open", tone: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
    seller_response_pending: { label: "Awaiting Seller", tone: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30" },
    under_review: { label: "Under Review", tone: "bg-purple-500/15 text-purple-300 border-purple-500/30" },
    resolved: { label: "Resolved", tone: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  };
  return map[row.dispute_status] ?? { label: row.dispute_status, tone: "bg-muted text-muted-foreground border-border" };
}

const MONEY_STATUS_LABEL: Record<string, string> = {
  not_secured: "Not Secured",
  payment_pending: "Payment Pending",
  funds_held_in_escrow: "Held in Escrow",
  funds_frozen: "Funds Frozen",
  funds_pending_release: "Awaiting Release",
  funds_releasing: "Release Processing",
  funds_released: "Released",
  refund_pending: "Refund Pending",
  refund_issued: "Refunded",
};

function formatMoneyStatus(raw: string | null | undefined): string {
  if (!raw) return "";
  if (MONEY_STATUS_LABEL[raw]) return MONEY_STATUS_LABEL[raw];
  return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("") || "?";
}

/* ---------- KPI strip ---------- */

interface KpiCardDef {
  id: DisputeQueueQuick;
  label: string;
  count: number;
  sub: string;
  Icon: typeof Scale;
  tone: string;
  subTone?: string;
}

function KpiStrip({
  data, active, onClick, dueTodayCount, assignedToMeCount,
}: {
  data: DisputeQueueResponse | null;
  active: DisputeQueueQuick;
  onClick: (q: DisputeQueueQuick) => void;
  dueTodayCount: number;
  assignedToMeCount: number;
}) {
  const k = data?.kpis;
  const cards: KpiCardDef[] = [
    { id: "open", label: "Open Disputes", count: k?.open_disputes ?? 0, sub: k ? `${k.deltas.open_vs_yesterday >= 0 ? "+" : ""}${k.deltas.open_vs_yesterday} from yesterday` : "", Icon: Scale, tone: "text-orange-300 bg-orange-500/10 border-orange-500/30", subTone: "text-muted-foreground" },
    { id: "awaiting_seller", label: "Awaiting Seller Response", count: k?.awaiting_seller ?? 0, sub: `${dueTodayCount} due today`, Icon: Clock, tone: "text-yellow-300 bg-yellow-500/10 border-yellow-500/30", subTone: "text-muted-foreground" },
    { id: "under_review", label: "Under Review", count: k?.under_review ?? 0, sub: `${assignedToMeCount} assigned to you`, Icon: Search, tone: "text-blue-300 bg-blue-500/10 border-blue-500/30", subTone: "text-muted-foreground" },
    { id: "overdue", label: "Overdue Cases", count: k?.overdue ?? 0, sub: "Immediate attention", Icon: AlertTriangle, tone: "text-red-300 bg-red-500/10 border-red-500/30", subTone: "text-red-400" },
    { id: "resolved", label: "Resolved Today", count: k?.resolved_today ?? 0, sub: k ? `+${k.deltas.resolved_vs_target} from target` : "", Icon: Check, tone: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30", subTone: "text-emerald-400" },
    { id: "escalated", label: "Escalated Cases", count: k?.escalated ?? 0, sub: "Senior review", Icon: Flag, tone: "text-purple-300 bg-purple-500/10 border-purple-500/30", subTone: "text-muted-foreground" },
  ];
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      {cards.map((c) => {
        const isActive = active === c.id;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onClick(c.id)}
            className={`group rounded-xl border bg-card p-4 text-left transition-colors hover:border-blue-500/40 ${
              isActive ? "border-blue-500/50 ring-1 ring-blue-500/30" : "border-border"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className={`inline-flex h-10 w-10 items-center justify-center rounded-lg border ${c.tone}`}>
                <c.Icon className="h-5 w-5" />
              </div>
              <div className="text-2xl font-bold text-foreground leading-none">{c.count}</div>
            </div>
            <div className="mt-3 text-sm font-medium text-foreground/90">{c.label}</div>
            {c.sub && <div className={`mt-0.5 truncate text-xs ${c.subTone ?? "text-muted-foreground"}`}>{c.sub}</div>}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Page ---------- */

export default function AdminDisputes() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const params: DisputeQueueParams = useMemo(() => ({
    quick: (searchParams.get("quick") as DisputeQueueQuick) || "open",
    q: searchParams.get("q") || undefined,
    reason: searchParams.get("reason") || undefined,
    priority: searchParams.get("priority") || undefined,
    money_status: searchParams.get("money_status") || undefined,
    page: Number(searchParams.get("page") || 1),
    page_size: 25,
  }), [searchParams]);

  const [data, setData] = useState<DisputeQueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<number | null>(null);
  const [searchInput, setSearchInput] = useState(params.q ?? "");
  const [resolveTarget, setResolveTarget] = useState<DisputeQueueRow | null>(null);
  const [_, force] = useState(0);

  const reqIdRef = useRef(0);

  const load = useCallback(async () => {
    const id = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await getAdminDisputesQueue(params);
      if (reqIdRef.current !== id) return;
      setData(res);
      setLastFetch(Date.now());
    } catch (e) {
      if (e instanceof AdminAccessRequiredError) {
        setError("Admin access required.");
      } else {
        setError((e as Error).message || "Unable to load dispute queue.");
      }
    } finally {
      if (reqIdRef.current === id) setLoading(false);
    }
  }, [params]);

  useEffect(() => { void load(); }, [load]);

  // Auto-refresh every 30s when tab visible
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 30000);
    return () => clearInterval(t);
  }, [load]);

  // Tick every 15s to refresh "X ago" label
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 15000);
    return () => clearInterval(t);
  }, []);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (!value) next.delete(key); else next.set(key, value);
    if (key !== "page") next.delete("page");
    setSearchParams(next, { replace: true });
  };

  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setParam("q", searchInput.trim() || null);
  };

  const onExport = async () => {
    try {
      const blob = await exportAdminDisputesQueue(params);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `disputes-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({ title: "Export failed", description: (e as Error).message, variant: "destructive" });
    }
  };

  const goRow = (row: DisputeQueueRow, tab: "dispute" | "resolution" = "dispute") => {
    navigate(`/admin/transactions/${row.transaction_id}?tab=${tab}&disputeId=${row.dispute_id}`);
  };

  const onResolveSubmit = async (payload: Parameters<React.ComponentProps<typeof ResolveDisputeDialog>["onResolve"]>[0]) => {
    if (!resolveTarget) return;
    try {
      await resolveDispute(resolveTarget.transaction_id, payload);
      toast({ title: "Dispute resolved" });
      setResolveTarget(null);
      void load();
    } catch (e) {
      toast({ title: "Resolve failed", description: (e as Error).message, variant: "destructive" });
    }
  };

  const onMoreInfoSubmit = async (payload: Parameters<React.ComponentProps<typeof ResolveDisputeDialog>["onRequestMoreInfo"]>[0]) => {
    if (!resolveTarget) return;
    try {
      await disputeRequestMoreInfo(resolveTarget.transaction_id, payload);
      toast({ title: "Request sent to seller" });
      setResolveTarget(null);
      void load();
    } catch (e) {
      toast({ title: "Request failed", description: (e as Error).message, variant: "destructive" });
    }
  };

  const liveFresh = lastFetch != null && Date.now() - lastFetch < 60000;
  const quick = (params.quick ?? "open") as DisputeQueueQuick;
  const rows = data?.rows ?? [];

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

  const todayLagos = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
  const dueTodayCount = rows.filter(
    (r) =>
      r.dispute_status === "seller_response_pending" &&
      r.sla.due_at_iso &&
      new Date(r.sla.due_at_iso).toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" }) === todayLagos,
  ).length;
  const assignedToMeCount = rows.filter(
    (r) => r.dispute_status === "under_review" && r.agent?.user_id === currentUserId,
  ).length;

  return (
    <AdminLayout
      title="Dispute Resolution Queue"
      subtitle="Live dispute triage and case management"
      hideDefaultHeaders
      fullBleed
      headerSlot={({ onOpenMenu }) => (
        <header className="sticky top-0 z-sticky border-b border-border bg-card px-4 py-4 sm:px-6 lg:px-8 lg:py-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-2 min-w-0">
              <button
                type="button"
                onClick={onOpenMenu}
                aria-label="Open navigation menu"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40 text-foreground hover:bg-muted lg:hidden"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Dispute Resolution Queue</h1>
                <p className="text-xs sm:text-sm text-muted-foreground">Live dispute triage and case management</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void load()}
                className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs transition-colors hover:border-blue-500/40 min-h-11"
                aria-live="polite"
                title="Refresh"
              >
                <span className={`h-2 w-2 rounded-full ${liveFresh ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"}`} />
                <span className="text-muted-foreground">Live sync</span>
                <RefreshCw className={`h-3 w-3 text-muted-foreground ${loading ? "animate-spin" : ""}`} />
              </button>
              <Button variant="outline" size="sm" onClick={onExport}>
                <Download className="mr-2 h-4 w-4" /> Export
              </Button>
            </div>
          </div>
        </header>
      )}>
      <TooltipProvider delayDuration={200}>
        <div className="w-full min-w-0">
        <div className="w-full max-w-none px-6 py-8 lg:px-8 space-y-5">
          {/* KPI strip */}
          <KpiStrip
            data={data}
            active={quick}
            onClick={(q) => setParam("quick", q)}
            dueTodayCount={dueTodayCount}
            assignedToMeCount={assignedToMeCount}
          />

          {/* Queue Filters */}
          <section className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-base font-semibold text-foreground">Queue Filters</h2>
                <div className="flex flex-wrap items-center gap-2">
                  {QUICK_FILTERS.map((f) => {
                    const isActive = quick === f.id;
                    const count =
                      f.id === "all" ? data?.kpis.all_total :
                      f.id === "overdue" ? data?.kpis.overdue :
                      f.id === "open" ? data?.kpis.open_disputes :
                      f.id === "awaiting_seller" ? data?.kpis.awaiting_seller :
                      f.id === "under_review" ? data?.kpis.under_review :
                      f.id === "escalated" ? data?.kpis.escalated :
                      f.id === "resolved" ? data?.kpis.resolved_total :
                      undefined;
                    const baseInactive = "border border-border bg-muted/40 text-foreground/80 hover:bg-muted hover:text-foreground";
                    const baseActive =
                      f.id === "overdue" ? "border border-red-500/50 bg-red-500/20 text-red-200" :
                      f.id === "open" ? "border border-orange-500/50 bg-orange-500/20 text-orange-200" :
                      f.id === "awaiting_seller" ? "border border-yellow-500/50 bg-yellow-500/20 text-yellow-200" :
                      f.id === "under_review" ? "border border-blue-500/50 bg-blue-500/20 text-blue-200" :
                      f.id === "escalated" ? "border border-purple-500/50 bg-purple-500/20 text-purple-200" :
                      f.id === "resolved" ? "border border-emerald-500/50 bg-emerald-500/20 text-emerald-200" :
                      "border border-border bg-foreground/10 text-foreground";
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setParam("quick", f.id)}
                        className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                          isActive ? baseActive : baseInactive
                        } min-h-11`}
                      >
                        {f.id === "overdue" && <AlertTriangle className="h-3 w-3" />}
                        <span>{f.label}{count != null ? ` (${count})` : ""}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {(params.q || params.reason || params.agent || params.amount_bucket) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground"
                    onClick={() => {
                      const next = new URLSearchParams(searchParams);
                      next.delete("q");
                      next.delete("reason");
                      next.delete("agent");
                      next.delete("amount_bucket");
                      next.delete("page");
                      setSearchInput("");
                      setSearchParams(next, { replace: true });
                    }}
                  >
                    Clear filters
                  </Button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
              <form onSubmit={onSearchSubmit} className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search disputes, transactions, users…"
                  className="h-11 pl-9 focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/60 focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-0 focus-visible:border-blue-500/60"
                />
              </form>
              <select
                value={params.reason ?? ""}
                onChange={(e) => setParam("reason", e.target.value || null)}
                className="appearance-none w-full h-11 rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus-visible:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/60 focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-0"
              >
                <option value="">All Dispute Reasons</option>
                {(data?.filters?.reasons ?? []).map((r) => (
                  <option key={r} value={r}>{r.replace(/_/g, " ")}</option>
                ))}
              </select>
              <select
                value={params.agent ?? ""}
                onChange={(e) => setParam("agent", e.target.value || null)}
                className="appearance-none w-full h-11 rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus-visible:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/60 focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-0"
              >
                <option value="">All Agents</option>
                {(data?.filters?.agents ?? []).map((a) => (
                  <option key={a.user_id} value={a.user_id}>{a.name}</option>
                ))}
              </select>
              <select
                value={params.amount_bucket ?? ""}
                onChange={(e) => setParam("amount_bucket", e.target.value || null)}
                className="appearance-none w-full h-11 rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus-visible:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/60 focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-0"
              >
                <option value="">All Amount Ranges</option>
                <option value="lt_100k">Under ₦100,000</option>
                <option value="100k_1m">₦100,000 – ₦1,000,000</option>
                <option value="1m_5m">₦1,000,000 – ₦5,000,000</option>
                <option value="gt_5m">Over ₦5,000,000</option>
              </select>
            </div>
          </section>

          {/* Table / cards */}
          <section className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h2 className="text-base font-semibold text-foreground">Active Dispute Queue</h2>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Last updated: {lastFetch ? timeAgo(new Date(lastFetch).toISOString()) : "—"}</span>
                <button type="button" onClick={() => void load()} className="rounded-md p-1 hover:bg-muted min-h-11">
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                </button>
              </div>
            </div>
            {loading && !data ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-16 animate-pulse rounded-lg bg-muted/40" />
                ))}
              </div>
            ) : error ? (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <AlertTriangle className="h-8 w-8 text-red-400" />
                <div className="text-sm text-foreground">Unable to load dispute queue. Try again.</div>
                <Button size="sm" variant="outline" onClick={() => void load()}>Retry</Button>
              </div>
            ) : rows.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">No disputes match these filters.</div>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden xl:block w-full">
                  <table className="w-full table-fixed text-sm">
                    <colgroup>
                      <col style={{ width: "10%" }} />
                      <col style={{ width: "19%" }} />
                      <col style={{ width: "18%" }} />
                      <col style={{ width: "12%" }} />
                      <col style={{ width: "13%" }} />
                      <col style={{ width: "12%" }} />
                      <col style={{ width: "120px" }} />
                      <col style={{ width: "200px" }} />
                    </colgroup>
                    <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                      <tr>
                        <th className="px-6 py-4 text-left">Priority</th>
                        <th className="px-6 py-4 text-left">Dispute</th>
                        <th className="px-6 py-4 text-left">Parties</th>
                        <th className="px-6 py-4 text-left">Amount</th>
                        <th className="px-6 py-4 text-left">Status</th>
                        <th className="px-6 py-4 text-left">SLA</th>
                        <th className="px-4 py-4 text-left">Agent</th>
                        <th className="px-4 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => {
                        const sd = statusDisplay(row);
                        const sla = humanizeSla(row.sla);
                        const isResolved = row.dispute_status === "resolved";
                        return (
                          <tr role="button" tabIndex={0} onKeyDown={keyActivate}
                            key={row.dispute_id}
                            onClick={() => goRow(row, isResolved ? "resolution" : "dispute")}
                            className="cursor-pointer border-t border-border transition-colors hover:bg-muted/40"
                          >
                            <td className="relative px-6 py-4 pl-6">
                              <span className={`absolute left-0 top-0 h-full w-1 ${PRIORITY_ACCENT[row.priority]}`} />
                              <div className="flex items-center gap-2">
                                <span className={`h-2 w-2 rounded-full ${PRIORITY_DOT[row.priority]} ${row.priority === "overdue" ? "animate-pulse" : ""}`} />
                                <span className={`text-xs font-bold uppercase tracking-wide ${PRIORITY_TEXT[row.priority]}`}>
                                  {row.priority}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); navigate(`/admin/disputes/${row.dispute_id}`); }}
                                className="block max-w-full truncate text-sm font-semibold text-blue-300 hover:underline min-h-11"
                              >
                                #{row.dispute_code}
                              </button>
                              <div className="truncate text-xs text-foreground/80">{row.item_title}</div>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); navigate(`/admin/transactions/${row.transaction_id}`); }}
                                className="block max-w-full truncate text-xs text-muted-foreground hover:text-foreground min-h-11"
                              >
                                {row.transaction_code}
                              </button>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <Avatar name={row.parties.buyer.name} url={row.parties.buyer.avatar_url} />
                                <div className="min-w-0">
                                  <div className="truncate text-xs text-foreground">{row.parties.buyer.name}</div>
                                  <div className="text-xs text-muted-foreground">Buyer</div>
                                </div>
                              </div>
                              <div className="mt-1 flex items-center gap-2">
                                <Avatar name={row.parties.seller.store_name || row.parties.seller.name} url={row.parties.seller.avatar_url} />
                                <div className="min-w-0">
                                  <div className="truncate text-xs text-foreground">{row.parties.seller.store_name || row.parties.seller.name}</div>
                                  <div className="text-xs text-muted-foreground">Seller</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="whitespace-nowrap font-semibold text-foreground">{formatMoney(row.amount, row.currency)}</div>
                              <div className="text-xs text-muted-foreground">{row.reason_label}</div>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold ${sd.tone}`}>
                                {sd.label}
                              </span>
                              {row.money_status && (
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {formatMoneyStatus(row.money_status)}
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <div className={`whitespace-nowrap text-xs font-medium ${sla.tone}`}>{sla.label}</div>
                              {sla.sub && <div className="text-xs text-muted-foreground">{sla.sub}</div>}
                            </td>
                            <td className="px-4 py-4">
                              {row.agent ? (
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="shrink-0"><Avatar name={row.agent.name} url={row.agent.avatar_url} /></div>
                                  <span className="truncate text-xs">{row.agent.name}</span>
                                </div>
                              ) : (
                                <span className="rounded-md border border-border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground">Unassigned</span>
                              )}
                            </td>
                            <td role="button" tabIndex={0} onKeyDown={keyActivate} className="px-4 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => goRow(row, isResolved ? "resolution" : "dispute")}
                                  className={`h-11 whitespace-nowrap rounded-lg px-4 text-sm font-semibold ${isResolved ? "bg-emerald-600 text-white hover:bg-emerald-500" : "bg-orange-600 text-white hover:bg-orange-500"}`}
                                >
                                  {isResolved ? "View Resolution" : "Review"}
                                </Button>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button size="icon" variant="ghost" className="h-11 w-11 shrink-0" onClick={(e) => e.stopPropagation()}>
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-52">
                                    <DropdownMenuItem onClick={() => goRow(row, isResolved ? "resolution" : "dispute")}>Open detail</DropdownMenuItem>
                                    {!isResolved && (
                                      <DropdownMenuItem onClick={() => setResolveTarget(row)}>Resolve dispute</DropdownMenuItem>
                                    )}
                                    {!isResolved && (
                                      <DropdownMenuItem onClick={() => setResolveTarget(row)}>Request more info</DropdownMenuItem>
                                    )}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => navigate(`/admin/transactions/${row.transaction_id}?tab=notes`)}>Add internal note</DropdownMenuItem>
                                    <DropdownMenuItem onClick={onExport}>Export data</DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 xl:hidden">
                  {rows.map((row) => {
                    const sd = statusDisplay(row);
                    const sla = humanizeSla(row.sla);
                    const isResolved = row.dispute_status === "resolved";
                    return (
                      <div key={row.dispute_id} className="relative overflow-hidden rounded-lg border border-border bg-background p-3">
                        <span className={`absolute left-0 top-0 h-full w-1 ${PRIORITY_ACCENT[row.priority]}`} />
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 pl-2">
                            <div className="flex items-center gap-2">
                              <span className={`h-2 w-2 rounded-full ${PRIORITY_DOT[row.priority]}`} />
                              <span className={`text-xs font-bold uppercase ${PRIORITY_TEXT[row.priority]}`}>{row.priority}</span>
                            </div>
                            <button onClick={() => navigate(`/admin/disputes/${row.dispute_id}`)} className="mt-1 text-sm font-semibold text-blue-300 hover:underline min-h-11 inline-flex items-center">
                              #{row.dispute_code}
                            </button>
                            <div className="truncate text-xs text-foreground">{row.item_title}</div>
                            <button onClick={() => navigate(`/admin/transactions/${row.transaction_id}`)} className="text-xs text-muted-foreground hover:text-foreground min-h-11 inline-flex items-center">{row.transaction_code}</button>
                          </div>
                          <span className={`shrink-0 rounded-md border px-2 py-0.5 text-xs font-semibold ${sd.tone}`}>{sd.label}</span>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs pl-2">
                          <div>
                            <div className="text-muted-foreground text-xs">Buyer</div>
                            <div className="truncate">{row.parties.buyer.name}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground text-xs">Seller</div>
                            <div className="truncate">{row.parties.seller.store_name || row.parties.seller.name}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground text-xs">Amount</div>
                            <div className="font-semibold">{formatMoney(row.amount, row.currency)}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground text-xs">Reason</div>
                            <div className="truncate">{row.reason_label}</div>
                          </div>
                          <div className="col-span-2">
                            <div className="text-muted-foreground text-xs">SLA</div>
                            <div className={sla.tone}>{sla.label}</div>
                            {sla.sub && <div className="text-xs text-muted-foreground">{sla.sub}</div>}
                          </div>
                        </div>
                        <div className="mt-3 flex items-center justify-between pl-2">
                          <span className="text-xs text-muted-foreground">{row.agent?.name ?? "Unassigned"}</span>
                          <div className="flex items-center gap-1">
                            <Button size="sm" className={isResolved ? "bg-emerald-600 text-white hover:bg-emerald-500" : "bg-orange-600 text-white hover:bg-orange-500"} onClick={() => goRow(row, isResolved ? "resolution" : "dispute")}>
                              {isResolved ? "View Resolution" : "Review"}
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="icon" variant="ghost" className="h-8 w-8 relative before:absolute before:-inset-2 before:content-['']"><MoreHorizontal className="h-4 w-4" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-52">
                                <DropdownMenuItem onClick={() => goRow(row, isResolved ? "resolution" : "dispute")}>Open detail</DropdownMenuItem>
                                {!isResolved && <DropdownMenuItem onClick={() => setResolveTarget(row)}>Resolve dispute</DropdownMenuItem>}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Pagination */}
                {data && data.pagination.total > data.pagination.page_size && (
                  <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted-foreground">
                    <div>
                      Page {data.pagination.page} of {Math.max(1, Math.ceil(data.pagination.total / data.pagination.page_size))} · {data.pagination.total} disputes
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="outline" className="h-8 w-8 relative before:absolute before:-inset-2 before:content-['']" disabled={data.pagination.page <= 1} onClick={() => setParam("page", String(data.pagination.page - 1))}>
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="outline" className="h-8 w-8 relative before:absolute before:-inset-2 before:content-['']"
                        disabled={data.pagination.page * data.pagination.page_size >= data.pagination.total}
                        onClick={() => setParam("page", String(data.pagination.page + 1))}>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
        </div>
      </TooltipProvider>

      {resolveTarget && (
        <ResolveDisputeDialog
          open={!!resolveTarget}
          onOpenChange={(v) => !v && setResolveTarget(null)}
          moneyStatus={resolveTarget.money_status}
          heldAmount={resolveTarget.amount}
          frozenAmount={0}
          currencyCode={resolveTarget.currency}
          hasActiveInvestigation={false}
          onResolve={onResolveSubmit}
          onRequestMoreInfo={onMoreInfoSubmit}
        />
      )}
    </AdminLayout>
  );
}

/* ---------- Avatar ---------- */

function Avatar({ name, url }: { name: string; url?: string | null }) {
  if (url) {
    return <img src={url} alt={name} className="h-6 w-6 rounded-full object-cover" />;
  }
  return (
    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-emerald-500 text-xs font-semibold text-white">
      {initials(name)}
    </div>
  );
}