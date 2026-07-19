import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  ShieldCheck, Clock, Download, FileCheck2, ListChecks, TriangleAlert, UserCog,
  Database, Filter, Search, Bookmark, CalendarDays, FileText, Code2, Eye, User,
  Copy, X, UserX, Banknote, Scale, Bot, Info, CircleAlert, Settings as SettingsIcon,
  ArrowRight, RefreshCw, LogIn, LogOut, Receipt, Undo2, Gavel,
} from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/sonner";
import {
  fetchAuditLogs, fetchAuditStats,
  type AuditRow, type AuditSeverity, type AuditListFilters,
} from "@/services/admin-audit-logs.service";
import { runExport } from "@/services/admin-escrow.service";

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
  if (/suspend|block/.test(a)) return { Icon: UserX, cls: "bg-red-500/20 border-red-500/40 text-red-400" };
  if (/refund/.test(a)) return { Icon: Undo2, cls: "bg-orange-500/20 border-orange-500/40 text-orange-400" };
  if (/payment|payout/.test(a)) return { Icon: Banknote, cls: "bg-emerald-500/20 border-emerald-500/40 text-emerald-400" };
  if (/dispute_resolve|resolve_dispute/.test(a)) return { Icon: Gavel, cls: "bg-emerald-500/20 border-emerald-500/40 text-emerald-400" };
  if (/dispute/.test(a)) return { Icon: Scale, cls: "bg-yellow-500/20 border-yellow-500/40 text-yellow-400" };
  if (/transaction/.test(a)) return { Icon: Receipt, cls: "bg-blue-500/20 border-blue-500/40 text-blue-400" };
  if (/logout|sign_out/.test(a)) return { Icon: LogOut, cls: "bg-slate-500/20 border-slate-500/40 text-slate-300" };
  if (/login|sign_in/.test(a)) return { Icon: LogIn, cls: "bg-slate-500/20 border-slate-500/40 text-slate-300" };
  if (/system|automated|cron/.test(a)) return { Icon: Bot, cls: "bg-blue-500/20 border-blue-500/40 text-blue-400" };
  if (/setting|config/.test(a)) return { Icon: SettingsIcon, cls: "bg-purple-500/20 border-purple-500/40 text-purple-400" };
  if (/export|download/.test(a)) return { Icon: Download, cls: "bg-slate-500/20 border-slate-500/40 text-slate-300" };
  return { Icon: FileText, cls: "bg-slate-500/20 border-slate-500/40 text-slate-300" };
}

function severityPill(sev: AuditSeverity) {
  const map: Record<AuditSeverity, { cls: string; label: string; Icon: typeof CircleAlert; pulse?: boolean }> = {
    critical: { cls: "bg-red-500/20 border-red-500/40 text-red-400", label: "CRITICAL", Icon: CircleAlert, pulse: true },
    high:     { cls: "bg-orange-500/20 border-orange-500/40 text-orange-400", label: "HIGH", Icon: TriangleAlert },
    medium:   { cls: "bg-yellow-500/20 border-yellow-500/40 text-yellow-400", label: "MEDIUM", Icon: TriangleAlert },
    low:      { cls: "bg-blue-500/20 border-blue-500/40 text-blue-400", label: "LOW", Icon: Info },
    info:     { cls: "bg-slate-700 text-slate-300 border-slate-600", label: "Info", Icon: Info },
  };
  return map[sev] ?? map.info;
}

function rowTint(sev: AuditSeverity) {
  if (sev === "critical") return "bg-red-500/5 border-l-4 border-red-500";
  if (sev === "high") return "bg-orange-500/5 border-l-4 border-orange-500";
  if (sev === "medium") return "bg-yellow-500/5 border-l-4 border-yellow-500";
  return "";
}

/* ---------------- Header ---------------- */
function HeaderBar({
  lastEntryAt, onExport, onCompliance, exporting,
}: { lastEntryAt: string | null; onExport: () => void; onCompliance: () => void; exporting: boolean }) {
  return (
    <header className="sticky top-0 z-30 bg-slate-900 border-b border-slate-800 px-4 md:px-8 py-5">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <h2 className="text-white text-xl font-semibold">Audit Logs</h2>
            <p className="text-slate-400 text-sm mt-0.5">Immutable compliance and forensic audit trail</p>
          </div>
          <div className="flex items-center gap-2 ml-0 md:ml-4">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-emerald-400 font-semibold text-sm">Immutable</span>
            </div>
            {lastEntryAt && (
              <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg">
                <Clock className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-slate-300 text-sm">Last entry: {fmtRelative(lastEntryAt)}</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onExport}
            disabled={exporting}
            className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition-all flex items-center gap-2 text-sm font-medium disabled:opacity-60"
          >
            {exporting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            <span className="hidden sm:inline">Export Logs</span>
          </button>
          <button
            onClick={onCompliance}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-all flex items-center gap-2 text-sm font-medium"
          >
            <ShieldCheck className="h-4 w-4" />
            <span className="hidden sm:inline">Compliance Report</span>
          </button>
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
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center border ${iconCls}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <h3 className="text-slate-400 text-sm font-medium mb-2">{label}</h3>
      <div className={`text-3xl font-bold ${valueCls ?? "text-white"}`}>{value}</div>
      <p className="text-slate-500 text-xs mt-2">{sub}</p>
    </div>
  );
}

/* ---------------- Drawer ---------------- */
function JsonDrawer({ row, onClose }: { row: AuditRow | null; onClose: () => void }) {
  const open = !!row;
  const payload = useMemo(() => row ? JSON.stringify(row, null, 2) : "", [row]);
  return (
    <>
      {open && <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />}
      <aside
        className={`fixed top-0 right-0 h-full w-full max-w-xl bg-slate-900 border-l border-slate-800 z-50 transform transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        {row && (
          <div className="h-full flex flex-col">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-slate-400 text-xs uppercase tracking-wider">Audit Entry</div>
                <div className="text-white font-semibold text-lg mt-0.5">{row.action_label}</div>
                <div className="text-slate-500 text-xs mt-1 font-mono">{row.id}</div>
              </div>
              <button onClick={onClose} className="text-slate-400 hover:text-white p-2">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-slate-500 text-xs uppercase mb-1">Actor</div>
                  <div className="text-white">{row.actor.name}</div>
                  <div className="text-slate-400 text-xs">{row.actor.email ?? "—"}</div>
                </div>
                <div>
                  <div className="text-slate-500 text-xs uppercase mb-1">Severity</div>
                  <div className="text-white uppercase font-semibold">{row.severity}</div>
                </div>
                <div>
                  <div className="text-slate-500 text-xs uppercase mb-1">IP Address</div>
                  <div className="text-slate-300 font-mono">{row.ip ?? "—"}</div>
                </div>
                <div>
                  <div className="text-slate-500 text-xs uppercase mb-1">Timestamp</div>
                  <div className="text-slate-300 font-mono">{new Date(row.created_at).toISOString()}</div>
                </div>
              </div>
              {row.changed_keys?.length ? (
                <div>
                  <div className="text-slate-500 text-xs uppercase mb-1">Changed keys</div>
                  <div className="flex flex-wrap gap-1.5">
                    {row.changed_keys.map((k) => (
                      <span key={k} className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 text-xs font-mono">{k}</span>
                    ))}
                  </div>
                </div>
              ) : null}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-slate-500 text-xs uppercase">Raw JSON</div>
                  <button
                    onClick={() => { navigator.clipboard.writeText(payload); toast("JSON copied"); }}
                    className="text-xs px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded flex items-center gap-1.5"
                  >
                    <Copy className="h-3 w-3" /> Copy JSON
                  </button>
                </div>
                <pre className="bg-slate-950 border border-slate-800 rounded-lg p-4 text-xs text-slate-300 overflow-x-auto max-h-[50vh]">{payload}</pre>
              </div>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}

/* ---------------- Page ---------------- */
const PAGE_SIZE = 50;

export default function AdminAuditLogs() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<AuditListFilters>({
    q: "", action_type: "all", severity: "all", from: "", to: "", page: 1, page_size: PAGE_SIZE,
  });
  const [applied, setApplied] = useState<AuditListFilters>({ page: 1, page_size: PAGE_SIZE });
  const [drawerRow, setDrawerRow] = useState<AuditRow | null>(null);
  const [exporting, setExporting] = useState(false);

  const statsQ = useQuery({ queryKey: ["admin-audit-stats"], queryFn: fetchAuditStats, staleTime: 60_000 });
  const listQ = useQuery({
    queryKey: ["admin-audit-list", applied],
    queryFn: () => fetchAuditLogs(applied),
    staleTime: 15_000,
  });

  useEffect(() => {
    const id = setInterval(() => statsQ.refetch(), 60_000);
    return () => clearInterval(id);
  }, [statsQ]);

  const stats = statsQ.data;
  const rows = listQ.data?.rows ?? [];
  const total = listQ.data?.total ?? 0;

  const doSearch = () => setApplied({ ...filters, page: 1 });
  const clearAll = () => {
    const empty: AuditListFilters = { q: "", action_type: "all", severity: "all", from: "", to: "", page: 1, page_size: PAGE_SIZE };
    setFilters(empty); setApplied(empty);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const { url } = await runExport("audit_logs" as any, applied as unknown as Record<string, unknown>);
      window.open(url, "_blank");
      toast.success("Export ready");
    } catch (e) {
      toast.error((e as Error).message ?? "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const actionOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => set.add(r.action_type));
    return Array.from(set).sort();
  }, [rows]);

  return (
    <AdminLayout
      title="Audit Logs"
      hideDefaultHeaders
      fullBleed
    >
      <div className="bg-slate-950 min-h-full">
        <HeaderBar
          lastEntryAt={stats?.latest_entry_at ?? null}
          onExport={handleExport}
          onCompliance={() => toast("Compliance report coming soon")}
          exporting={exporting}
        />
        <div className="p-4 md:p-8 space-y-8">
          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {statsQ.isLoading || !stats ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-36 bg-slate-900" />)
            ) : (
              <>
                <StatCard Icon={ListChecks} iconCls="bg-blue-500/10 border-blue-500/20 text-blue-400"
                  label="Total Audit Entries" value={stats.total_entries.toLocaleString()} sub="Last 30 days" />
                <StatCard Icon={TriangleAlert} iconCls="bg-red-500/10 border-red-500/20 text-red-400"
                  label="High Severity" value={stats.high_severity.toLocaleString()} valueCls="text-red-400" sub="Requires review" />
                <StatCard Icon={UserCog} iconCls="bg-purple-500/10 border-purple-500/20 text-purple-400"
                  label="Active Admins" value={stats.active_admins.toLocaleString()} valueCls="text-purple-400" sub="Last 24 hours" />
                <StatCard Icon={Database} iconCls="bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                  label="Storage Used" value={fmtBytes(stats.storage_bytes)} valueCls="text-emerald-400" sub="Of 10 GB limit" />
              </>
            )}
          </div>

          {/* Filters */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl">
            <div className="p-6 border-b border-slate-800">
              <h3 className="text-white text-lg font-semibold flex items-center gap-2">
                <Filter className="h-5 w-5 text-emerald-400" />
                Advanced Filters &amp; Search
              </h3>
              <p className="text-slate-400 text-sm mt-1">Filter by action type, actor, target, or search specific entries</p>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
                <div className="lg:col-span-3">
                  <Label className="text-slate-400 text-sm font-medium mb-2 block">Search Query</Label>
                  <Input
                    value={filters.q ?? ""}
                    onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && doSearch()}
                    placeholder="Actor name, target ID, transaction code, dispute ID, audit entry ID..."
                    className="w-full p-3 bg-slate-800 border-slate-700 rounded-lg text-white placeholder-slate-500 focus-visible:ring-emerald-500"
                  />
                </div>
                <div>
                  <Label className="text-slate-400 text-sm font-medium mb-2 block">Action Type</Label>
                  <select
                    value={filters.action_type ?? "all"}
                    onChange={(e) => setFilters((f) => ({ ...f, action_type: e.target.value }))}
                    className="w-full p-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="all">All Actions</option>
                    {actionOptions.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-slate-400 text-sm font-medium mb-2 block">Actor</Label>
                  <select
                    value={filters.actor_id ?? "all"}
                    onChange={(e) => setFilters((f) => ({ ...f, actor_id: e.target.value }))}
                    className="w-full p-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="all">All Actors</option>
                    {Array.from(new Map(rows.map((r) => [r.actor.id, r.actor])).values()).map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-slate-400 text-sm font-medium mb-2 block">Severity</Label>
                  <select
                    value={filters.severity ?? "all"}
                    onChange={(e) => setFilters((f) => ({ ...f, severity: e.target.value as any }))}
                    className="w-full p-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
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
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                <div>
                  <Label className="text-slate-400 text-sm font-medium mb-2 block">Date Range Start</Label>
                  <input
                    type="datetime-local"
                    value={filters.from ?? ""}
                    onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
                    className="w-full p-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <Label className="text-slate-400 text-sm font-medium mb-2 block">Date Range End</Label>
                  <input
                    type="datetime-local"
                    value={filters.to ?? ""}
                    onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
                    className="w-full p-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <button onClick={doSearch}
                  className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold transition-all flex items-center justify-center gap-2">
                  <Search className="h-4 w-4" /> Search Audit Logs
                </button>
                <button onClick={clearAll}
                  className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg font-semibold transition-all">
                  Clear All Filters
                </button>
                <button onClick={() => toast("Filter presets coming soon")}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-all flex items-center justify-center gap-2">
                  <Bookmark className="h-4 w-4" /> Save Filter Preset
                </button>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl">
            <div className="p-6 border-b border-slate-800">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-white text-lg font-semibold">Audit Log Entries</h3>
                  <p className="text-slate-400 text-sm mt-1">
                    {total.toLocaleString()} entries • Showing {rows.length} • Immutable records
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition-all text-sm font-medium flex items-center gap-2">
                    <CalendarDays className="h-4 w-4" />
                    <span className="hidden sm:inline">Quick Filters</span>
                  </button>
                  <button onClick={handleExport} disabled={exporting}
                    className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition-all text-sm font-medium flex items-center gap-2 disabled:opacity-60">
                    <FileText className="h-4 w-4" />
                    <span className="hidden sm:inline">Export CSV</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-800 border-b border-slate-700 sticky top-[73px] z-10">
                  <tr>
                    {["Timestamp","Action","Actor","Target","Description","Metadata","IP Address","Actions"].map((h, i) => (
                      <th key={h} className={`p-4 text-slate-300 font-semibold text-sm whitespace-nowrap ${i === 7 ? "text-center" : "text-left"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {listQ.isLoading && Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}><td colSpan={8} className="p-4"><Skeleton className="h-14 bg-slate-800" /></td></tr>
                  ))}
                  {!listQ.isLoading && rows.length === 0 && (
                    <tr><td colSpan={8} className="p-10 text-center text-slate-500 text-sm">No audit entries match your filters.</td></tr>
                  )}
                  {rows.map((r) => {
                    const { date, time } = fmtDate(r.created_at);
                    const { Icon, cls } = actionIconFor(r.action_type);
                    const sev = severityPill(r.severity);
                    const isSystemActor = /system|automated|cron|bot/i.test(r.actor.name) || r.actor.role === "system";
                    return (
                      <tr key={r.id} className={`hover:bg-slate-800/50 transition-all ${rowTint(r.severity)}`}>
                        <td className="p-4 align-top">
                          <p className="text-white text-sm font-medium">{date}</p>
                          <p className="text-slate-400 text-xs">{time}</p>
                          <p className="text-slate-500 text-xs mt-0.5">{fmtRelative(r.created_at)}</p>
                        </td>
                        <td className="p-4 align-top">
                          <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${cls}`}>
                              <Icon className="h-4 w-4" />
                            </div>
                            <div>
                              <p className="text-white text-sm font-medium">{r.action_label}</p>
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 border rounded text-xs font-bold mt-1 ${sev.cls} ${sev.pulse ? "animate-pulse" : ""}`}>
                                <sev.Icon className="h-3 w-3" />
                                {sev.label}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="p-4 align-top">
                          <div className="flex items-center gap-2">
                            {isSystemActor ? (
                              <div className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center">
                                <Bot className="h-4 w-4 text-blue-400" />
                              </div>
                            ) : r.actor.avatar_url ? (
                              <img src={r.actor.avatar_url} className={`w-8 h-8 rounded-full ${r.severity === "critical" ? "border-2 border-red-500/40" : ""}`} alt="" />
                            ) : (
                              <div className={`w-8 h-8 rounded-full bg-blue-500/20 border ${r.severity === "critical" ? "border-red-500/40" : "border-blue-500/40"} flex items-center justify-center`}>
                                <User className="h-4 w-4 text-blue-400" />
                              </div>
                            )}
                            <div>
                              <p className="text-white text-sm font-medium">{isSystemActor ? "System" : r.actor.name}</p>
                              <p className={`text-xs font-semibold ${r.severity === "critical" ? "text-red-400" : "text-slate-400"}`}>
                                {isSystemActor ? "Automated" : r.actor.role.replace(/_/g, " ")}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="p-4 align-top">
                          {r.target.user_id ? (
                            <div>
                              <p className="text-emerald-400 text-sm font-medium">User #{r.target.user_id.slice(0, 8)}</p>
                              <p className="text-slate-400 text-xs">{r.target.user_email ?? r.target.user_name ?? "—"}</p>
                            </div>
                          ) : r.target.transaction_id ? (
                            <div>
                              <p className="text-emerald-400 text-sm font-medium">TXN #{r.target.transaction_id.slice(0, 8)}</p>
                              <p className="text-slate-400 text-xs">Transaction ID</p>
                            </div>
                          ) : r.target.dispute_id ? (
                            <div>
                              <p className="text-emerald-400 text-sm font-medium">Case #{r.target.dispute_id.slice(0, 8)}</p>
                              <p className="text-slate-400 text-xs">Dispute Case</p>
                            </div>
                          ) : (
                            <p className="text-slate-500 text-sm">—</p>
                          )}
                        </td>
                        <td className="p-4 align-top">
                          <p className="text-slate-300 text-sm max-w-xs">{r.description}</p>
                        </td>
                        <td className="p-4 align-top">
                          <button onClick={() => setDrawerRow(r)}
                            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5">
                            <Code2 className="h-3 w-3" /> View JSON
                          </button>
                        </td>
                        <td className="p-4 align-top">
                          <p className="text-slate-300 text-sm font-mono">{r.ip ?? "—"}</p>
                        </td>
                        <td className="p-4 align-top">
                          <div className="flex items-center justify-center gap-1.5 flex-wrap">
                            <button onClick={() => setDrawerRow(r)} title="View Details"
                              className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-1.5 text-xs font-medium">
                              <Eye className="h-3 w-3" /><span className="hidden xl:inline">Details</span>
                            </button>
                            <button onClick={() => setDrawerRow(r)} title="View JSON"
                              className="px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg flex items-center gap-1.5 text-xs font-medium">
                              <Code2 className="h-3 w-3" /><span className="hidden xl:inline">JSON</span>
                            </button>
                            {r.target.user_id && (
                              <button onClick={() => navigate(`/admin/users/${r.target.user_id}`)} title="View User"
                                className="px-2.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg flex items-center gap-1.5 text-xs font-medium">
                                <User className="h-3 w-3" /><span className="hidden xl:inline">User</span>
                              </button>
                            )}
                            {r.target.transaction_id && (
                              <button onClick={() => navigate(`/admin/transactions/${r.target.transaction_id}`)} title="View Transaction"
                                className="px-2.5 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg flex items-center gap-1.5 text-xs font-medium">
                                <ArrowRight className="h-3 w-3" /><span className="hidden xl:inline">TXN</span>
                              </button>
                            )}
                            {r.target.dispute_id && (
                              <button onClick={() => navigate(`/admin/disputes/${r.target.dispute_id}`)} title="View Dispute"
                                className="px-2.5 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg flex items-center gap-1.5 text-xs font-medium">
                                <Scale className="h-3 w-3" /><span className="hidden xl:inline">Dispute</span>
                              </button>
                            )}
                            <button onClick={handleExport} title="Export"
                              className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center gap-1.5 text-xs font-medium">
                              <Download className="h-3 w-3" />
                            </button>
                            <button onClick={() => { navigator.clipboard.writeText(r.id); toast("ID copied"); }} title="Copy ID"
                              className="px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg flex items-center gap-1.5 text-xs font-medium">
                              <Copy className="h-3 w-3" />
                            </button>
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
              <div className="p-4 border-t border-slate-800 flex items-center justify-between text-sm">
                <div className="text-slate-400">
                  Page {applied.page ?? 1} of {Math.ceil(total / (applied.page_size ?? PAGE_SIZE))}
                </div>
                <div className="flex items-center gap-2">
                  <button disabled={(applied.page ?? 1) <= 1}
                    onClick={() => setApplied((a) => ({ ...a, page: Math.max(1, (a.page ?? 1) - 1) }))}
                    className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded disabled:opacity-40">Previous</button>
                  <button disabled={(applied.page ?? 1) >= Math.ceil(total / (applied.page_size ?? PAGE_SIZE))}
                    onClick={() => setApplied((a) => ({ ...a, page: (a.page ?? 1) + 1 }))}
                    className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded disabled:opacity-40">Next</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <JsonDrawer row={drawerRow} onClose={() => setDrawerRow(null)} />
    </AdminLayout>
  );
}