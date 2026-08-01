import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  activeCasesPillClass, availabilityDot, availabilityLabel, availabilityTextClass,
  hoursLabel, rankBadgeClass, rowRingClass, SCORE_FORMULA, scoreTone,
} from "./helpers";
import { EmptyState } from "./states/EmptyState";
import { SortableTh, useAgentSort } from "./useAgentSort";
import { agentInitials, agentShortName, type AgentPerformanceRow } from "@/services/agent-performance.service";

export interface RowActions {
  onViewDetail: (a: AgentPerformanceRow) => void;
  onViewCases: (a: AgentPerformanceRow) => void;
  onReviewSla: (a: AgentPerformanceRow) => void;
  onRebalance: (a: AgentPerformanceRow) => void;
  canRebalance: boolean;
}

const TH = "px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground";

function ActionButton({ label, onClick, disabled, title }: { label: string; onClick: () => void; disabled?: boolean; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      className={cn(
        "rounded-lg border border-border/70 bg-card/60 px-3 py-1.5 text-xs text-muted-foreground transition-colors",
        disabled ? "cursor-not-allowed opacity-50" : "hover:bg-muted hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

export function WorkloadTable({ agents, actions }: { agents: AgentPerformanceRow[]; actions: RowActions }) {
  const { sorted, sortKey, sortDir, toggle } = useAgentSort(agents);
  if (agents.length === 0) {
    return <EmptyState title="No agents match these filters" hint="Adjust the team, date range or extra filters to widen the view." />;
  }
  return (
    <TooltipProvider delayDuration={200}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px]">
          <caption className="sr-only">Agent workload, sortable by active cases, resolved, average time, overdue and score</caption>
          <thead>
            <tr className="border-b border-border/70">
              <SortableTh label="Rank" sortKey="rank" active={sortKey === "rank"} dir={sortDir} onToggle={toggle} className="text-left" />
              <th className={cn(TH, "text-left")} scope="col">Agent</th>
              <th className={cn(TH, "text-left")} scope="col">Role</th>
              <SortableTh label="Active Cases" sortKey="active_cases" active={sortKey === "active_cases"} dir={sortDir} onToggle={toggle} className="text-center" />
              <SortableTh label="Resolved" sortKey="resolved" active={sortKey === "resolved"} dir={sortDir} onToggle={toggle} className="text-center" />
              <SortableTh label="Avg Time" sortKey="avg_resolution_hours" active={sortKey === "avg_resolution_hours"} dir={sortDir} onToggle={toggle} className="text-center" />
              <SortableTh label="Overdue" sortKey="overdue" active={sortKey === "overdue"} dir={sortDir} onToggle={toggle} className="text-center" />
              <SortableTh label="Score" sortKey="score" active={sortKey === "score"} dir={sortDir} onToggle={toggle} className="text-center">
                <Tooltip>
                  <TooltipTrigger asChild><span className="cursor-help underline decoration-dotted">Score</span></TooltipTrigger>
                  <TooltipContent className="max-w-xs text-xs">{SCORE_FORMULA}</TooltipContent>
                </Tooltip>
              </SortableTh>
              <th className={cn(TH, "text-right")}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((a) => (
              <tr
                key={a.user_id}
                className={cn("border-b border-border/60 transition-colors hover:bg-card/50", rowRingClass(a))}
              >
                <td className="px-4 py-4">
                  <div className={cn("flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold", rankBadgeClass(a.rank))}>
                    {a.rank}
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground ring-2",
                      a.rank === 1 ? "ring-primary" : "ring-border",
                    )}>
                      {agentInitials(a)}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-medium text-foreground">{agentShortName(a)}</div>
                      <div className={cn("flex items-center gap-1 text-xs", availabilityTextClass(a.availability))}>
                        <span className={cn("h-2 w-2 rounded-full", availabilityDot(a.availability), a.is_live && "animate-pulse")} />
                        {availabilityLabel(a.availability)}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4 text-sm text-muted-foreground">{a.role_label}</td>
                <td className="px-4 py-4 text-center">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className={cn("rounded-full px-3 py-1 text-sm font-medium", activeCasesPillClass(a))}>
                        {a.active_cases}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs">
                      Capacity: {a.active_cases} of {a.max_active} concurrent cases
                      {a.at_capacity ? " — at capacity" : ""}
                    </TooltipContent>
                  </Tooltip>
                </td>
                <td className="px-4 py-4 text-center font-medium text-foreground">{a.resolved}</td>
                <td className={cn(
                  "px-4 py-4 text-center font-medium",
                  a.avg_resolution_hours == null ? "text-muted-foreground" : a.avg_resolution_hours <= 4 ? "text-emerald-300" : "text-foreground",
                )}>
                  {hoursLabel(a.avg_resolution_hours)}
                </td>
                <td className="px-4 py-4 text-center">
                  {a.overdue > 0
                    ? <span className="rounded-full bg-rose-500/15 px-2.5 py-1 text-sm font-medium text-rose-300 ring-1 ring-inset ring-rose-500/30">{a.overdue}</span>
                    : <span className="text-muted-foreground">0</span>}
                </td>
                <td className="px-4 py-4 text-center">
                  <div className={cn("font-bold", scoreTone(a.score_band))}>{a.score}</div>
                  <div className="text-xs text-muted-foreground">{a.score_band}</div>
                </td>
                <td className="px-4 py-4">
                  <div className="flex items-center justify-end gap-2">
                    <ActionButton label="View Detail" onClick={() => actions.onViewDetail(a)} />
                    {a.overdue > 0 || a.breached > 0
                      ? <ActionButton label="Review SLA" onClick={() => actions.onReviewSla(a)} />
                      : <ActionButton label="View Cases" onClick={() => actions.onViewCases(a)} />}
                    {(a.at_capacity || a.overdue > 0) && (
                      <ActionButton
                        label="Rebalance"
                        onClick={() => actions.onRebalance(a)}
                        disabled={!actions.canRebalance}
                        title={actions.canRebalance ? "Rebalance this agent's workload" : "You do not have rebalance permission"}
                      />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </TooltipProvider>
  );
}