import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import {
  Send, AlertTriangle, Smartphone, Mail, Bell, RefreshCw, RotateCw, Search,
  Filter, Megaphone, Receipt, Scale, User, CheckCircle2, XCircle, Info, Download,
  Clock, AlertCircle, Paperclip,
} from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import { formatRelative } from "@/components/admin/dashboard/relative";
import {
  fetchAdminNotifications, retryNotificationDelivery, retryAllFailedNotifications, sendBroadcast,
  type AdminNotifFailedRow, type AdminNotifRecentRow, type BroadcastPayload,
} from "@/services/admin-notifications.service";
import { useRealtimeAdminNotifications } from "@/hooks/useRealtimeAdminNotifications";
import { useOnlinePresence } from "@/hooks/useOnlinePresence";

// ---------- helpers ----------
const channelIcon = (ch: string) => {
  if (ch === "email") return Mail;
  if (ch === "sms") return Smartphone;
  if (ch === "push") return Bell;
  return Bell;
};
const channelIconColor = (ch: string) => {
  if (ch === "email") return "text-purple-400";
  if (ch === "sms") return "text-orange-400";
  if (ch === "push") return "text-emerald-400";
  return "text-blue-400"; // in_app
};
const channelLabel = (ch: string) => ({ in_app: "In-App", email: "Email", sms: "SMS", push: "Push" } as any)[ch] ?? ch;

const statusPill = (status: string) => {
  const map: Record<string, string> = {
    sent: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    delivered: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    read: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    failed: "bg-red-500/10 text-red-400 border-red-500/20",
    pending: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    retrying: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  };
  return map[status] ?? "bg-muted text-muted-foreground border-border";
};
const statusLabel = (s: string) =>
  s === "sent" || s === "read" ? "Delivered" : s.charAt(0).toUpperCase() + s.slice(1);

// Type pill color mapping (from reference)
const typePillClass = (type: string | null | undefined) => {
  const t = (type || "").toLowerCase();
  if (t.includes("dispute")) return { cls: "bg-red-500/10 border-red-500/20 text-red-400", label: "Dispute" };
  if (t.includes("payment")) return { cls: "bg-blue-500/10 border-blue-500/20 text-blue-400", label: "Payment" };
  if (t.includes("security")) return { cls: "bg-amber-500/10 border-amber-500/20 text-amber-400", label: "Security" };
  if (t.includes("verification")) return { cls: "bg-purple-500/10 border-purple-500/20 text-purple-400", label: "Verification" };
  if (t.includes("delivery")) return { cls: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400", label: "Delivery" };
  if (t.includes("transaction")) return { cls: "bg-blue-500/10 border-blue-500/20 text-blue-400", label: "Transaction" };
  return { cls: "bg-slate-500/10 border-slate-500/20 text-slate-300", label: "System" };
};
const TypePill = ({ type }: { type: string | null | undefined }) => {
  const { cls, label } = typePillClass(type);
  return <span className={`px-2 py-1 border text-xs font-semibold rounded ${cls}`}>{label}</span>;
};
const ChannelCell = ({ ch }: { ch: string }) => {
  const Icon = channelIcon(ch);
  return (
    <div className="flex items-center gap-1.5">
      <Icon className={`h-3.5 w-3.5 ${channelIconColor(ch)}`} />
      <span className="text-xs text-foreground">{channelLabel(ch)}</span>
    </div>
  );
};
/** Small inline online/offline dot for table rows (no absolute positioning). */
const InlineDot = ({ online }: { online: boolean }) => (
  <span
    title={online ? "Online now" : "Offline"}
    aria-label={online ? "Online now" : "Offline"}
    className={`inline-block h-2 w-2 rounded-full shrink-0 ${online ? "bg-emerald-500" : "bg-slate-500/60"}`}
  />
);
const shortUsrId = (publicUserId?: string | null) => publicUserId || "USR-—";
const shortTxnCode = (t: { code: string | null; id: string } | null) =>
  t ? (t.code || `TXN-${t.id.replace(/-/g, "").slice(0, 5).toUpperCase()}`) : "";
const shortDisId = (id: string | null) =>
  id ? `DIS-${id.replace(/-/g, "").slice(0, 5).toUpperCase()}` : "";

// ---------- Header ----------
function HeaderBar({ lastSync, onBroadcast, onExport }: { lastSync?: string; onBroadcast: () => void; onExport: () => void }) {
  return (
    <div className="sticky top-0 z-sticky border-b border-border bg-background/85 backdrop-blur">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h2 className="sd-page-title">Notification Center</h2>
            <p className="sd-page-sub">Monitor delivery performance and manage communication issues</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 sd-live-dot" /> Live
            </span>
            {lastSync && (
              <span className="hidden lg:inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" /> Last sync: {formatRelative(lastSync)}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onExport} className="h-11 text-xs">
            <Download className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Export Report</span>
          </Button>
          <Button size="sm" onClick={onBroadcast} className="h-11 text-xs bg-blue-600 hover:bg-blue-500 text-white">
            <Megaphone className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Broadcast Message</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------- KPI cards ----------
function KpiCards({ kpis }: { kpis: any }) {
  // Favorable direction per metric: true = "up is good", false = "up is bad".
  const fmtPct = (n: number | undefined, suffix = "%") =>
    n === undefined || n === null || Number.isNaN(n) ? "—" : `${n > 0 ? "+" : ""}${n}${suffix}`;
  const trendColorFor = (delta: number | undefined, upIsGood: boolean) => {
    if (delta === undefined || delta === null || Number.isNaN(delta) || delta === 0) return "text-muted-foreground";
    const good = upIsGood ? delta > 0 : delta < 0;
    return good ? "text-emerald-400" : "text-red-400";
  };
  const compared = kpis.compared_to ? `vs ${kpis.compared_to}` : "vs yesterday";
  const cards = [
    { label: "Sent Today", value: kpis.sent_today, icon: Send, color: "emerald",
      trend: fmtPct(kpis.sent_delta), trendSub: compared, trendColor: trendColorFor(kpis.sent_delta, true) },
    { label: "Failed Deliveries", value: kpis.failed_today, icon: AlertTriangle, color: "red",
      trend: fmtPct(kpis.failed_delta), trendSub: compared, trendColor: trendColorFor(kpis.failed_delta, false) },
    { label: "SMS Failures", value: kpis.sms_failures, icon: Smartphone, color: "orange",
      trend: fmtPct(kpis.sms_delta), trendSub: compared, trendColor: trendColorFor(kpis.sms_delta, false) },
    { label: "Email Failures", value: kpis.email_failures, icon: Mail, color: "purple",
      trend: fmtPct(kpis.email_delta), trendSub: compared, trendColor: trendColorFor(kpis.email_delta, false) },
    { label: "In-App Rate", value: `${kpis.in_app_rate}%`, icon: Bell, color: "blue",
      trend: fmtPct(kpis.in_app_delta, "pp"), trendSub: compared, trendColor: trendColorFor(kpis.in_app_delta, true) },
    { label: "Retry Queue", value: kpis.retry_queue, icon: RotateCw, color: "amber",
      trend: fmtPct(kpis.retry_delta), trendSub: compared, trendColor: trendColorFor(kpis.retry_delta, false) },
  ];
  const iconBg: Record<string, string> = {
    blue: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    red: "bg-red-500/10 text-red-400 border-red-500/20",
    orange: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    purple: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    amber: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  };
  const numberColor: Record<string, string> = {
    blue: "text-blue-400",
    red: "text-red-400",
    orange: "text-orange-400",
    purple: "text-purple-400",
    emerald: "text-emerald-400",
    amber: "text-amber-400",
  };
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <Card key={c.label} className="sd-card sd-card-pad sd-metric">
            <div className="flex items-center justify-between mb-2">
              <div className={`w-9 h-9 rounded-lg border flex items-center justify-center ${iconBg[c.color]}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="text-right">
                <div className={`text-xs font-semibold ${c.trendColor}`}>{c.trend}</div>
                <div className="text-muted-foreground text-xs">{c.trendSub}</div>
              </div>
            </div>
            <h3 className="sd-eyebrow mb-1">{c.label}</h3>
            <div className={`sd-kpi-value tabular-nums ${numberColor[c.color]}`}>{c.value}</div>
          </Card>
        );
      })}
    </div>
  );
}

// ---------- Filters ----------
interface FiltersState { q: string; channel: string; status: string; type: string; failedOnly: boolean }
function FiltersBar({ f, setF, onSearch, onClear, filtersRef }: {
  f: FiltersState; setF: (v: FiltersState) => void; onSearch: () => void; onClear: () => void;
  filtersRef?: React.RefObject<HTMLDivElement>;
}) {
  return (
    <Card className="overflow-hidden" ref={filtersRef as any}>
      <div className="p-3 border-b border-border">
        <h3 className="text-foreground text-sm font-semibold flex items-center gap-2">
          <Search className="h-4 w-4 text-blue-400" />
          Search & Filter Notifications
        </h3>
        <p className="text-muted-foreground text-xs mt-0.5">Search by user, notification ID, or transaction reference</p>
      </div>
      <div className="p-3">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 mb-3">
          <div className="lg:col-span-2">
            <Label className="text-muted-foreground text-xs font-medium mb-1.5 block">Search Query</Label>
            <Input
              placeholder="User email, notification ID, TXN-xxx..."
              value={f.q}
              onChange={(e) => setF({ ...f, q: e.target.value })}
              className="h-11 text-xs"
            />
          </div>
          <div>
            <Label className="text-muted-foreground text-xs font-medium mb-1.5 block">Channel</Label>
            <Select value={f.channel} onValueChange={(v) => setF({ ...f, channel: v })}>
              <SelectTrigger className="h-11 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Channels</SelectItem>
                <SelectItem value="in_app">In-App</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="push">Push</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-muted-foreground text-xs font-medium mb-1.5 block">Status</Label>
            <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v })}>
              <SelectTrigger className="h-11 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="sent">Delivered</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="retrying">Retrying</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-muted-foreground text-xs font-medium mb-1.5 block">Type</Label>
            <Select value={f.type} onValueChange={(v) => setF({ ...f, type: v })}>
              <SelectTrigger className="h-11 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="payment_update">Payment</SelectItem>
                <SelectItem value="dispute_update">Dispute</SelectItem>
                <SelectItem value="security_alert">Security</SelectItem>
                <SelectItem value="system_message">System</SelectItem>
                <SelectItem value="verification_update">Verification</SelectItem>
                <SelectItem value="transaction_update">Transaction</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            onClick={onSearch}
            className="px-4 h-11 text-xs bg-blue-600 hover:bg-blue-500 text-white font-semibold"
          >
            <Search className="h-3.5 w-3.5" /> Search Notifications
          </Button>
          <Button
            variant="secondary"
            onClick={onClear}
            className="px-4 h-11 text-xs font-semibold"
          >
            Clear Filters
          </Button>
          <Button
            onClick={() => setF({ ...f, failedOnly: !f.failedOnly })}
            className={`px-4 h-11 text-xs font-semibold text-white ${f.failedOnly ? "bg-amber-700 hover:bg-amber-800" : "bg-amber-600 hover:bg-amber-700"}`}
          >
            <Filter className="h-3.5 w-3.5" /> Failed Only
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ---------- Failed table ----------
function FailedTable({ rows, onRetry, onRetryAll, retrying, onExport, onDetails }: {
  rows: AdminNotifFailedRow[]; onRetry: (id: string) => void; onRetryAll: () => void;
  retrying: string | null; onExport: () => void; onDetails: (r: AdminNotifFailedRow) => void;
}) {
  const navigate = useNavigate();
  const { isOnline } = useOnlinePresence();
  return (
    <Card className="overflow-hidden">
      <div className="p-3 border-b border-border flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div>
          <h3 className="text-foreground text-sm font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            Failed Deliveries & Retry Queue
            {rows.length > 0 && (
              <span className="rounded bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 text-xs text-red-400">{rows.length}</span>
            )}
          </h3>
          <p className="text-muted-foreground text-xs mt-0.5">Notifications requiring attention or manual retry</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={onRetryAll}
            disabled={!rows.length}
            className="px-3 h-11 text-xs bg-amber-600 hover:bg-amber-700 text-white font-medium"
          >
            <RotateCw className="h-3.5 w-3.5" /> Retry All Failed
          </Button>
          <Button variant="secondary" onClick={onExport} className="px-3 h-11 text-xs font-medium">
            <Download className="h-3.5 w-3.5" /> Export Log
          </Button>
        </div>
      </div>
      {!rows.length ? (
        <div className="p-8 text-center text-xs text-muted-foreground">
          <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-400" />
          <div className="mt-2 font-medium text-foreground text-sm">No failed deliveries</div>
          <div className="mt-1">All notifications delivered successfully in the last 24h.</div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full sd-stack">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">User</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Channel</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Type</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Failure Reason</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Retry Status</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Timestamp</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Quick Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => {
                const exhausted = false;
                return (
                  <tr key={r.delivery_id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
                          {r.user?.avatar_url
                            ? <img src={r.user.avatar_url} alt="" className="h-full w-full object-cover" />
                            : <User className="h-4 w-4 text-muted-foreground" />}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-foreground truncate flex items-center gap-1.5">
                            {r.user?.id && <InlineDot online={isOnline(r.user.id)} />}
                            <span className="truncate">{r.user?.email ?? r.user?.full_name ?? "Unknown"}</span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {r.user ? (
                              <button
                                onClick={() => navigate(`/admin/users/${r.user!.id}`)}
                                className="text-purple-400 hover:text-purple-300 font-mono min-h-11 inline-flex items-center"
                              >
                                {shortUsrId(r.user.public_user_id)}
                              </button>
                            ) : "—"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap"><ChannelCell ch={r.channel} /></td>
                    <td className="px-3 py-2 whitespace-nowrap"><TypePill type={r.type} /></td>
                    <td className="px-3 py-2">
                      <div className="flex items-start gap-1.5">
                        <AlertCircle className="h-3.5 w-3.5 text-red-400 mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-xs text-red-300 truncate max-w-[240px]">{r.provider_response ?? "Unknown error"}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">Attempt {r.attempt_count} of 3</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {exhausted ? (
                        <span className="px-2 py-1 bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold rounded flex items-center gap-1.5 w-fit">
                          <XCircle className="h-3 w-3" /> Failed {r.attempt_count}/3
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold rounded">
                          Attempt {r.attempt_count}/3
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">{formatRelative(r.failed_at)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        {r.user && (
                          <button
                            onClick={() => navigate(`/admin/users/${r.user!.id}`)}
                            title="View User Profile"
                            className="px-2 py-1 bg-purple-500/10 border border-purple-500/20 text-purple-400 hover:bg-purple-500/20 rounded text-xs font-semibold transition-all flex items-center gap-1 min-h-11"
                          >
                            <User className="h-3 w-3" /> User
                          </button>
                        )}
                        {r.dispute_id && (
                          <button
                            onClick={() => navigate(`/admin/disputes/${r.dispute_id}`)}
                            title={`View Dispute ${shortDisId(r.dispute_id)}`}
                            className="px-2 py-1 bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 rounded text-xs font-semibold transition-all flex items-center gap-1 min-h-11"
                          >
                            <Scale className="h-3 w-3" /> {shortDisId(r.dispute_id)}
                          </button>
                        )}
                        {r.transaction && (
                          <button
                            onClick={() => navigate(`/admin/transactions/${r.transaction!.id}`)}
                            title={`View Transaction ${shortTxnCode(r.transaction)}`}
                            className="px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 rounded text-xs font-semibold transition-all flex items-center gap-1 min-h-11"
                          >
                            <Receipt className="h-3 w-3" /> {shortTxnCode(r.transaction)}
                          </button>
                        )}
                        <button
                          onClick={() => onRetry(r.delivery_id)}
                          disabled={retrying === r.delivery_id}
                          title="Retry Delivery"
                          className="px-2 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 rounded text-xs font-semibold transition-all flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed min-h-11"
                        >
                          <RotateCw className={`h-3 w-3 ${retrying === r.delivery_id ? "animate-spin" : ""}`} /> Retry
                        </button>
                        <button
                          onClick={() => onDetails(r)}
                          title="View Details"
                          className="px-2 py-1 bg-muted border border-border text-muted-foreground hover:bg-muted/80 rounded text-xs font-semibold transition-all flex items-center gap-1 min-h-11"
                        >
                          <Info className="h-3 w-3" /> Details
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ---------- Delivery performance ----------
function DeliveryPerf({ perf }: { perf: any[] }) {
  const meta: Record<string, { name: string; sub: string; iconBg: string; barBg: string; iconColor: string; numberColor: string }> = {
    in_app: { name: "In-App Notifications", sub: "Real-time platform notifications", iconBg: "bg-blue-500/10 border-blue-500/20", iconColor: "text-blue-400", barBg: "bg-blue-500", numberColor: "text-blue-400" },
    email: { name: "Email Notifications", sub: "Transaction confirmations & alerts", iconBg: "bg-purple-500/10 border-purple-500/20", iconColor: "text-purple-400", barBg: "bg-purple-500", numberColor: "text-purple-400" },
    sms: { name: "SMS Notifications", sub: "Security codes & urgent alerts", iconBg: "bg-orange-500/10 border-orange-500/20", iconColor: "text-orange-400", barBg: "bg-orange-500", numberColor: "text-orange-400" },
    push: { name: "Push Notifications", sub: "Mobile push alerts", iconBg: "bg-emerald-500/10 border-emerald-500/20", iconColor: "text-emerald-400", barBg: "bg-emerald-500", numberColor: "text-emerald-400" },
  };
  const rateColor = (rate: number) => (rate >= 95 ? "text-emerald-400" : rate >= 90 ? "text-orange-400" : "text-red-400");
  return (
    <Card className="overflow-hidden">
      <div className="p-3 border-b border-border">
        <h3 className="text-foreground text-sm font-semibold">Delivery Performance</h3>
        <p className="text-muted-foreground text-xs mt-0.5">Last 24 hours breakdown by channel</p>
      </div>
      <div className="p-3">
        <div className="space-y-4">
          {perf.map((p) => {
            const m = meta[p.channel] ?? meta.in_app;
            const Icon = channelIcon(p.channel);
            return (
              <div key={p.channel}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 border rounded-lg flex items-center justify-center ${m.iconBg}`}>
                      <Icon className={`h-4 w-4 ${m.iconColor}`} />
                    </div>
                    <div>
                      <h4 className="text-foreground text-xs font-semibold">{m.name}</h4>
                      <p className="text-muted-foreground text-xs">{m.sub}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-lg font-bold ${m.numberColor}`}>{p.sent.toLocaleString()}</div>
                    <div className={`text-xs font-semibold ${rateColor(p.rate)}`}>{p.rate}% delivered</div>
                  </div>
                </div>
                <div className="w-full bg-muted rounded-full h-1.5 mt-2">
                  <div className={`${m.barBg} h-1.5 rounded-full transition-all`} style={{ width: `${p.rate}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

// ---------- Broadcast composer ----------
function BroadcastComposer({ onSent, titleRef }: { onSent: () => void; titleRef?: React.RefObject<HTMLInputElement> }) {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState<BroadcastPayload["priority"]>("normal");
  const [audience, setAudience] = useState<BroadcastPayload["audience"]>("all");
  const [channels, setChannels] = useState<BroadcastPayload["channels"]>(["in_app"]);
  const { onlineCount } = useOnlinePresence();

  const m = useMutation({
    mutationFn: () => sendBroadcast({ title: title.trim(), message: message.trim(), priority, audience, channels }),
    onSuccess: (r) => {
      toast.success(`Broadcast sent to ${r.recipients} users (${r.deliveries} deliveries queued)`);
      setTitle(""); setMessage(""); onSent();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleCh = (c: "in_app" | "email" | "sms") =>
    setChannels((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);

  return (
    <Card className="overflow-hidden">
      <div className="p-3 border-b border-border">
        <h3 className="text-foreground text-sm font-semibold flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-amber-400" />
          Broadcast Message
        </h3>
        <p className="text-muted-foreground text-xs mt-0.5">Send system-wide announcements with caution</p>
      </div>
      <div className="p-3 space-y-3">
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
          <div>
            <h4 className="text-amber-400 font-semibold text-xs mb-0.5">Broadcast Caution</h4>
            <p className="text-amber-300/80 text-xs leading-relaxed">
              Messages will be sent to all selected users immediately. Review content carefully before sending. This action cannot be undone.
            </p>
          </div>
        </div>

        <div>
          <Label className="text-muted-foreground text-xs font-medium mb-1.5 block">
            Message Title <span className="text-red-400">*</span>
          </Label>
          <Input
            ref={titleRef}
            value={title}
            maxLength={60}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Scheduled Maintenance Notice"
            className="h-11 text-xs"
          />
          <p className="text-muted-foreground/70 text-xs mt-1">Keep it clear and actionable (max 60 characters)</p>
        </div>

        <div>
          <Label className="text-muted-foreground text-xs font-medium mb-1.5 block">Message Body</Label>
          <Textarea
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="We will be performing scheduled maintenance..."
            className="resize-none text-xs"
          />
        </div>

        <div>
          <Label className="text-muted-foreground text-xs font-medium mb-1.5 block">Priority Level</Label>
          <Select value={priority} onValueChange={(v) => setPriority(v as any)}>
            <SelectTrigger className="h-11 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low Priority</SelectItem>
              <SelectItem value="normal">Medium Priority</SelectItem>
              <SelectItem value="high">High Priority</SelectItem>
              <SelectItem value="urgent">Critical Alert</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-muted-foreground text-xs font-medium mb-1.5 block">Target Audience</Label>
          <Select value={audience} onValueChange={(v) => setAudience(v as any)}>
            <SelectTrigger className="h-11 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Users</SelectItem>
              <SelectItem value="buyers">Buyers (users with buyer role)</SelectItem>
              <SelectItem value="sellers">Sellers (users with seller role)</SelectItem>
              <SelectItem value="verified">Verified Users (identity approved)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-muted-foreground/70 text-xs mt-1">Respects opt-out preferences · Audit logged</p>
          <p className="text-emerald-400/90 text-xs mt-1 flex items-center gap-1.5">
            {/* Static: the header "Live" chip owns this screen's live dot. */}
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
            ≈ {onlineCount} recipient{onlineCount === 1 ? "" : "s"} online right now
          </p>
        </div>

        <div>
          <Label className="text-muted-foreground text-xs font-medium mb-1.5 block">Delivery Channels</Label>
          <div className="space-y-1.5">
            {(["in_app", "email", "sms"] as const).map((c) => (
              <label key={c} className="flex items-center gap-2 cursor-pointer min-h-11">
                <Checkbox checked={channels.includes(c)} onCheckedChange={() => toggleCh(c)} />
                <span className="text-foreground text-xs">
                  {c === "in_app" ? "In-App Notification" : channelLabel(c)}
                </span>
              </label>
            ))}
          </div>
        </div>

        <Button
          className="w-full h-11 text-xs bg-amber-600 hover:bg-amber-700 text-white font-semibold"
          disabled={m.isPending || !title.trim() || !message.trim() || !channels.length}
          onClick={() => m.mutate()}
        >
          <Send className="h-3.5 w-3.5" /> {m.isPending ? "Sending…" : "Send Broadcast"}
        </Button>
      </div>
    </Card>
  );
}

// ---------- Recent activity ----------
function RecentActivity({ rows, onRefresh, onFilter }: {
  rows: AdminNotifRecentRow[]; onRefresh: () => void; onFilter: () => void;
}) {
  const { isOnline } = useOnlinePresence();
  return (
    <Card className="overflow-hidden">
      <div className="p-3 border-b border-border flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div>
          <h3 className="text-foreground text-sm font-semibold">Recent Notification Activity</h3>
          <p className="text-muted-foreground text-xs mt-0.5">Real-time delivery log with status tracking</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onRefresh} className="h-11 text-xs font-medium">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Button variant="secondary" size="sm" onClick={onFilter} className="h-11 text-xs font-medium">
            <Filter className="h-3.5 w-3.5" /> Filter
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full sd-stack">
          <thead className="bg-muted/40">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Timestamp</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">User</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Type</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Channel</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Message</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.notification_id} className="hover:bg-muted/30 transition-colors">
                <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">
                  {formatRelative(r.last_seen_at ?? r.created_at)}
                  {(r.occurrence_count ?? 1) > 1 && (
                    <div className="text-xs text-muted-foreground/80">
                      first seen {formatRelative(r.first_seen_at ?? r.created_at)}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
                      {r.user?.avatar_url
                        ? <img src={r.user.avatar_url} alt="" className="h-full w-full object-cover" />
                        : <User className="h-4 w-4 text-muted-foreground" />}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-foreground truncate flex items-center gap-1.5">
                        {r.user?.id && <InlineDot online={isOnline(r.user.id)} />}
                        <span className="truncate">{r.user?.email ?? r.user?.full_name ?? "—"}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">ID: {shortUsrId(r.user?.public_user_id)}</div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2 whitespace-nowrap"><TypePill type={r.type} /></td>
                <td className="px-3 py-2 whitespace-nowrap"><ChannelCell ch={r.channel} /></td>
                <td className="px-3 py-2 text-xs text-foreground max-w-xs truncate">
                  {r.title}
                  {(r.occurrence_count ?? 1) > 1 && (
                    <span className="ml-1.5 text-xs text-muted-foreground">×{r.occurrence_count} occurrences</span>
                  )}
                  {r.resolved_at && (
                    <span className="ml-1.5 text-xs text-emerald-400">resolved</span>
                  )}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className={`px-2 py-1 border text-xs font-semibold rounded flex items-center gap-1.5 w-fit ${statusPill(r.status)}`}>
                    {r.status === "failed" ? <XCircle className="h-3 w-3" /> : (r.status === "pending" || r.status === "retrying") ? <Clock className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                    {statusLabel(r.status)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---------- Page ----------
export default function AdminNotifications() {
  const qc = useQueryClient();
  useRealtimeAdminNotifications();
  const [filters, setFilters] = useState<FiltersState>({ q: "", channel: "all", status: "all", type: "all", failedOnly: false });
  const [retrying, setRetrying] = useState<string | null>(null);
  const [details, setDetails] = useState<AdminNotifFailedRow | null>(null);
  const filtersRef = useRef<HTMLDivElement>(null);
  const broadcastRef = useRef<HTMLDivElement>(null);
  const broadcastTitleRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-notifications"],
    queryFn: fetchAdminNotifications,
    refetchInterval: 30_000,
  });

  const retryMut = useMutation({
    mutationFn: retryNotificationDelivery,
    onMutate: (id) => setRetrying(id),
    onSuccess: () => { toast.success("Retry queued"); qc.invalidateQueries({ queryKey: ["admin-notifications"] }); },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setRetrying(null),
  });

  const failedFiltered = useMemo(() => {
    if (!data) return [];
    const q = filters.q.trim().toLowerCase();
    return data.failed.filter((r) => {
      if (filters.channel !== "all" && r.channel !== filters.channel) return false;
      if (filters.type !== "all" && r.type !== filters.type) return false;
      if (q) {
        const hay = `${r.title} ${r.user?.full_name ?? ""} ${r.user?.email ?? ""} ${r.provider_response ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data, filters]);

  const recentFiltered = useMemo(() => {
    if (!data) return [];
    const q = filters.q.trim().toLowerCase();
    return data.recent.filter((r) => {
      if (filters.failedOnly && r.status !== "failed") return false;
      if (filters.channel !== "all" && r.channel !== filters.channel) return false;
      if (filters.status !== "all" && r.status !== filters.status) return false;
      if (filters.type !== "all" && r.type !== filters.type) return false;
      if (q) {
        const hay = `${r.title} ${r.user?.full_name ?? ""} ${r.user?.email ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data, filters]);

  const handleExport = () => {
    if (!data) return;
    const rows = [
      ["type", "title", "channel", "status", "recipient_email", "attempts", "error", "when"],
      ...data.failed.map((r) => ["failed", r.title, r.channel, "failed", r.user?.email ?? "", String(r.attempt_count), r.provider_response ?? "", r.failed_at]),
      ...data.recent.map((r) => [r.type, r.title, r.channel, r.status, r.user?.email ?? "", "", "", r.created_at]),
    ];
    const csv = rows.map((row) => row.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `notifications-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const handleExportFailed = () => {
    if (!data) return;
    const rows = [
      ["title", "type", "channel", "recipient_email", "attempts", "error", "failed_at"],
      ...data.failed.map((r) => [r.title, r.type ?? "", r.channel, r.user?.email ?? "", String(r.attempt_count), r.provider_response ?? "", r.failed_at]),
    ];
    const csv = rows.map((row) => row.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `failed-deliveries-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const bulkRetryMut = useMutation({
    mutationFn: () => retryAllFailedNotifications({ channel: "email" }),
    onSuccess: (res) => {
      toast.success(`Queued ${res.retried} deliveries for retry`);
      qc.invalidateQueries({ queryKey: ["admin-notifications"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const handleRetryAll = () => {
    if (!failedFiltered.length) return;
    bulkRetryMut.mutate();
  };

  const scrollToBroadcast = () => {
    broadcastRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => broadcastTitleRef.current?.focus(), 400);
  };
  const scrollToFilters = () => filtersRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  const clearFilters = () => setFilters({ q: "", channel: "all", status: "all", type: "all", failedOnly: false });

  return (
    <AdminLayout
      title="Notification Center"
      hideDefaultHeaders
      fullBleed
      headerSlot={
        <HeaderBar
          lastSync={data?.last_sync}
          onBroadcast={scrollToBroadcast}
          onExport={handleExport}
        />
      }
    >
      <div className="sd-page sd-page-y sd-section-y">
        {isLoading && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
        )}
        {isError && (
          <Card className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Failed to load notifications.</p>
            <Button variant="outline" size="sm" className="mt-3 h-11 text-xs" onClick={() => refetch()}>
              <RefreshCw className="h-3.5 w-3.5" /> Retry
            </Button>
          </Card>
        )}
        {data && (
          <>
            <KpiCards kpis={data.kpis} />
            <div className="rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-300 flex flex-wrap items-center gap-x-4 gap-y-1">
              <span><strong>Email sender:</strong> onboarding@resend.dev (Resend restricts this to the account owner until a custom domain is verified)</span>
              <span><strong>SMS:</strong> No provider configured: SMS rows are queued and not sent.</span>
            </div>
            <FiltersBar
              f={filters}
              setF={setFilters}
              onSearch={() => refetch()}
              onClear={clearFilters}
              filtersRef={filtersRef}
            />
            <FailedTable
              rows={failedFiltered}
              onRetry={(id) => retryMut.mutate(id)}
              onRetryAll={handleRetryAll}
              retrying={retrying}
              onExport={handleExportFailed}
              onDetails={(r) => setDetails(r)}
            />
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
              <div className="xl:col-span-2">
                <DeliveryPerf perf={data.delivery_performance} />
              </div>
              <div ref={broadcastRef}>
                <BroadcastComposer titleRef={broadcastTitleRef} onSent={() => refetch()} />
              </div>
            </div>
            <RecentActivity rows={recentFiltered} onRefresh={() => refetch()} onFilter={scrollToFilters} />
          </>
        )}
      </div>

      <Dialog open={!!details} onOpenChange={(o) => !o && setDetails(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Delivery Details</DialogTitle>
            <DialogDescription>Full context for this failed delivery.</DialogDescription>
          </DialogHeader>
          {details && (
            <div className="space-y-3 text-sm">
              <div>
                <div className="text-xs uppercase text-muted-foreground tracking-wider mb-1">Title</div>
                <div className="text-foreground">{details.title}</div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground tracking-wider mb-1">Message</div>
                <div className="text-muted-foreground whitespace-pre-wrap">{details.message}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs uppercase text-muted-foreground tracking-wider mb-1">Channel</div>
                  <ChannelCell ch={details.channel} />
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground tracking-wider mb-1">Type</div>
                  <TypePill type={details.type} />
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground tracking-wider mb-1">Attempts</div>
                  <div className="text-foreground tabular-nums">{details.attempt_count}/3</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground tracking-wider mb-1">Failed</div>
                  <div className="text-foreground">{formatRelative(details.failed_at)}</div>
                </div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground tracking-wider mb-1">Provider Response</div>
                <div className="rounded border border-red-500/20 bg-red-500/10 p-3 text-red-300 text-xs">
                  {details.provider_response ?? "No response captured"}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground tracking-wider mb-1">Recipient</div>
                <div className="text-foreground">{details.user?.email ?? "—"}</div>
                <div className="text-xs text-muted-foreground font-mono">{shortUsrId(details.user?.public_user_id)}</div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}