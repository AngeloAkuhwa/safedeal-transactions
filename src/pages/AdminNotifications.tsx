import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Send, AlertTriangle, Smartphone, Mail, Bell, RefreshCw, Search,
  Filter, Megaphone, Eye, Receipt, Scale, User, CheckCircle2, XCircle, Info, Download,
} from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/sonner";
import { formatRelative } from "@/components/admin/dashboard/relative";
import {
  fetchAdminNotifications, retryNotificationDelivery, sendBroadcast,
  type AdminNotifFailedRow, type AdminNotifRecentRow, type BroadcastPayload,
} from "@/services/admin-notifications.service";

// ---------- helpers ----------
const channelIcon = (ch: string) => {
  if (ch === "email") return Mail;
  if (ch === "sms") return Smartphone;
  if (ch === "push") return Bell;
  return Bell;
};
const channelLabel = (ch: string) => ({ in_app: "In-App", email: "Email", sms: "SMS", push: "Push" } as any)[ch] ?? ch;

const statusPill = (status: string) => {
  const map: Record<string, string> = {
    sent: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    read: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    failed: "bg-red-500/10 text-red-400 border-red-500/20",
    pending: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  };
  return map[status] ?? "bg-muted text-muted-foreground border-border";
};

// ---------- Header ----------
function HeaderBar({ lastSync, onBroadcast, onExport }: { lastSync?: string; onBroadcast: () => void; onExport: () => void }) {
  return (
    <div className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-4 lg:px-8 lg:py-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-foreground">Notification Center</h1>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Monitor deliveries, retry failures, and broadcast to users
            {lastSync && <> · Last sync {formatRelative(lastSync)}</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onExport}>
            <Download className="h-4 w-4" /> Export Report
          </Button>
          <Button size="sm" onClick={onBroadcast} className="bg-blue-600 hover:bg-blue-500 text-white">
            <Megaphone className="h-4 w-4" /> Broadcast Message
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------- KPI cards ----------
function KpiCards({ kpis }: { kpis: any }) {
  const cards = [
    { label: "Sent Today", value: kpis.sent_today, icon: Send, color: "blue" },
    { label: "Failed Deliveries", value: kpis.failed_today, icon: AlertTriangle, color: "red" },
    { label: "SMS Failures", value: kpis.sms_failures, icon: Smartphone, color: "orange" },
    { label: "Email Failures", value: kpis.email_failures, icon: Mail, color: "purple" },
    { label: "In-App Delivery Rate", value: `${kpis.in_app_rate}%`, icon: Bell, color: "emerald" },
    { label: "Retry Queue", value: kpis.retry_queue, icon: RefreshCw, color: "amber" },
  ];
  const bg: Record<string, string> = {
    blue: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    red: "bg-red-500/10 text-red-400 border-red-500/20",
    orange: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    purple: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    amber: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  };
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <Card key={c.label} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-2xl font-semibold tabular-nums text-foreground">{c.value}</div>
                <div className="mt-1 text-xs text-muted-foreground">{c.label}</div>
              </div>
              <div className={`h-9 w-9 rounded-lg border flex items-center justify-center ${bg[c.color]}`}>
                <Icon className="h-4 w-4" />
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ---------- Filters ----------
interface FiltersState { q: string; channel: string; status: string; type: string; failedOnly: boolean }
function FiltersBar({ f, setF }: { f: FiltersState; setF: (v: FiltersState) => void }) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
        <Filter className="h-4 w-4 text-muted-foreground" /> Search & Filter Notifications
      </div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
        <div className="relative lg:col-span-2">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search by user, title, error…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        </div>
        <Select value={f.channel} onValueChange={(v) => setF({ ...f, channel: v })}>
          <SelectTrigger><SelectValue placeholder="Channel" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Channels</SelectItem>
            <SelectItem value="in_app">In-App</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="sms">SMS</SelectItem>
            <SelectItem value="push">Push</SelectItem>
          </SelectContent>
        </Select>
        <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v })}>
          <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>
        <Select value={f.type} onValueChange={(v) => setF({ ...f, type: v })}>
          <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="transaction_update">Transaction</SelectItem>
            <SelectItem value="payment_update">Payment</SelectItem>
            <SelectItem value="delivery_update">Delivery</SelectItem>
            <SelectItem value="dispute_update">Dispute</SelectItem>
            <SelectItem value="verification_update">Verification</SelectItem>
            <SelectItem value="security_alert">Security</SelectItem>
            <SelectItem value="system_message">System</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Switch checked={f.failedOnly} onCheckedChange={(v) => setF({ ...f, failedOnly: v })} />
          Failed deliveries only
        </label>
      </div>
    </Card>
  );
}

// ---------- Failed table ----------
function FailedTable({ rows, onRetry, retrying }: { rows: AdminNotifFailedRow[]; onRetry: (id: string) => void; retrying: string | null }) {
  const navigate = useNavigate();
  if (!rows.length) {
    return <Card className="p-10 text-center text-sm text-muted-foreground">
      <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400" />
      <div className="mt-2 font-medium text-foreground">No failed deliveries</div>
      <div className="mt-1">All notifications delivered successfully in the last 24h.</div>
    </Card>;
  }
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <AlertTriangle className="h-4 w-4 text-red-400" /> Failed Deliveries & Retry Queue
          <span className="rounded-full bg-red-500/10 border border-red-500/20 px-2 py-0.5 text-xs text-red-400">{rows.length}</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">Recipient</th>
              <th className="px-4 py-2 text-left">Notification</th>
              <th className="px-4 py-2 text-left">Channel</th>
              <th className="px-4 py-2 text-left">Failure</th>
              <th className="px-4 py-2 text-left">Attempts</th>
              <th className="px-4 py-2 text-left">Failed</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => {
              const Icon = channelIcon(r.channel);
              return (
                <tr key={r.delivery_id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                        {r.user?.avatar_url
                          ? <img src={r.user.avatar_url} alt="" className="h-full w-full object-cover" />
                          : <User className="h-4 w-4 text-muted-foreground" />}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-medium text-foreground">{r.user?.full_name ?? "Unknown"}</div>
                        <div className="truncate text-xs text-muted-foreground">{r.user?.email ?? "—"}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="max-w-[280px] truncate text-foreground">{r.title}</div>
                    <div className="max-w-[280px] truncate text-xs text-muted-foreground">{r.type?.replace(/_/g, " ")}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs text-foreground">
                      <Icon className="h-3.5 w-3.5" /> {channelLabel(r.channel)}
                    </span>
                  </td>
                  <td className="px-4 py-3 max-w-[260px]">
                    <div className="truncate text-xs text-red-400">{r.provider_response ?? "Unknown error"}</div>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">{r.attempt_count}/3</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatRelative(r.failed_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {r.user && (
                        <Button variant="ghost" size="icon" title="View user" onClick={() => navigate(`/admin/users/${r.user!.id}`)}>
                          <User className="h-4 w-4" />
                        </Button>
                      )}
                      {r.transaction && (
                        <Button variant="ghost" size="icon" title="View transaction" onClick={() => navigate(`/admin/transactions/${r.transaction!.id}`)}>
                          <Receipt className="h-4 w-4" />
                        </Button>
                      )}
                      {r.dispute_id && (
                        <Button variant="ghost" size="icon" title="View dispute" onClick={() => navigate(`/admin/disputes/${r.dispute_id}`)}>
                          <Scale className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        size="sm" variant="outline"
                        disabled={!r.retriable || retrying === r.delivery_id}
                        onClick={() => onRetry(r.delivery_id)}
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${retrying === r.delivery_id ? "animate-spin" : ""}`} />
                        Retry
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---------- Delivery performance ----------
function DeliveryPerf({ perf }: { perf: any[] }) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2 text-sm font-medium text-foreground">
        <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Delivery Performance (24h)
      </div>
      <div className="space-y-4">
        {perf.map((p) => {
          const Icon = channelIcon(p.channel);
          return (
            <div key={p.channel}>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-1.5 text-foreground">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" /> {channelLabel(p.channel)}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {p.sent}/{p.total} · <span className="text-emerald-400 font-medium">{p.rate}%</span>
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${p.rate}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ---------- Broadcast composer ----------
function BroadcastComposer({ onSent }: { onSent: () => void }) {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState<BroadcastPayload["priority"]>("normal");
  const [audience, setAudience] = useState<BroadcastPayload["audience"]>("all");
  const [channels, setChannels] = useState<BroadcastPayload["channels"]>(["in_app"]);

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
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2 text-sm font-medium text-foreground">
        <Megaphone className="h-4 w-4 text-blue-400" /> Broadcast Message
      </div>
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-300">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <div>Broadcasts respect user notification preferences (opt-outs are skipped). This action is audited.</div>
      </div>
      <div className="space-y-3">
        <div>
          <Label className="text-xs">Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Planned maintenance tonight" />
        </div>
        <div>
          <Label className="text-xs">Message</Label>
          <Textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Full message body…" />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label className="text-xs">Priority</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Audience</Label>
            <Select value={audience} onValueChange={(v) => setAudience(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All users</SelectItem>
                <SelectItem value="buyers">Buyers only</SelectItem>
                <SelectItem value="sellers">Sellers only</SelectItem>
                <SelectItem value="verified">Verified only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label className="text-xs">Channels</Label>
          <div className="mt-2 flex flex-wrap gap-4">
            {(["in_app", "email", "sms"] as const).map((c) => (
              <label key={c} className="flex items-center gap-2 text-sm text-foreground">
                <Checkbox checked={channels.includes(c)} onCheckedChange={() => toggleCh(c)} />
                {channelLabel(c)}
              </label>
            ))}
          </div>
        </div>
        <Button
          className="w-full bg-blue-600 hover:bg-blue-500 text-white"
          disabled={m.isPending || !title.trim() || !message.trim() || !channels.length}
          onClick={() => m.mutate()}
        >
          <Send className="h-4 w-4" /> {m.isPending ? "Sending…" : "Send Broadcast"}
        </Button>
      </div>
    </Card>
  );
}

// ---------- Recent activity ----------
function RecentActivity({ rows }: { rows: AdminNotifRecentRow[] }) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border px-4 py-3 text-sm font-medium text-foreground flex items-center gap-2">
        <Bell className="h-4 w-4 text-muted-foreground" /> Recent Notification Activity
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">Notification</th>
              <th className="px-4 py-2 text-left">Recipient</th>
              <th className="px-4 py-2 text-left">Channel</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">When</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => {
              const Icon = channelIcon(r.channel);
              return (
                <tr key={r.notification_id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="max-w-[320px] truncate text-foreground">{r.title}</div>
                    <div className="text-xs text-muted-foreground">{r.type?.replace(/_/g, " ")}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="truncate text-foreground">{r.user?.full_name ?? "—"}</div>
                    <div className="truncate text-xs text-muted-foreground">{r.user?.email ?? ""}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Icon className="h-3.5 w-3.5" /> {channelLabel(r.channel)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${statusPill(r.status)}`}>
                      {r.status === "failed" ? <XCircle className="h-3 w-3" /> : r.status === "pending" ? <RefreshCw className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatRelative(r.created_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---------- Page ----------
export default function AdminNotifications() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState<FiltersState>({ q: "", channel: "all", status: "all", type: "all", failedOnly: false });
  const [retrying, setRetrying] = useState<string | null>(null);
  const [showComposer, setShowComposer] = useState(false);

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

  return (
    <AdminLayout
      title="Notification Center"
      hideDefaultHeaders
      fullBleed
      headerSlot={
        <HeaderBar
          lastSync={data?.last_sync}
          onBroadcast={() => setShowComposer((s) => !s)}
          onExport={handleExport}
        />
      }
    >
      <div className="mx-auto w-full max-w-[1400px] space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        {isLoading && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
        )}
        {isError && (
          <Card className="p-6 text-center">
            <p className="text-sm text-muted-foreground">Failed to load notifications.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" /> Retry
            </Button>
          </Card>
        )}
        {data && (
          <>
            <KpiCards kpis={data.kpis} />
            <FiltersBar f={filters} setF={setFilters} />
            <div className="grid gap-5 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <FailedTable rows={failedFiltered} onRetry={(id) => retryMut.mutate(id)} retrying={retrying} />
              </div>
              <div className="space-y-5">
                <DeliveryPerf perf={data.delivery_performance} />
                {showComposer && <BroadcastComposer onSent={() => { setShowComposer(false); refetch(); }} />}
              </div>
            </div>
            <RecentActivity rows={recentFiltered} />
          </>
        )}
      </div>
    </AdminLayout>
  );
}