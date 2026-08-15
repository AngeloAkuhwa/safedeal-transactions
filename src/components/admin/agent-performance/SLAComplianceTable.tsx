import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "./states/EmptyState";
import { INNER_CARD_CLASS, slaTone, toggleStateFilter } from "./helpers";
import { SortableTh, useAgentSort } from "./useAgentSort";
import {
  agentShortName, type AgentPerformanceRow, type SlaCaseRow, type SlaState,
} from "@/services/agent-performance.service";
import { Timer } from "lucide-react";
import type { SlaSummary } from "@/services/agent-performance.service";
import { hoursLabel, minutesLabel } from "./helpers";

const STATE_META: Record<SlaState, { label: string; className: string }> = {
  on_track: { label: "On track", className: "bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/30" },
  at_risk: { label: "At risk", className: "bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-500/30" },
  breached: { label: "Breached", className: "bg-rose-500/15 text-rose-300 ring-1 ring-inset ring-rose-500/30" },
  paused: { label: "Paused", className: "bg-sky-500/15 text-sky-300 ring-1 ring-inset ring-sky-500/30" },
  completed_within: { label: "Completed within SLA", className: "bg-emerald-500/10 text-emerald-300 ring-1 ring-inset ring-emerald-500/20" },
  completed_outside: { label: "Completed outside SLA", className: "bg-rose-500/10 text-rose-300 ring-1 ring-inset ring-rose-500/20" },
  not_configured: { label: "No SLA configured", className: "bg-muted text-muted-foreground ring-1 ring-inset ring-border" },
  cancelled: { label: "Cancelled", className: "bg-muted text-muted-foreground ring-1 ring-inset ring-border" },
};

const STATE_ORDER: SlaState[] = [
  "breached", "at_risk", "on_track", "paused",
  "completed_outside", "completed_within", "not_configured",
];

const dt = (v: string | null) => (v ? new Date(v).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

function remainingLabel(mins: number | null): string {
  if (mins == null) return "—";
  const abs = Math.abs(mins);
  const text = abs >= 1440 ? `${Math.round(abs / 1440)}d` : abs >= 60 ? `${Math.round(abs / 60)}h` : `${abs}m`;
  return mins < 0 ? `${text} over` : `${text} left`;
}

/**
 * SLA Compliance tab: case-level investigation table with an agent roll-up.
 * States follow the case's own due date, so paused and unconfigured work is
 * never counted as a breach.
 */
export function SLAComplianceTable({
  agents, cases, summary, rangeLabel, stateFilter, onStateFilterChange, agentFilter, onAgentFilterChange,
  priorityFilter, onPriorityFilterChange, stageFilter, onStageFilterChange,
  counts, total, page, pageSize, hasMore, onPageChange,
  onReviewSla, onOpenCase, onEscalate, onRebalance, canRebalance, canEscalate,
}: {
  agents: AgentPerformanceRow[];
  cases: SlaCaseRow[];
  summary: SlaSummary;
  rangeLabel: string;
  stateFilter: string;
  onStateFilterChange: (v: string) => void;
  agentFilter: string;
  onAgentFilterChange: (v: string) => void;
  priorityFilter: string;
  onPriorityFilterChange: (v: string) => void;
  stageFilter: string;
  onStageFilterChange: (v: string) => void;
  counts: Record<string, number>;
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  onPageChange: (p: number) => void;
  onReviewSla: (a: AgentPerformanceRow) => void;
  onOpenCase: (c: SlaCaseRow) => void;
  onEscalate: (c: SlaCaseRow) => void;
  onRebalance: (a: AgentPerformanceRow) => void;
  canRebalance: boolean;
  canEscalate: boolean;
}) {
  const { sorted, sortKey, sortDir, toggle } = useAgentSort(agents, "sla_compliance");

  const selectedStates = useMemo(
    () => (stateFilter === "all" || !stateFilter ? [] : stateFilter.split(",")),
    [stateFilter],
  );
  /** Multi-select: chips toggle in and out of the server-side state filter. */
  const toggleState = (s: SlaState) => onStateFilterChange(toggleStateFilter(stateFilter, s));
  const visible = cases;
  const totalAll = useMemo(
    () => Object.values(counts).reduce((a, b) => a + b, 0),
    [counts],
  );
  const priorities = useMemo(
    () => Array.from(new Set(cases.map((c) => c.priority).filter(Boolean) as string[])).sort(),
    [cases],
  );
  const stages = useMemo(
    () => Array.from(new Set(cases.map((c) => c.stage).filter(Boolean) as string[])).sort(),
    [cases],
  );
  const completed = (counts.completed_within ?? 0) + (counts.completed_outside ?? 0);
  const compliance = completed ? Math.round(((counts.completed_within ?? 0) / completed) * 1000) / 10 : null;
  const agentById = new Map(agents.map((a) => [a.user_id, a]));

  if (agents.length === 0) {
    return <EmptyState icon={Timer} title="No SLA data" hint="No cases were handled in this range." />;
  }

  return (
    <div id="sla-investigation" className="scroll-mt-28 space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        {[
          ["SLA tracked", String(summary.tracked)],
          ["On track", String(summary.on_track)],
          ["At risk", String(summary.at_risk)],
          ["Breached", String(summary.breached)],
          ["Compliance", summary.compliance == null ? "No tracked cases" : `${summary.compliance}%`],
          [`Avg first action`, minutesLabel(summary.avg_first_action_minutes), `Measured on ${summary.first_action_sample ?? 0} tracked case(s) in scope`],
          [`Avg resolution`, hoursLabel(summary.avg_resolution_hours), `Measured on ${summary.resolution_sample ?? 0} tracked case(s) in scope`],
          ["Within SLA", String(summary.completed_within)],
          ["Outside SLA", String(summary.completed_outside)],
          ["Paused", String(summary.paused)],
          ["Not configured", String(summary.not_configured)],
        ].map(([label, value, hint]) => (
          <div key={label} title={hint ?? undefined} className={cn(INNER_CARD_CLASS, "p-3")}>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-foreground">{value}</div>
            {hint && <div className="mt-1 text-[10px] text-muted-foreground">n = {String(hint).match(/\d+/)?.[0] ?? 0}</div>}
          </div>
        ))}
      </div>
      <div className={cn(INNER_CARD_CLASS, "flex flex-wrap items-end justify-between gap-4")}>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">SLA compliance · {rangeLabel}</div>
          <div className={cn("text-3xl font-semibold tabular-nums", compliance == null ? "text-muted-foreground" : slaTone(compliance))}>
            {compliance == null ? "—" : `${compliance}%`}
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {completed} completed case{completed === 1 ? "" : "s"} measured · unconfigured and cancelled cases excluded
          </div>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter cases by SLA state">
          <button
            type="button"
            aria-pressed={selectedStates.length === 0}
            onClick={() => onStateFilterChange("all")}
            className={cn("rounded-full border px-3 py-1 text-xs transition min-h-11",
              selectedStates.length === 0 ? "border-primary/40 bg-primary/15 text-primary" : "border-border/60 bg-background/60 text-muted-foreground hover:text-foreground")}
          >
            All {totalAll}
          </button>
          {STATE_ORDER.filter((s) => (counts[s] ?? 0) > 0).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={selectedStates.includes(s)}
              onClick={() => toggleState(s)}
              className={cn("rounded-full border px-3 py-1 text-xs transition min-h-11",
              selectedStates.includes(s) ? "border-primary/40 bg-primary/15 text-primary" : "border-border/60 bg-background/60 text-muted-foreground hover:text-foreground")}
            >
              {STATE_META[s].label} {counts[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          Showing {total === 0 ? 0 : (page - 1) * pageSize + 1}–{(page - 1) * pageSize + visible.length} of {total} case{total === 1 ? "" : "s"}
        </div>
        <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Filter cases by agent"
          value={agentFilter}
          onChange={(e) => onAgentFilterChange(e.target.value)}
          className="h-9 rounded-lg border border-border/60 bg-card/60 px-2 text-xs text-foreground relative before:absolute before:-inset-2 before:content-['']"
        >
          <option value="all">All agents</option>
          {agents.map((a) => <option key={a.user_id} value={a.user_id}>{agentShortName(a)}</option>)}
        </select>
        <select
          aria-label="Filter cases by priority"
          value={priorityFilter}
          onChange={(e) => onPriorityFilterChange(e.target.value)}
          className="h-9 rounded-lg border border-border/60 bg-card/60 px-2 text-xs capitalize text-foreground relative before:absolute before:-inset-2 before:content-['']"
        >
          <option value="all">All priorities</option>
          {priorities.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select
          aria-label="Filter cases by stage"
          value={stageFilter}
          onChange={(e) => onStageFilterChange(e.target.value)}
          className="h-9 rounded-lg border border-border/60 bg-card/60 px-2 text-xs text-foreground relative before:absolute before:-inset-2 before:content-['']"
        >
          <option value="all">All stages</option>
          {stages.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
        </select>
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={Timer} title="No cases match this SLA filter" hint="Clear the state or agent filter to see more." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] sd-stack">
            <caption className="sr-only">Case-level SLA tracking</caption>
            <thead className="sticky top-0 z-10 bg-card/95 backdrop-blur">
              <tr className="border-b border-border/70">
                {["Case", "Agent", "Priority", "Stage", "Assigned", "First action", "Due", "Remaining", "SLA state", "Updated", ""].map((h) => (
                  <th key={h} scope="col" className="whitespace-nowrap px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => {
                const agent = c.agent_id ? agentById.get(c.agent_id) : undefined;
                return (
                  <tr key={`${c.source ?? "task"}-${c.id}`} className="border-b border-border/60 transition-colors hover:bg-card/50">
                    <td className="px-3 py-2.5 text-sm">
                      <button type="button" onClick={() => onOpenCase(c)} className="font-mono text-xs text-primary hover:underline min-h-11 inline-flex items-center">
                        {c.task_code ?? c.id.slice(0, 8)}
                      </button>
                      <div className="max-w-[220px] truncate text-[11px] text-muted-foreground">{c.title ?? c.type}</div>
                    </td>
                    <td className="px-3 py-2.5 text-sm text-foreground">{c.agent_name ?? "—"}</td>
                    <td className="px-3 py-2.5 text-xs capitalize text-muted-foreground">{c.priority ?? "—"}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{String(c.stage ?? "—").replace(/_/g, " ")}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{dt(c.assigned_at)}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{dt(c.first_action_at)}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{dt(c.due_at)}</td>
                    <td className={cn("px-3 py-2.5 text-xs tabular-nums",
                      c.remaining_minutes != null && c.remaining_minutes < 0 ? "text-rose-300" : "text-muted-foreground")}>
                      {remainingLabel(c.remaining_minutes)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px]", STATE_META[c.sla_state].className)}>
                        {STATE_META[c.sla_state].label}
                      </span>
                      {c.source === "dispute" && (
                        <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">Dispute only</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{dt(c.updated_at)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex justify-end gap-1.5">
                        {canEscalate && c.source !== "dispute" && (
                        <button
                          type="button"
                          onClick={() => onEscalate(c)}
                          className="rounded-lg border border-border/70 bg-card/60 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground min-h-11"
                        >
                          Escalate
                        </button>
                        )}
                        {canRebalance && agent && (
                          <button
                            type="button"
                            onClick={() => onRebalance(agent)}
                            className="rounded-lg border border-border/70 bg-card/60 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground min-h-11"
                          >
                            Rebalance
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-3 flex items-center justify-end gap-2 text-xs text-muted-foreground">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="rounded-lg border border-border/70 bg-card/60 px-2 py-1 disabled:opacity-40 min-h-11"
            >
              Previous
            </button>
            <span>Page {page}</span>
            <button
              type="button"
              disabled={!hasMore}
              onClick={() => onPageChange(page + 1)}
              className="rounded-lg border border-border/70 bg-card/60 px-2 py-1 disabled:opacity-40 min-h-11"
            >
              Next
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
      <div className="mb-2 text-sm font-medium text-foreground">By agent</div>
      <table className="w-full min-w-[880px] sd-stack">
        <caption className="sr-only">SLA compliance per agent, sortable by on time, overdue, breached and compliance</caption>
        <thead>
          <tr className="border-b border-border/70">
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground" scope="col">Agent</th>
            <SortableTh label="On Time" sortKey="on_time" active={sortKey === "on_time"} dir={sortDir} onToggle={toggle} className="text-center" />
            <SortableTh label="Overdue" sortKey="overdue" active={sortKey === "overdue"} dir={sortDir} onToggle={toggle} className="text-center" />
            <SortableTh label="Breached" sortKey="breached" active={sortKey === "breached"} dir={sortDir} onToggle={toggle} className="text-center" />
            <SortableTh label="Compliance" sortKey="sla_compliance" active={sortKey === "sla_compliance"} dir={sortDir} onToggle={toggle} className="text-left" />
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground" scope="col" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((a) => (
            <tr key={a.user_id} className="border-b border-border/60 transition-colors hover:bg-card/50">
              <td className="px-4 py-3 text-sm font-medium text-foreground">{agentShortName(a)}</td>
              <td className="px-4 py-3 text-center text-sm text-emerald-300">{a.on_time}</td>
              <td className={cn("px-4 py-3 text-center text-sm", a.overdue > 0 ? "text-amber-300" : "text-muted-foreground")}>{a.overdue}</td>
              <td className={cn("px-4 py-3 text-center text-sm", a.breached > 0 ? "text-rose-300" : "text-muted-foreground")}>{a.breached}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                   <Progress value={a.sla_compliance ?? 0} className="h-1.5 flex-1" />
                  <span className={cn("w-12 text-right text-sm font-semibold", slaTone(a.sla_compliance))}>
                     {a.sla_compliance == null ? "—" : `${a.sla_compliance}%`}
                  </span>
                </div>
              </td>
              <td className="px-4 py-3 text-right">
                <button
                  type="button"
                  onClick={() => onReviewSla(a)}
                  className="rounded-lg border border-border/70 bg-card/60 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground min-h-11"
                >
                  Review SLA
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}