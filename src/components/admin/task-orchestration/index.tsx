import { useEffect, useMemo, useState } from "react";
import {
  ShieldAlert, Bolt, UserCheck, RotateCw, UserPlus, ArrowLeftRight,
  ArrowUpRightFromSquare, Download, Save, RefreshCcw, Lock, Info,
  Sliders, Filter, Bell, Circle, Eye, Ban, Users, Gauge, Loader2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  fetchOrchestrationOverview, runOrchestrationAction,
  type OrchestrationOverview, type AgentRosterEntry, type UnassignedTask,
  type LiveTask, type AssignmentRulesConfig, type OrchestrationPriority,
} from "@/services/task-orchestration.service";

/* ============================================================ */
/*  Helpers                                                     */
/* ============================================================ */

function initialsOf(a?: AgentRosterEntry | null): string {
  if (!a) return "?";
  const f = (a.first_name ?? "").trim();
  const l = (a.last_name ?? "").trim();
  return `${f[0] ?? ""}${l[0] ?? ""}`.toUpperCase() || (a.email?.[0] ?? "?").toUpperCase();
}
function nameOf(a?: AgentRosterEntry | null): string {
  if (!a) return "—";
  const name = [a.first_name, a.last_name].filter(Boolean).join(" ").trim();
  return name || a.email || "Agent";
}
function shortNameOf(a?: AgentRosterEntry | null): string {
  if (!a) return "—";
  const first = a.first_name || a.email?.split("@")[0] || "Agent";
  const last = a.last_name ? ` ${a.last_name[0]}.` : "";
  return `${first}${last}`;
}
function currencyFmt(amount: number | null, currency: string): string {
  if (amount == null) return "—";
  try {
    return new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch { return `${currency} ${amount.toLocaleString()}`; }
}
function relative(ts: string | null): string {
  if (!ts) return "—";
  try { return formatDistanceToNow(new Date(ts), { addSuffix: true }); } catch { return "—"; }
}
function relativeShort(ts: string | null): string {
  if (!ts) return "—";
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}
function humanize(s: string): string {
  return s.replace(/[_-]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}
function priorityClass(p: OrchestrationPriority): string {
  return {
    critical: "bg-destructive/10 text-destructive border-destructive/30",
    high: "bg-amber-500/10 text-amber-500 border-amber-500/30",
    medium: "bg-primary/10 text-primary border-primary/30",
    low: "bg-muted text-muted-foreground border-border",
  }[p];
}
function slaClass(s: string): string {
  if (s === "overdue" || s === "breached") return "bg-destructive/10 text-destructive";
  if (s === "at_risk") return "bg-amber-500/10 text-amber-500";
  return "bg-emerald-500/10 text-emerald-500";
}
function availabilityAccent(a: string): string {
  return {
    available: "border-l-emerald-500 bg-gradient-to-r from-emerald-500/[0.06] to-transparent",
    active: "border-l-primary bg-gradient-to-r from-primary/[0.06] to-transparent",
    busy: "border-l-amber-500 bg-gradient-to-r from-amber-500/[0.06] to-transparent",
    at_capacity: "border-l-destructive bg-gradient-to-r from-destructive/[0.06] to-transparent",
    offline: "border-l-muted-foreground bg-gradient-to-r from-muted-foreground/[0.03] to-transparent opacity-60",
  }[a] ?? "border-l-border";
}
function availabilityLabel(a: string, label: string): string {
  return {
    available: "Available", active: "Active", busy: "Busy",
    at_capacity: "At Capacity", offline: "Offline",
  }[a] ?? label;
}
function availabilityTextColor(a: string): string {
  return {
    available: "text-emerald-500", active: "text-primary", busy: "text-amber-500",
    at_capacity: "text-amber-500", offline: "text-muted-foreground",
  }[a] ?? "text-muted-foreground";
}

/* ============================================================ */
/*  Header                                                      */
/* ============================================================ */

export function TaskOrchestrationHeader({
  autoAssignActive, onExport, onOpenMenu,
}: { autoAssignActive: boolean; onExport: () => void; onOpenMenu?: () => void }) {
  return (
    <div className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 lg:px-8">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold leading-tight text-foreground lg:text-2xl">
            Task Orchestration &amp; Agent Load Management
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Senior admin workforce control · Real-time assignment operations
          </p>
        </div>
        <div className="flex items-center gap-2 lg:gap-3">
          <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-card/60 px-3 py-1.5 text-sm">
            <span className={cn("h-2 w-2 rounded-full",
              autoAssignActive ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground")} />
            <span className="text-muted-foreground">Auto-Assign:</span>
            <span className={cn("font-medium", autoAssignActive ? "text-emerald-500" : "text-muted-foreground")}>
              {autoAssignActive ? "Active" : "Off"}
            </span>
          </div>
          <button
            type="button"
            className="relative hidden h-10 w-10 items-center justify-center rounded-full border border-border bg-card/60 text-muted-foreground transition-colors hover:text-foreground lg:inline-flex"
          >
            <Bell className="h-4 w-4" />
            <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-destructive" />
          </button>
          <Button onClick={onExport} className="rounded-full">
            <Download className="mr-2 h-4 w-4" /> Export Report
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================ */
/*  Summary KPI cards                                           */
/* ============================================================ */

export function OrchestrationSummaryCards({ kpis }: { kpis: OrchestrationOverview["kpis"] }) {
  const cards = [
    { label: "Unassigned Tasks", value: kpis.unassigned, delta: `+${kpis.unassigned_last_hour} in last hour`, deltaClass: "text-destructive", accent: "border-l-destructive" },
    { label: "Active Agents", value: kpis.active_agents, delta: `${kpis.available_agents} available`, deltaClass: "text-emerald-500", accent: "border-l-emerald-500" },
    { label: "At Capacity", value: kpis.at_capacity, delta: kpis.at_capacity ? "Rebalance needed" : "Load balanced", deltaClass: "text-amber-500", accent: "border-l-amber-500" },
    { label: "Assigned Today", value: kpis.assigned_today, delta: kpis.assigned_delta_pct == null ? "no comparison" : `${kpis.assigned_delta_pct >= 0 ? "+" : ""}${kpis.assigned_delta_pct}% vs yesterday`, deltaClass: "text-muted-foreground", accent: "" },
    { label: "Overdue Tasks", value: kpis.overdue, delta: kpis.overdue ? "Escalation needed" : "None overdue", deltaClass: "text-destructive", accent: "border-l-destructive" },
    { label: "Avg First Action", value: `${kpis.avg_first_action_minutes}m`, delta: "server-derived", deltaClass: "text-emerald-500", accent: "" },
  ] as const;
  return (
    <section className="rounded-2xl border border-border bg-card/60 p-4 sm:p-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {cards.map(c => (
          <div key={c.label} className={cn("rounded-xl border border-border bg-background p-4 border-l-4", c.accent || "border-l-border")}>
            <div className="mb-2 text-xs text-muted-foreground sm:text-sm">{c.label}</div>
            <div className="mb-1 text-2xl font-bold text-foreground sm:text-3xl">{c.value}</div>
            <div className={cn("text-xs", c.deltaClass)}>{c.delta}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ============================================================ */
/*  Assignment Control Panel                                    */
/* ============================================================ */

export function AssignmentControlPanel(props: {
  mode: string;
  onModeChange: (v: string) => void;
  onAssignSelected: () => void;
  onAutoAssign: () => void;
  onAssignToMe: () => void;
  onRebalance: () => void;
  onEscalate: () => void;
  onBulkExport: () => void;
  isSenior: boolean;
  selectedCount: number;
  busy: string | null;
}) {
  const { mode, onModeChange, isSenior, selectedCount, busy } = props;
  const disabledBase = !isSenior;
  const Btn = ({ id, icon: Icon, label, desc, onClick, variant = "outline", accent, disabled }: {
    id: string; icon: any; label: string; desc: string; onClick: () => void;
    variant?: "primary" | "outline"; accent?: string; disabled?: boolean;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex flex-col items-start gap-1 rounded-lg border px-4 py-3 text-left text-sm font-medium transition-colors",
        variant === "primary"
          ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
          : "border-border bg-background text-foreground hover:bg-muted",
        accent,
        disabled && "opacity-50 cursor-not-allowed",
      )}
    >
      <div className="flex items-center gap-2">
        {busy === id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
        <span>{label}</span>
      </div>
      <span className={cn("text-xs font-normal", variant === "primary" ? "opacity-80" : "text-muted-foreground")}>{desc}</span>
    </button>
  );
  return (
    <section className="rounded-2xl border border-border bg-card/60 p-4 sm:p-6">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Assignment Control Panel</h2>
          <p className="mt-1 text-xs text-muted-foreground">Senior admin workforce control · Direct task distribution</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-500">
          <Lock className="h-3.5 w-3.5" /> Senior Admin Only
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-background p-5">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sliders className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">Assignment Mode</div>
              <div className="text-xs text-muted-foreground">How tasks are distributed</div>
            </div>
          </div>
          <Select value={mode} onValueChange={onModeChange} disabled={!isSenior}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">Manual Assignment</SelectItem>
              <SelectItem value="round_robin">Round Robin</SelectItem>
              <SelectItem value="next_available">Next Available</SelectItem>
              <SelectItem value="priority_based">Priority-Based Assignment</SelectItem>
              <SelectItem value="self">Assign To Self</SelectItem>
            </SelectContent>
          </Select>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Controls how new tasks are automatically assigned to available agents
          </p>
        </div>

        <div className="rounded-xl border border-border bg-background p-5 lg:col-span-2">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
              <Bolt className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">Quick Actions</div>
              <div className="text-xs text-muted-foreground">Execute assignment operations</div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Btn id="assign_selected" icon={UserCheck} variant="primary"
              label={`Assign Selected${selectedCount ? ` (${selectedCount})` : ""}`}
              desc="Manually assign checked tasks to chosen agent"
              disabled={disabledBase || selectedCount === 0}
              onClick={props.onAssignSelected} />
            <Btn id="auto_assign" icon={RotateCw}
              label="Auto Assign" desc="Distribute using active assignment mode"
              disabled={disabledBase} onClick={props.onAutoAssign} />
            <Btn id="assign_to_me" icon={UserPlus}
              label="Assign To Me" desc="Take ownership of selected tasks"
              disabled={disabledBase || selectedCount === 0} onClick={props.onAssignToMe} />
            <Btn id="rebalance" icon={ArrowLeftRight}
              label="Rebalance" desc="Redistribute load across all agents"
              disabled={disabledBase} onClick={props.onRebalance} />
            <Btn id="escalate" icon={ArrowUpRightFromSquare}
              label="Escalate" desc="Move to senior agent pool" accent="border-amber-500/30"
              disabled={disabledBase || selectedCount === 0} onClick={props.onEscalate} />
            <Btn id="bulk_export" icon={Download}
              label="Bulk Export" desc="Export assignment data & logs"
              disabled={disabledBase} onClick={props.onBulkExport} />
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
        <div className="text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium text-primary">Assignment Control:</span> Select tasks from the queue below, choose an
          assignment mode, then execute. Auto-assign follows configured rules. Manual assignment requires agent selection.
          Rebalance redistributes workload when agents are overloaded.
        </div>
      </div>
    </section>
  );
}

/* ============================================================ */
/*  Unassigned Task Queue                                       */
/* ============================================================ */

export function UnassignedTaskQueue({
  tasks, selectedIds, onToggle, onToggleAll, onAssignRow, priorityFilter, onPriorityChange, roster,
}: {
  tasks: UnassignedTask[]; selectedIds: Set<string>;
  onToggle: (id: string) => void; onToggleAll: (checked: boolean) => void;
  onAssignRow: (task: UnassignedTask) => void;
  priorityFilter: string; onPriorityChange: (v: string) => void;
  roster: AgentRosterEntry[];
}) {
  const rosterById = useMemo(() => new Map(roster.map(r => [r.user_id, r])), [roster]);
  const filtered = tasks.filter(t => priorityFilter === "all" || t.priority === priorityFilter);
  const allChecked = filtered.length > 0 && filtered.every(t => selectedIds.has(t.id));
  return (
    <section className="rounded-2xl border border-border bg-card/60 p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-foreground">Unassigned Task Queue</h2>
        <div className="flex items-center gap-3">
          <Select value={priorityFilter} onValueChange={onPriorityChange}>
            <SelectTrigger className="h-9 w-40 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-sm text-primary">View All ({tasks.length})</span>
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
              <th className="pb-3 font-medium">
                <Checkbox checked={allChecked} onCheckedChange={c => onToggleAll(!!c)} />
              </th>
              <th className="pb-3 font-medium">Task / Dispute</th>
              <th className="pb-3 font-medium">Type</th>
              <th className="pb-3 font-medium">Priority</th>
              <th className="pb-3 font-medium">Age</th>
              <th className="pb-3 font-medium">Amount</th>
              <th className="pb-3 font-medium">Suggested</th>
              <th className="pb-3 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">No unassigned tasks.</td></tr>
            )}
            {filtered.map(t => {
              const suggested = t.suggested_agent_id ? rosterById.get(t.suggested_agent_id) : null;
              return (
                <tr key={t.id} className="border-b border-border transition-colors hover:bg-muted/40">
                  <td className="py-3">
                    <Checkbox checked={selectedIds.has(t.id)} onCheckedChange={() => onToggle(t.id)} />
                  </td>
                  <td className="py-3">
                    <div className="font-medium text-foreground">#{t.task_code}</div>
                    {t.dispute_id && <div className="text-xs text-muted-foreground">Dispute #{t.dispute_id.slice(0, 8)}</div>}
                  </td>
                  <td className="py-3 text-muted-foreground">{humanize(t.type)}</td>
                  <td className="py-3">
                    <span className={cn("rounded border px-2 py-1 text-xs font-medium", priorityClass(t.priority))}>
                      {humanize(t.priority)}
                    </span>
                  </td>
                  <td className="py-3 text-muted-foreground">{relativeShort(t.created_at)}</td>
                  <td className="py-3 font-medium">{currencyFmt(t.amount, t.currency)}</td>
                  <td className="py-3 text-xs text-muted-foreground">{suggested ? shortNameOf(suggested) : "Auto"}</td>
                  <td className="py-3 text-right">
                    <Button size="sm" onClick={() => onAssignRow(t)} className="h-7 px-3 text-xs">Assign</Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {filtered.length === 0 && <div className="rounded-lg border border-border bg-background p-6 text-center text-sm text-muted-foreground">No unassigned tasks.</div>}
        {filtered.map(t => {
          const suggested = t.suggested_agent_id ? rosterById.get(t.suggested_agent_id) : null;
          return (
            <div key={t.id} className="rounded-xl border border-border bg-background p-4">
              <div className="mb-2 flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium text-foreground">#{t.task_code}</div>
                  {t.dispute_id && <div className="text-xs text-muted-foreground">Dispute #{t.dispute_id.slice(0, 8)}</div>}
                </div>
                <Checkbox checked={selectedIds.has(t.id)} onCheckedChange={() => onToggle(t.id)} />
              </div>
              <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className={cn("rounded border px-2 py-0.5 font-medium", priorityClass(t.priority))}>{humanize(t.priority)}</span>
                <span>{humanize(t.type)}</span>
                <span>· {relativeShort(t.created_at)}</span>
                <span>· {currencyFmt(t.amount, t.currency)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Suggested: {suggested ? shortNameOf(suggested) : "Auto"}</span>
                <Button size="sm" onClick={() => onAssignRow(t)} className="h-7 px-3 text-xs">Assign</Button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ============================================================ */
/*  Agent Roster                                                */
/* ============================================================ */

export function AgentRoster({ roster, onSelect }: { roster: AgentRosterEntry[]; onSelect: (a: AgentRosterEntry) => void }) {
  const online = roster.filter(a => a.availability !== "offline").length;
  return (
    <section className="rounded-2xl border border-border bg-card/60 p-4 sm:p-6">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Agent Roster</h2>
        <div className="flex items-center gap-2">
          <Circle className="h-2 w-2 fill-emerald-500 text-emerald-500" />
          <span className="text-xs text-muted-foreground">{online} Online</span>
        </div>
      </div>
      <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
        {roster.length === 0 && (
          <div className="rounded-lg border border-border bg-background p-6 text-center text-sm text-muted-foreground">
            No agents on shift.
          </div>
        )}
        {roster.map(a => <AgentLoadCard key={a.user_id} agent={a} onSelect={() => onSelect(a)} />)}
      </div>
    </section>
  );
}

export function AgentLoadCard({ agent, onSelect }: { agent: AgentRosterEntry; onSelect: () => void }) {
  const offline = agent.availability === "offline";
  const label = availabilityLabel(agent.availability, "Available");
  return (
    <div className={cn("rounded-xl border-l-4 border border-border bg-background p-3", availabilityAccent(agent.availability))}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-foreground">
            {agent.avatar_url ? <img src={agent.avatar_url} alt="" className="h-full w-full rounded-full object-cover" /> : initialsOf(agent)}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-foreground">{nameOf(agent)}</div>
            <div className={cn("text-xs", availabilityTextColor(agent.availability))}>{label}</div>
          </div>
        </div>
        <button
          type="button" onClick={onSelect} disabled={offline}
          className={cn("flex h-7 w-7 items-center justify-center rounded border border-border bg-background text-xs transition-colors hover:bg-muted",
            offline && "cursor-not-allowed opacity-50")}
        >
          {offline ? <Ban className="h-3 w-3" /> : agent.availability === "at_capacity" ? <Eye className="h-3 w-3" /> : <UserPlus className="h-3 w-3" />}
        </button>
      </div>
      <div className={cn("grid grid-cols-3 gap-2 text-xs", offline && "opacity-60")}>
        <div>
          <div className="text-muted-foreground">Active</div>
          <div className={cn("font-medium",
            agent.availability === "at_capacity" ? "text-amber-500" : "text-foreground")}>{agent.active}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Avg</div>
          <div className="font-medium text-foreground">{agent.avg_first_action_seconds ? `${Math.round(agent.avg_first_action_seconds / 60)}m` : "—"}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Overdue</div>
          <div className={cn("font-medium", agent.overdue > 0 ? "text-destructive" : "text-foreground")}>{agent.overdue}</div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================ */
/*  Live Task Progression                                       */
/* ============================================================ */

export function LiveTaskProgression({
  tasks, roster, onView,
}: { tasks: LiveTask[]; roster: AgentRosterEntry[]; onView: (t: LiveTask) => void }) {
  const rosterById = useMemo(() => new Map(roster.map(r => [r.user_id, r])), [roster]);
  return (
    <section className="rounded-2xl border border-border bg-card/60 p-4 sm:p-6">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Live Task Progression</h2>
        <div className="flex items-center gap-3">
          <button className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
            <Filter className="h-4 w-4" /> Filter
          </button>
          <span className="text-sm text-primary">View All ({tasks.length})</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
              <th className="pb-3 font-medium">Task ID</th>
              <th className="pb-3 font-medium">Agent</th>
              <th className="pb-3 font-medium">Case Ref</th>
              <th className="pb-3 font-medium">Stage</th>
              <th className="pb-3 font-medium">Started</th>
              <th className="pb-3 font-medium">Last Updated</th>
              <th className="pb-3 font-medium">Status</th>
              <th className="pb-3 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {tasks.length === 0 && <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">No active tasks.</td></tr>}
            {tasks.map(t => {
              const agent = t.assigned_agent_id ? rosterById.get(t.assigned_agent_id) : null;
              return (
                <tr key={t.id} className="border-b border-border transition-colors hover:bg-muted/40">
                  <td className="py-3 font-medium text-foreground">#{t.task_code}</td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-medium">
                        {agent?.avatar_url ? <img src={agent.avatar_url} className="h-full w-full rounded-full object-cover" /> : initialsOf(agent)}
                      </div>
                      <span className="text-muted-foreground">{shortNameOf(agent)}</span>
                    </div>
                  </td>
                  <td className="py-3 text-muted-foreground">{t.dispute_id ? `#${t.dispute_id.slice(0,8)}` : "—"}</td>
                  <td className="py-3 text-muted-foreground">{humanize(t.stage)}</td>
                  <td className="py-3 text-muted-foreground">{relative(t.started_at)}</td>
                  <td className="py-3 text-muted-foreground">{relative(t.updated_at)}</td>
                  <td className="py-3">
                    <span className={cn("rounded px-2 py-1 text-xs font-medium", slaClass(t.sla_status))}>
                      {t.sla_status === "overdue" || t.sla_status === "breached" ? "Overdue" : "On Track"}
                    </span>
                  </td>
                  <td className="py-3 text-right">
                    <button onClick={() => onView(t)} className="text-xs text-primary transition-colors hover:text-foreground">View</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ============================================================ */
/*  Productivity Insights                                       */
/* ============================================================ */

export function ProductivityInsights({ insights }: { insights: OrchestrationOverview["insights"] }) {
  const items = [
    { label: "Most Active", agent: insights.most_active, valueLabel: (a: AgentRosterEntry) => `${a.tasks_today} tasks today`, tint: "text-emerald-500" },
    { label: "Most Resolved", agent: insights.most_resolved, valueLabel: (a: AgentRosterEntry) => `${a.resolved_today} completed`, tint: "text-emerald-500" },
    { label: "Least Loaded", agent: insights.least_loaded, valueLabel: (a: AgentRosterEntry) => `${a.active} active task${a.active === 1 ? "" : "s"}`, tint: "text-primary" },
    { label: "Highest Overdue", agent: insights.highest_overdue, valueLabel: (a: AgentRosterEntry) => `${a.overdue} overdue`, tint: "text-destructive" },
    { label: "Fastest Response", agent: insights.fastest_response, valueLabel: (a: AgentRosterEntry) => `Avg ${Math.round(a.avg_first_action_seconds / 60)}m`, tint: "text-emerald-500" },
  ];
  return (
    <section className="rounded-2xl border border-border bg-card/60 p-4 sm:p-6">
      <h2 className="mb-6 text-lg font-semibold text-foreground">Productivity &amp; Load Insights</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {items.map(it => (
          <div key={it.label} className="rounded-xl border border-border bg-background p-4">
            <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">{it.label}</div>
            <div className="mb-1 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium">
                {it.agent?.avatar_url ? <img src={it.agent.avatar_url} className="h-full w-full rounded-full object-cover" /> : initialsOf(it.agent)}
              </div>
              <div className="text-sm font-medium text-foreground">{nameOf(it.agent)}</div>
            </div>
            <div className={cn("text-xs", it.tint)}>{it.agent ? it.valueLabel(it.agent) : "—"}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ============================================================ */
/*  Assignment Rules Panel                                      */
/* ============================================================ */

const FALLBACK_TARGETS = [
  { value: "senior_agent_pool", label: "Senior Agent Pool" },
  { value: "escalation_queue", label: "Escalation Queue" },
  { value: "super_admin", label: "Super Admin" },
  { value: "next_available", label: "Next Available (Any)" },
];

export function AssignmentRulesPanel({
  config, onSave, onTest, saving, testing, lastSavedAt,
}: {
  config: AssignmentRulesConfig; onSave: (next: AssignmentRulesConfig) => void;
  onTest: () => void; saving: boolean; testing: boolean; lastSavedAt: string | null;
}) {
  const [draft, setDraft] = useState<AssignmentRulesConfig>(config);
  useEffect(() => setDraft(config), [config]);
  const set = <K extends keyof AssignmentRulesConfig>(k: K, v: AssignmentRulesConfig[K]) =>
    setDraft(d => ({ ...d, [k]: v }));
  const toggles = [
    { key: "round_robin", label: "Round Robin Assignment", desc: "Distribute tasks evenly across all agents" },
    { key: "online_only", label: "Assign Only to Online Agents", desc: "Skip offline or unavailable agents" },
    { key: "skip_at_capacity", label: "Skip Agents at Capacity", desc: "Don't assign to agents who hit max active tasks" },
  ] as const;
  const toggles2 = [
    { key: "priority_to_senior_pool", label: "Priority Cases to Senior Pool", desc: "Route critical/high priority to senior agents only" },
    { key: "auto_escalate_stale", label: "Auto-Escalate Stale Tasks", desc: "Move unassigned tasks to escalation queue after timeout" },
    { key: "auto_reassign_on_offline", label: "Auto-Reassign on Agent Offline", desc: "Redistribute tasks when agent goes offline" },
  ] as const;
  return (
    <section className="rounded-2xl border border-border bg-card/60 p-4 sm:p-6">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Assignment Rules &amp; Automation Controls</h2>
          <p className="mt-1 text-xs text-muted-foreground">Configure automated task distribution and assignment logic</p>
        </div>
        <div className="inline-flex items-center gap-2 text-xs text-amber-500"><Gauge className="h-4 w-4" /> Advanced Configuration</div>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-5">
          {toggles.map(t => (
            <RuleToggle key={t.key} label={t.label} desc={t.desc}
              value={!!draft[t.key]} onChange={v => set(t.key as any, v as any)} />
          ))}
          <RuleNumber label="Maximum Active Disputes per Agent" hint='Agents will be marked "At Capacity" when reaching this limit'
            value={draft.max_active_per_agent ?? 5} unit="tasks"
            onChange={v => set("max_active_per_agent", v)} />
          <RuleNumber label="Maximum Overdue Cases Before Skip" hint="Skip agents with this many overdue tasks in auto-assignment"
            value={draft.max_overdue_before_skip ?? 2} unit="cases"
            onChange={v => set("max_overdue_before_skip", v)} />
        </div>
        <div className="space-y-5">
          {toggles2.map(t => (
            <RuleToggle key={t.key} label={t.label} desc={t.desc}
              value={!!draft[t.key]} onChange={v => set(t.key as any, v as any)} />
          ))}
          <div className="rounded-xl border border-border bg-background p-4">
            <Label className="mb-2 block text-sm font-medium text-foreground">Fallback Assignment Target</Label>
            <Select value={draft.fallback_target ?? "senior_agent_pool"} onValueChange={v => set("fallback_target", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FALLBACK_TARGETS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="mt-2 text-xs text-muted-foreground">Where to assign when no eligible agents are available</p>
          </div>
          <RuleToggle label="Super Admin Self-Assignment" desc="Allow super admin to override and assign to self"
            value={!!draft.super_admin_self_assign} onChange={v => set("super_admin_self_assign", v)} />
        </div>
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6">
        <div className="flex items-center gap-3">
          <Button onClick={() => onSave(draft)} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Assignment
          </Button>
          <Button variant="outline" onClick={onTest} disabled={testing}>
            {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
            Test Configuration
          </Button>
        </div>
        <div className="text-xs text-muted-foreground">
          {lastSavedAt ? `Last saved: ${relative(lastSavedAt)}` : "Not saved yet"}
        </div>
      </div>
    </section>
  );
}

function RuleToggle({ label, desc, value, onChange }: { label: string; desc: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-foreground">{label}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{desc}</div>
        </div>
        <Switch checked={value} onCheckedChange={onChange} />
      </div>
    </div>
  );
}
function RuleNumber({ label, hint, value, unit, onChange }: { label: string; hint: string; value: number; unit: string; onChange: (v: number) => void }) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <Label className="mb-2 block text-sm font-medium text-foreground">{label}</Label>
      <div className="flex items-center gap-3">
        <Input type="number" value={value} onChange={e => onChange(Number(e.target.value) || 0)} className="flex-1" />
        <span className="text-xs text-muted-foreground">{unit}</span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

/* ============================================================ */
/*  Drawers / Dialogs                                           */
/* ============================================================ */

export function AssignTaskDrawer({
  open, onOpenChange, task, roster, onConfirm, submitting,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  task: UnassignedTask | null; roster: AgentRosterEntry[];
  onConfirm: (agentId: string, reason: string) => void; submitting: boolean;
}) {
  const [agentId, setAgentId] = useState<string>("");
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) { setAgentId(task?.suggested_agent_id ?? ""); setReason(""); }
  }, [open, task]);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Assign Task</SheetTitle>
          <SheetDescription>Pick an agent to take ownership of this task.</SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          {task && (
            <div className="rounded-lg border border-border bg-background p-3 text-sm">
              <div className="font-medium text-foreground">#{task.task_code}</div>
              <div className="text-xs text-muted-foreground">{humanize(task.type)} · {currencyFmt(task.amount, task.currency)}</div>
            </div>
          )}
          <div>
            <Label className="mb-1 block">Agent</Label>
            <Select value={agentId} onValueChange={setAgentId}>
              <SelectTrigger><SelectValue placeholder="Choose agent" /></SelectTrigger>
              <SelectContent>
                {roster.filter(a => a.availability !== "offline").map(a => (
                  <SelectItem key={a.user_id} value={a.user_id}>
                    {nameOf(a)} — {a.active}/{a.max_active} active
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1 block">Assignment reason (optional)</Label>
            <Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Why is this being assigned now?" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={() => onConfirm(agentId, reason)} disabled={!agentId || submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirm
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function EscalateTaskDialog({
  open, onOpenChange, count, onConfirm, submitting,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  count: number; onConfirm: (reason: string) => void; submitting: boolean;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => { if (open) setReason(""); }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Escalate {count} task{count === 1 ? "" : "s"}</DialogTitle>
          <DialogDescription>Escalated tasks move to the senior agent pool.</DialogDescription>
        </DialogHeader>
        <Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (min 10 chars)" />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onConfirm(reason)} disabled={reason.trim().length < 10 || submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Escalate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AgentDetailsDrawer({
  open, onOpenChange, agent,
}: { open: boolean; onOpenChange: (v: boolean) => void; agent: AgentRosterEntry | null }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{nameOf(agent)}</SheetTitle>
          <SheetDescription>{agent?.email ?? ""}</SheetDescription>
        </SheetHeader>
        {agent && (
          <div className="mt-6 space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Stat label="Availability" value={humanize(agent.availability)} />
              <Stat label="Load" value={`${agent.active} / ${agent.max_active}`} />
              <Stat label="Overdue" value={String(agent.overdue)} />
              <Stat label="Tasks Today" value={String(agent.tasks_today)} />
              <Stat label="Resolved Today" value={String(agent.resolved_today)} />
              <Stat label="Avg First Action" value={agent.avg_first_action_seconds ? `${Math.round(agent.avg_first_action_seconds / 60)}m` : "—"} />
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}

/* ============================================================ */
/*  Loading / Empty / Error                                     */
/* ============================================================ */

export function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="animate-pulse rounded-2xl border border-border bg-card/60 p-6">
          <div className="h-4 w-40 rounded bg-muted" />
          <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-3">
            {[...Array(6)].map((_, j) => <div key={j} className="h-20 rounded bg-muted/60" />)}
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40 p-10 text-center">
      <Users className="mb-3 h-6 w-6 text-muted-foreground" />
      <div className="text-sm font-medium text-foreground">{title}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-destructive/30 bg-destructive/5 p-10 text-center">
      <ShieldAlert className="mb-3 h-6 w-6 text-destructive" />
      <div className="text-sm font-medium text-foreground">Something went wrong</div>
      <div className="mt-1 text-xs text-muted-foreground">{message}</div>
      <Button variant="outline" onClick={onRetry} className="mt-4">Retry</Button>
    </div>
  );
}

/* ============================================================ */
/*  Exports                                                     */
/* ============================================================ */

export { runOrchestrationAction, fetchOrchestrationOverview };
export { toast };