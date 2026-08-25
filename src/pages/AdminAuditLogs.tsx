import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { ShieldCheck, Clock, Download, ListChecks, TriangleAlert, UserCog, Database, Filter, Search, FileText, Code2, Eye, User, Copy, X, UserX, Banknote, Scale, Bot, Info, CircleAlert, Settings as SettingsIcon, ArrowRight, RefreshCw, LogIn, LogOut, Receipt, Undo2, Gavel, Menu } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/sonner";
import {
  fetchAuditLogs, fetchAuditStats, fetchAuditFacets, runComplianceReport,
  type AuditRow, type AuditSeverity, type AuditListFilters,
} from "@/services/admin-audit-logs.service";
import { runExport } from "@/services/admin-escrow.service";
import { useAdminRealtimeChannel, createBurstThrottle } from "@/hooks/useAdminRealtimeChannel";
import { keyActivate } from "@/lib/a11y";
import { ADMIN_SOLID, ADMIN_TONE } from "@/components/admin/palette";

/* ---------------- helpers ---------------- */
function fmtRelative(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.max(1, Math.floor(diff))} seconds ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  return `${Math.floor(diff / 86400)} days ago`;
}
function fmtDate(iso: string) {
  const d = new Date(iso);
  return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 19) + " UTC" };
}
function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 ** 3)).toFixed(2)} GB`;
}

/* ---------------- action → icon tile ---------------- */
function actionIconFor(action: string) {
  const a = (action || "").toLowerCase();
  if (/suspend|block/.test(a)) return { Icon: UserX, cls: "bg-red-500/15 text-red-400" };
  if (/refund/.test(a)) return { Icon: Undo2, cls: "bg-orange-500/15 text-orange-400" };
  if (/payment|payout/.test(a)) return { Icon: Banknote, cls: "bg-emerald-500/15 text-emerald-400" };
  if (/dispute_resolve|resolve_dispute/.test(a)) return { Icon: Gavel, cls: "bg-emerald-500/15 text-emerald-400" };
  if (/dispute/.test(a)) return { Icon: Scale, cls: "bg-amber-500/15 text-amber-400" };
  if (/transaction/.test(a)) return { Icon: Receipt, cls: "bg-blue-500/15 text-blue-400" };
  if (/logout|sign_out/.test(a)) return { Icon: LogOut, cls: "bg-muted text-muted-foreground" };
  if (/login|sign_in/.test(a)) return { Icon: LogIn, cls: "bg-muted text-muted-foreground" };
  if (/system|automated|cron/.test(a)) return { Icon: Bot, cls: "bg-blue-500/15 text-blue-400" };
  if (/setting|config/.test(a)) return { Icon: SettingsIcon, cls: "bg-purple-500/15 text-purple-400" };
  if (/export|download/.test(a)) return { Icon: Download, cls: "bg-muted text-muted-foreground" };
  return { Icon: FileText, cls: "bg-muted text-muted-foreground" };
}

function severityPill(sev: AuditSeverity) {
  const map: Record<AuditSeverity, { cls: string; label: string; Icon: typeof CircleAlert; pulse?: boolean }> = {
    critical: { cls: "bg-red-500/15 border-red-500/30 text-red-400", label: "CRITICAL", Icon: CircleAlert, pulse: true },
    high:     { cls: "bg-orange-500/15 border-orange-500/30 text-orange-400", label: "HIGH", Icon: TriangleAlert },
    medium:   { cls: "bg-amber-500/15 border-amber-500/30 text-amber-400", label: "MEDIUM", Icon: TriangleAlert },
    low:      { cls: "bg-blue-500/15 border-blue-500/30 text-blue-400", label: "LOW", Icon: Info },
    info:     { cls: "bg-muted text-muted-foreground border-border", label: "Info", Icon: Info },
  };
  return map[sev] ?? map.info;
}

function rowTint(sev: AuditSeverity) {
  if (sev === "critical") return "bg-red-500/5 border-l-4 border-red-500";
  if (sev === "high") return "bg-orange-500/5 border-l-4 border-orange-500";
  if (sev === "medium") return "bg-amber-500/5 border-l-4 border-amber-500";
  return "";
}

/* ---------------- Sticky header ---------------- */
function AuditHeader({
  lastEntryAt, onExport, onCompliance, exporting, complianceLoading, onRefresh, refreshing, live, onOpenMenu,
}: {
  lastEntryAt: string | null;
  onExport: () => void;
  onCompliance: () => void;
  exporting: boolean;
  complianceLoading: boolean;
  onRefresh: () => void;
  refreshing: boolean;
  live: boolean;
  onOpenMenu: () => void;
}) {
  return (
    <header className="sticky top-0 z-sticky border-b border-border bg-card px-4 py-5 md:px-8">
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onOpenMenu}
            aria-label="Open menu"
            className="lg:hidden inline-flex h-11 w-11 min-w-11 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:text-foreground"
          >
            <Menu className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-xl font-semibold leading-tight text-foreground">Audit Logs</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">Immutable compliance and forensic audit trail</p>
          </div>
          <div className="ml-0 flex flex-wrap items-center gap-2 md:ml-4">
            <div className="flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5">
              <ShieldCheck className={`h-3.5 w-3.5 ${ADMIN_TONE.success.text}`} />
              <span className={`text-sm font-semibold ${ADMIN_TONE.success.text}`}>Immutable</span>
            </div>
            {lastEntryAt && (
              <div className="hidden items-center gap-1.5 rounded-lg border border-border bg-muted px-3 py-1.5 lg:flex">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Last entry: {fmtRelative(lastEntryAt)}</span>
              </div>
            )}
            <div className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm ${live ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400" : "border-border bg-muted text-muted-foreground"}`}>
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${live ? "bg-emerald-400 sd-live-dot" : "bg-muted-foreground"}`} />
              {live ? "Live" : "Offline"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            disabled={refreshing}
            aria-label="Refresh"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="outline" size="sm" onClick={onExport} disabled={exporting} className="gap-2 text-sm font-medium">
            {exporting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            <span className="hidden sm:inline">Export Logs</span>
          </Button>
          <Button size="sm" onClick={onCompliance} disabled={complianceLoading} className="gap-2 bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700">
            {complianceLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            <span className="hidden sm:inline">Compliance Report</span>
          </Button>
        </div>
      </div>
    </header>
  );
}

/* ---------------- Stat card ---------------- */
function StatCard({
  Icon, iconCls, label, value, valueCls, sub,
}: { Icon: typeof ListChecks; iconCls: string; label: string; value: string; valueCls?: string; sub: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 transition-all hover:-translate-y-0.5">
      <div className="mb-3 flex items-start justify-between">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${iconCls}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 truncate text-2xl font-semibold tracking-tight ${valueCls ?? "text-foreground"}`}>{value}</div>
      <p className="mt-1.5 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

/* ---------------- Drawer ---------------- */
function JsonDrawer({ row, onClose, onOpenUser, onOpenTx, onOpenDispute }: {
  row: AuditRow | null;
  onClose: () => void;
  onOpenUser: (id: string) => void;
  onOpenTx: (id: string) => void;
  onOpenDispute: (id: string) => void;
}) {
  const open = !!row;
  const payload = useMemo(() => row ? JSON.stringify(row, null, 2) : "", [row]);
  const beforeObj = (row?.before ?? null) as Record<string, unknown> | null;
  const afterObj = (row?.after ?? null) as Record<string, unknown> | null;
  const clip = (v: unknown) => {
    const s = v === null || v === undefined ? "—" : typeof v === "string" ? v : JSON.stringify(v);
    return s.length > 120 ? s.slice(0, 120) + "…" : s;
  };
  return (
    <>
      {open && <div role="button" tabIndex={0} onKeyDown={keyActivate} className="fixed inset-0 bg-black/50 z-overlay" onClick={onClose} />}
      <aside
        className={`fixed top-0 right-0 h-full w-full max-w-xl bg-card border-l border-border z-sheet transform transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        {row && (
          <div className="h-full flex flex-col">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div>
                <div className="text-muted-foreground text-xs uppercase tracking-wider">Audit Entry</div>
                <div className="text-foreground font-semibold text-base mt-0.5">{row.action_label}</div>
                <div className="text-muted-foreground text-xs mt-1 font-mono">{row.id}</div>
              </div>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-4 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Actor</div>
                  <div className="text-foreground">{row.actor.name}</div>
                  <div className="text-muted-foreground text-xs">{row.actor.email ?? "—"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Severity</div>
                  <div className="text-foreground uppercase font-semibold">{row.severity}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs uppercase tracking-wider mb-1">IP Address</div>
                  <div className="text-foreground/90 font-mono">{row.ip ?? "—"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Timestamp</div>
                  <div className="text-foreground/90 font-mono">{new Date(row.created_at).toISOString()}</div>
                </div>
              </div>
              {row.changed_keys?.length ? (
                <div>
                  <div className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Changed keys</div>
                  <div className="flex flex-wrap gap-1.5">
                    {row.changed_keys.map((k) => (
                      <span key={k} className="px-2 py-0.5 rounded bg-muted border border-border text-foreground/80 text-xs font-mono">{k}</span>
                    ))}
                  </div>
                </div>
              ) : null}
              {row.changed_keys?.length && (beforeObj || afterObj) ? (
                <div>
                  <div className="text-muted-foreground text-xs uppercase tracking-wider mb-2">Changes</div>
                  <div className="rounded-lg border border-border overflow-hidden">
                    <table className="sd-stack w-full text-xs">
                      <thead className="bg-muted/40">
                        <tr>
                          <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Field</th>
                          <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Before</th>
                          <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">After</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {row.changed_keys.map((k) => (
                          <tr key={k} className="align-top">
                            <td className="px-2 py-1.5 font-mono text-foreground/80">{k}</td>
                            <td className={`px-2 py-1.5 font-mono ${ADMIN_TONE.danger.text}`}>{clip(beforeObj?.[k])}</td>
                            <td className={`px-2 py-1.5 font-mono ${ADMIN_TONE.success.text}`}>{clip(afterObj?.[k])}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-muted-foreground text-xs uppercase tracking-wider">Raw JSON</div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { navigator.clipboard.writeText(payload); toast("JSON copied"); }}
                  >
                    <Copy className="h-3 w-3 mr-1.5" /> Copy JSON
                  </Button>
                </div>
                <pre className="bg-muted border border-border rounded-lg p-4 text-xs text-foreground/90 overflow-x-auto max-h-[50dvh]">{payload}</pre>
              </div>
            </div>
            <div className="p-4 border-t border-border flex flex-wrap gap-2">
              {row.target.user_id && (
                <Button size="sm" variant="outline" onClick={() => onOpenUser(row.target.user_id!)}>
                  <User className="h-3 w-3 mr-1.5" /> Open user profile
                </Button>
              )}
              {row.target.transaction_id && (
                <Button size="sm" variant="outline" onClick={() => onOpenTx(row.target.transaction_id!)}>
                  <Receipt className="h-3 w-3 mr-1.5" /> Open transaction
                </Button>
              )}
              {row.target.dispute_id && (
                <Button size="sm" variant="outline" onClick={() => onOpenDispute(row.target.dispute_id!)}>
                  <Scale className="h-3 w-3 mr-1.5" /> Open dispute
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(row.id); toast("ID copied"); }}>
                <Copy className="h-3 w-3 mr-1.5" /> Copy ID
              </Button>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}

/* ---------------- Page ---------------- */
const PAGE_SIZE = 50;
const PAGE_SIZE_OPTIONS = [25, 50, 100];
const QUICK_RANGES: Array<{ key: "24h" | "7d" | "30d" | "custom"; label: string; hours: number | null }> = [
  { key: "24h", label: "Last 24h", hours: 24 },
  { key: "7d", label: "Last 7 days", hours: 24 * 7 },
  { key: "30d", label: "Last 30 days", hours: 24 * 30 },
  { key: "custom", label: "Custom", hours: null },
];

function toLocalDateTime(iso: string): string {
  // Convert an ISO string to the value shape a `datetime-local` input accepts.
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdminAuditLogs() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  // Deep-link support: `/admin/audit-logs?ref=<id>&type=change_set|override`
  // seeds the search box with the reference id so the operator lands on the
  // filtered rows. `type` is currently informational only. The audit list is
  // full-text and any resource id is matched by the `q` filter.
  const initialRef = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("ref") ?? ""
    : "";
  const [filters, setFilters] = useState<AuditListFilters>({
    q: initialRef, action_type: "all", severity: "all", from: "", to: "", page: 1, page_size: PAGE_SIZE,
  });
  const [applied, setApplied] = useState<AuditListFilters>({
    q: initialRef || undefined, page: 1, page_size: PAGE_SIZE,
  });
  const [drawerRow, setDrawerRow] = useState<AuditRow | null>(null);
  const [exporting, setExporting] = useState(false);
  const [complianceLoading, setComplianceLoading] = useState(false);
  const [quickRange, setQuickRange] = useState<"24h" | "7d" | "30d" | "custom">("30d");
  const [live, setLive] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const statsQ = useQuery({ queryKey: ["admin-audit-stats"], queryFn: fetchAuditStats, staleTime: 60_000 });
  const listQ = useQuery({
    queryKey: ["admin-audit-list", applied],
    queryFn: () => fetchAuditLogs(applied),
    staleTime: 15_000,
  });
  const facetsQ = useQuery({ queryKey: ["admin-audit-facets"], queryFn: fetchAuditFacets, staleTime: 5 * 60_000 });

  useEffect(() => {
    const id = setInterval(() => statsQ.refetch(), 60_000);
    return () => clearInterval(id);
  }, [statsQ]);

  // Realtime: invalidate list + stats when new admin actions arrive, throttled.
  const throttleRef = useMemo(() => createBurstThrottle(3000), []);
  useAdminRealtimeChannel({
    channelName: "admin-audit-logs",
    onStatus: (s) => setLive(s === "live"),
    subs: [{
      table: "admin_actions",
      event: "INSERT",
      onEvent: () => throttleRef(() => {
        qc.invalidateQueries({ queryKey: ["admin-audit-list"] });
        qc.invalidateQueries({ queryKey: ["admin-audit-stats"] });
      }),
    }],
  });

  const stats = statsQ.data;
  const rows = listQ.data?.rows ?? [];
  // A row count, not money: absent honestly means zero rows. The count-named
  // local keeps the money-zero guard able to see the difference.
  const totalCount = listQ.data?.total;
  const total = totalCount ?? 0;
  const facets = facetsQ.data;

  const doSearch = () => setApplied({ ...filters, page: 1 });
  const clearAll = () => {
    const empty: AuditListFilters = { q: "", action_type: "all", severity: "all", from: "", to: "", page: 1, page_size: PAGE_SIZE };
    setFilters(empty); setApplied(empty); setQuickRange("30d");
  };

  const applyQuickRange = (key: "24h" | "7d" | "30d" | "custom") => {
    setQuickRange(key);
    if (key === "custom") return;
    const hoursMap: Record<string, number> = { "24h": 24, "7d": 24 * 7, "30d": 24 * 30 };
    const from = new Date(Date.now() - hoursMap[key] * 3600 * 1000).toISOString();
    const to = new Date().toISOString();
    setFilters((f) => ({ ...f, from: toLocalDateTime(from), to: toLocalDateTime(to) }));
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([listQ.refetch(), statsQ.refetch(), facetsQ.refetch()]);
      toast.success("Refreshed");
    } finally { setRefreshing(false); }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const { url } = await runExport("audit_logs", applied as unknown as Record<string, unknown>);
      window.open(url, "_blank");
      toast.success("Export ready");
    } catch (e) {
      toast.error((e as Error).message ?? "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const handleCompliance = async () => {
    setComplianceLoading(true);
    try {
      const { url } = await runComplianceReport("30d");
      window.open(url, "_blank");
      toast.success("Compliance report ready");
    } catch (e) {
      toast.error((e as Error).message ?? "Compliance report failed");
    } finally {
      setComplianceLoading(false);
    }
  };

  // Prefer facets over the current page's rows; fall back to page rows on load.
  const actionOptions = useMemo(() => {
    if (facets?.action_types?.length) return facets.action_types;
    const set = new Set<string>();
    rows.forEach((r) => set.add(r.action_type));
    return Array.from(set).sort();
  }, [facets, rows]);
  const actorOptions = useMemo(() => {
    if (facets?.actors?.length) return facets.actors.map((a) => ({ id: a.id, name: a.full_name }));
    return Array.from(new Map(rows.map((r) => [r.actor.id, { id: r.actor.id, name: r.actor.name }])).values());
  }, [facets, rows]);

  return (
    <AdminLayout
      title="Audit Logs"
      subtitle="Immutable compliance and forensic audit trail"
      hideDefaultHeaders
      headerSlot={({ onOpenMenu }) => (
        <AuditHeader
          lastEntryAt={stats?.latest_entry_at ?? null}
          onExport={handleExport}
          onCompliance={handleCompliance}
          exporting={exporting}
          complianceLoading={complianceLoading}
          onRefresh={handleRefresh}
          refreshing={refreshing}
          live={live}
          onOpenMenu={onOpenMenu}
        />
      )}
    >
      {/* Stats */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {statsQ.isLoading || !stats ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[110px] rounded-xl bg-card" />)
        ) : (
          <>
            <StatCard Icon={ListChecks} iconCls="bg-blue-500/15 text-blue-400"
              label="Total Audit Entries" value={stats.total_entries.toLocaleString()} sub="Last 30 days" />
            <StatCard Icon={TriangleAlert} iconCls="bg-red-500/15 text-red-400"
              label="High Severity" value={stats.high_severity.toLocaleString()} valueCls="text-red-400" sub="Requires review" />
            <StatCard Icon={UserCog} iconCls="bg-purple-500/15 text-purple-400"
              label="Active Admins" value={stats.active_admins.toLocaleString()} valueCls="text-purple-400" sub="Last 24 hours" />
            <StatCard Icon={Database} iconCls="bg-emerald-500/15 text-emerald-400"
              label="Storage Used" value={fmtBytes(stats.storage_bytes)} valueCls="text-emerald-400" sub="Of 10 GB limit" />
          </>
        )}
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-border bg-card">
        <div className="p-4 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Advanced Filters &amp; Search</h3>
          <p className="text-xs text-muted-foreground mt-1">Filter by action type, actor, target, or search specific entries</p>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-3">
                <div className="lg:col-span-3">
                  <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">Search Query</Label>
                  <Input
                    value={filters.q ?? ""}
                    onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && doSearch()}
                    placeholder="Actor name, target ID, transaction code, dispute ID, audit entry ID..."
                  />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">Action Type</Label>
                  <select
                    value={filters.action_type ?? "all"}
                    onChange={(e) => setFilters((f) => ({ ...f, action_type: e.target.value }))}
                    className="w-full h-11 px-3 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="all">All Actions</option>
                    {actionOptions.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">Actor</Label>
                  <select
                    value={filters.actor_id ?? "all"}
                    onChange={(e) => setFilters((f) => ({ ...f, actor_id: e.target.value }))}
                    className="w-full h-11 px-3 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="all">All Actors</option>
                    {actorOptions.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">Severity</Label>
                  <select
                    value={filters.severity ?? "all"}
                    onChange={(e) => setFilters((f) => ({ ...f, severity: e.target.value as any }))}
                    className="w-full h-11 px-3 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="all">All Severities</option>
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                    <option value="info">Info</option>
                  </select>
                </div>
              </div>
              {/* Quick range chips */}
              <div className="mb-3">
                <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">Quick Range</Label>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_RANGES.map((r) => (
                    <Button
                      key={r.key}
                      size="sm"
                      variant={quickRange === r.key ? "default" : "outline"}
                      onClick={() => applyQuickRange(r.key)}
                      className="h-11 px-3 text-xs"
                    >
                      {r.label}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
                <div>
                  <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">Date Range Start</Label>
                  <input
                    type="datetime-local"
                    value={filters.from ?? ""}
                    onChange={(e) => { setFilters((f) => ({ ...f, from: e.target.value })); setQuickRange("custom"); }}
                    className="w-full h-11 px-3 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">Date Range End</Label>
                  <input
                    type="datetime-local"
                    value={filters.to ?? ""}
                    onChange={(e) => { setFilters((f) => ({ ...f, to: e.target.value })); setQuickRange("custom"); }}
                    className="w-full h-11 px-3 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button onClick={doSearch} size="sm">
                  <Search className="h-4 w-4 mr-1.5" /> Search Audit Logs
                </Button>
                <Button onClick={clearAll} variant="ghost" size="sm">
                  Clear All Filters
                </Button>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="p-4 border-b border-border">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Audit Log Entries</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {total.toLocaleString()} entries • Showing {rows.length} • Immutable records
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button onClick={handleExport} disabled={exporting} variant="outline" size="sm">
                    <FileText className="h-4 w-4 mr-1.5" />
                    <span className="hidden sm:inline">Export CSV</span>
                  </Button>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="sd-stack w-full">
                <thead className="bg-muted/40 border-b border-border">
                  <tr>
                    {["Timestamp","Action","Actor","Target","Description","Metadata","IP Address","Actions"].map((h, i) => (
                      <th key={h} className={`p-3 text-muted-foreground font-medium text-xs uppercase tracking-wider whitespace-nowrap ${i === 7 ? "text-center" : "text-left"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {listQ.isLoading && Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}><td colSpan={8} className="p-3"><Skeleton className="h-12 bg-muted" /></td></tr>
                  ))}
                  {!listQ.isLoading && rows.length === 0 && (
                    <tr><td colSpan={8} className="p-10 text-center text-muted-foreground text-sm">No audit entries match your filters.</td></tr>
                  )}
                  {rows.map((r) => {
                    const { date, time } = fmtDate(r.created_at);
                    const { Icon, cls } = actionIconFor(r.action_type);
                    const sev = severityPill(r.severity);
                    const isSystemActor = /system|automated|cron|bot/i.test(r.actor.name) || r.actor.role === "system";
                    return (
                      <tr key={r.id} className={`hover:bg-muted/40 transition-colors ${rowTint(r.severity)}`}>
                        <td className="p-3 align-top">
                          <p className="text-foreground text-sm font-medium">{date}</p>
                          <p className="text-muted-foreground text-xs">{time}</p>
                          <p className="text-muted-foreground/70 text-xs mt-0.5">{fmtRelative(r.created_at)}</p>
                        </td>
                        <td className="p-3 align-top">
                          <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${cls}`}>
                              <Icon className="h-4 w-4" />
                            </div>
                            <div>
                              <p className="text-foreground text-sm font-medium">{r.action_label}</p>
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 border rounded text-xs font-semibold mt-1 ${sev.cls} ${sev.pulse ? "sd-live-dot" : ""}`}>
                                <sev.Icon className="h-3 w-3" />
                                {sev.label}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 align-top">
                          <div className="flex items-center gap-2">
                            {isSystemActor ? (
                              <div className="w-8 h-8 rounded-full bg-blue-500/15 border border-blue-500/30 flex items-center justify-center">
                                <Bot className={`h-4 w-4 ${ADMIN_TONE.info.text}`} />
                              </div>
                            ) : r.actor.avatar_url ? (
                              <img src={r.actor.avatar_url} className={`w-8 h-8 rounded-full ${r.severity === "critical" ? "border-2 border-red-500/40" : ""}`} alt="" />
                            ) : (
                              <div className={`w-8 h-8 rounded-full bg-blue-500/15 border ${r.severity === "critical" ? "border-red-500/40" : "border-blue-500/30"} flex items-center justify-center`}>
                                <User className={`h-4 w-4 ${ADMIN_TONE.info.text}`} />
                              </div>
                            )}
                            <div>
                              <p className="text-foreground text-sm font-medium">{isSystemActor ? "System" : r.actor.name}</p>
                              <p className={`text-xs font-medium ${r.severity === "critical" ? "text-red-400" : "text-muted-foreground"}`}>
                                {isSystemActor ? "Automated" : r.actor.role.replace(/_/g, " ")}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 align-top">
                          {r.target.user_id ? (
                            <div>
                              <p className={`${ADMIN_TONE.success.text} text-sm font-medium`}>{r.target.public_user_id ?? "User"}</p>
                              <p className="text-muted-foreground text-xs">{r.target.user_email ?? r.target.user_name ?? "—"}</p>
                            </div>
                          ) : r.target.transaction_id ? (
                            <div>
                              <p className={`${ADMIN_TONE.success.text} text-sm font-medium`}>TXN #{r.target.transaction_id.slice(0, 8)}</p>
                              <p className="text-muted-foreground text-xs">Transaction ID</p>
                            </div>
                          ) : r.target.dispute_id ? (
                            <div>
                              <p className={`${ADMIN_TONE.success.text} text-sm font-medium`}>Case #{r.target.dispute_id.slice(0, 8)}</p>
                              <p className="text-muted-foreground text-xs">Dispute Case</p>
                            </div>
                          ) : (
                            <p className="text-muted-foreground text-sm">—</p>
                          )}
                        </td>
                        <td className="p-3 align-top">
                          <p className="text-foreground/90 text-sm max-w-xs">{r.description}</p>
                        </td>
                        <td className="p-3 align-top">
                          <Button onClick={() => setDrawerRow(r)} variant="outline" size="sm" className="h-11 px-2 text-xs">
                            <Code2 className="h-3 w-3 mr-1" /> View JSON
                          </Button>
                        </td>
                        <td className="p-3 align-top">
                          <p className="text-foreground/90 text-sm font-mono">{r.ip ?? "—"}</p>
                        </td>
                        <td className="p-3 align-top">
                          <div className="flex items-center justify-center gap-1.5 flex-wrap">
                            <Button onClick={() => setDrawerRow(r)} title="View Details" size="sm" className={`h-11 px-2 text-xs ${ADMIN_SOLID.info}`}>
                              <Eye className="h-3 w-3" /><span className="hidden xl:inline ml-1">Details</span>
                            </Button>
                            {r.target.user_id && (
                              <Button onClick={() => navigate(`/admin/users/${r.target.user_id}`)} title="View User" size="sm" className={`h-11 px-2 text-xs ${ADMIN_SOLID.special}`}>
                                <User className="h-3 w-3" /><span className="hidden xl:inline ml-1">User</span>
                              </Button>
                            )}
                            {r.target.transaction_id && (
                              <Button onClick={() => navigate(`/admin/transactions/${r.target.transaction_id}`)} title="View Transaction" size="sm" className={`h-11 px-2 text-xs ${ADMIN_SOLID.elevated} min-w-11 inline-flex items-center justify-center`}>
                                <ArrowRight className="h-3 w-3" /><span className="hidden xl:inline ml-1">TXN</span>
                              </Button>
                            )}
                            {r.target.dispute_id && (
                              <Button onClick={() => navigate(`/admin/disputes/${r.target.dispute_id}`)} title="View Dispute" size="sm" className={`h-11 px-2 text-xs ${ADMIN_SOLID.elevated}`}>
                                <Scale className="h-3 w-3" /><span className="hidden xl:inline ml-1">Dispute</span>
                              </Button>
                            )}
                            <Button onClick={() => { navigator.clipboard.writeText(r.id); toast("ID copied"); }} title="Copy ID" variant="outline" size="sm" className="h-7 w-7 p-0 relative before:absolute before:-inset-2 before:content-['']">
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {total > (applied.page_size ?? PAGE_SIZE) && (
              <div className="p-3 border-t border-border flex items-center justify-between text-sm">
                <div className="text-muted-foreground text-xs flex items-center gap-3">
                  <span>Page {applied.page ?? 1} of {Math.ceil(total / (applied.page_size ?? PAGE_SIZE))}</span>
                  <span className="flex items-center gap-1.5">
                    Rows:
                    <select
                      value={applied.page_size ?? PAGE_SIZE}
                      onChange={(e) => setApplied((a) => ({ ...a, page_size: Number(e.target.value), page: 1 }))}
                      className="h-11 bg-background border border-border rounded px-2 text-xs"
                    >
                      {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={(applied.page ?? 1) <= 1}
                    onClick={() => setApplied((a) => ({ ...a, page: Math.max(1, (a.page ?? 1) - 1) }))}>
                    Previous
                  </Button>
                  <Button variant="outline" size="sm" disabled={(applied.page ?? 1) >= Math.ceil(total / (applied.page_size ?? PAGE_SIZE))}
                    onClick={() => setApplied((a) => ({ ...a, page: (a.page ?? 1) + 1 }))}>
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>

      <JsonDrawer
        row={drawerRow}
        onClose={() => setDrawerRow(null)}
        onOpenUser={(id) => { setDrawerRow(null); navigate(`/admin/users/${id}`); }}
        onOpenTx={(id) => { setDrawerRow(null); navigate(`/admin/transactions/${id}`); }}
        onOpenDispute={(id) => { setDrawerRow(null); navigate(`/admin/disputes/${id}`); }}
      />
    </AdminLayout>
  );
}