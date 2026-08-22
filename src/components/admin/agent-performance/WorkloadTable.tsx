import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  activeCasesPillClass, availabilityDot, availabilityLabel, availabilityTextClass,
  hoursLabel, minutesLabel, rankBadgeClass, rowRingClass, SCORE_FORMULA, scoreTone,
} from "./helpers";
import { EmptyState } from "./states/EmptyState";
import { SortableTh, useAgentSort } from "./useAgentSort";
import { TablePagination } from "./TablePagination";
import { workloadStatus, workloadStatusClass, workloadStatusLabel } from "./workloadStatus";
import { Fragment, useEffect, useMemo, useState } from "react";
import { agentInitials, agentShortName, type AgentPerformanceRow } from "@/services/agent-performance.service";

export interface RowActions {
  onViewDetail: (a: AgentPerformanceRow) => void;
  onViewCases: (a: AgentPerformanceRow) => void;
  onReviewSla: (a: AgentPerformanceRow) => void;
  onRebalance: (a: AgentPerformanceRow) => void;
  canRebalance: boolean;
  canViewCases: boolean;
  canReviewSla: boolean;
}

const TH = "px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground";
/** Sticky column header: the page header sits above it, so no extra offset. */
const THEAD = "sticky top-0 z-sticky bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80";

function ActionButton({ label, onClick, disabled, title }: { label: string; onClick: () => void; disabled?: boolean; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      className={cn(
        "rounded-lg border border-border/70 bg-card/60 px-3 py-1.5 text-xs text-muted-foreground transition-colors min-h-11",
        disabled ? "cursor-not-allowed opacity-50" : "hover:bg-muted hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

export function WorkloadTable({
  agents, actions, onClearFilters, filtered,
}: {
  agents: AgentPerformanceRow[];
  actions: RowActions;
  onClearFilters?: () => void;
  filtered?: boolean;
}) {
  const { sorted, sortKey, sortDir, toggle } = useAgentSort(agents);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [expanded, setExpanded] = useState<string | null>(null);
  useEffect(() => { setPage(1); }, [agents, sortKey, sortDir, pageSize]);
  const paged = useMemo(
    () => sorted.slice((page - 1) * pageSize, page * pageSize),
    [sorted, page, pageSize],
  );
  if (agents.length === 0) {
    return (
      <EmptyState
        title="No agents match these filters"
        hint="Adjust the team, date range or extra filters to widen the view."
        action={filtered && onClearFilters
          ? <Button variant="outline" size="sm" onClick={onClearFilters}>Clear Filters</Button>
          : undefined}
      />
    );
  }
  return (
    <TooltipProvider delayDuration={200}>
      <div className="mb-2 text-xs text-muted-foreground">
        Showing {Math.min((page - 1) * pageSize + 1, sorted.length)}–{Math.min(page * pageSize, sorted.length)} of {sorted.length} agents
      </div>
      <div className="space-y-3 md:hidden">
        {paged.map((a) => (
          <article key={a.user_id} className={cn("space-y-3 rounded-lg border border-border p-4", rowRingClass(a))}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">{agentShortName(a)}</p>
                <p className="truncate text-xs text-muted-foreground">{a.email ?? a.user_id}</p>
                <p className="text-xs text-muted-foreground">{a.role_label} · {availabilityLabel(a.availability)}</p>
              </div>
              <span className={cn("flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold", rankBadgeClass(a.rank))}>{a.rank}</span>
            </div>
            <dl className="grid grid-cols-3 gap-2 text-center text-xs">
              <div><dt className="text-muted-foreground">Active</dt><dd className="font-semibold">{a.active_cases} / {a.max_active}</dd></div>
              <div><dt className="text-muted-foreground">Waiting</dt><dd className="font-semibold">{a.waiting_cases}</dd></div>
              <div><dt className="text-muted-foreground">Critical</dt><dd className={cn("font-semibold", a.critical_cases > 0 && "text-amber-300")}>{a.critical_cases}</dd></div>
              <div><dt className="text-muted-foreground">Resolved</dt><dd className="font-semibold">{a.resolved}</dd></div>
              <div><dt className="text-muted-foreground">Avg time</dt><dd className="font-semibold">{hoursLabel(a.avg_resolution_hours)}</dd></div>
              <div><dt className="text-muted-foreground">Overdue</dt><dd className={cn("font-semibold", a.overdue > 0 && "text-rose-300")}>{a.overdue}</dd></div>
              <div><dt className="text-muted-foreground">Workload</dt><dd className="font-semibold">{workloadStatusLabel(workloadStatus(a))}</dd></div>
              <div><dt className="text-muted-foreground">SLA</dt><dd className="font-semibold">{a.sla_compliance}%</dd></div>
              <div><dt className="text-muted-foreground">Score</dt><dd className={cn("font-bold", scoreTone(a.score_band))}>{a.score} <span className="block text-xs font-normal text-muted-foreground">{a.score_band}</span></dd></div>
            </dl>
            <details className="rounded-lg border border-border/70 bg-background/40">
              <summary className="flex min-h-11 cursor-pointer items-center px-3 text-xs font-medium text-muted-foreground">
                More details
              </summary>
              <dl className="grid grid-cols-2 gap-3 px-3 pb-3 text-xs">
                <div><dt className="text-muted-foreground">Team</dt><dd className="text-foreground">{a.team ?? "—"}</dd></div>
                <div><dt className="text-muted-foreground">Avg first action</dt><dd className="text-foreground">{minutesLabel(a.avg_first_action_minutes)}</dd></div>
                <div><dt className="text-muted-foreground">Escalations</dt><dd className="text-foreground">{a.escalations}</dd></div>
                <div><dt className="text-muted-foreground">Reassignments</dt><dd className="text-foreground">{a.reassignments_in} in / {a.reassignments_out} out</dd></div>
                <div><dt className="text-muted-foreground">Resolved (prev)</dt><dd className="text-foreground">{a.resolved_prev}</dd></div>
                <div><dt className="text-muted-foreground">Resolution sample</dt><dd className="text-foreground">{a.resolution_sample} case(s)</dd></div>
                <div className="col-span-2">
                  <dt className="text-muted-foreground">Skills</dt>
                  <dd className="text-foreground">{a.skills.length ? a.skills.map((s) => s.skill).join(", ") : "—"}</dd>
                </div>
              </dl>
            </details>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => actions.onViewDetail(a)}>View detail</Button>
              {actions.canViewCases && <Button variant="outline" onClick={() => actions.onViewCases(a)}>View cases</Button>}
              {(a.overdue > 0 || a.breached > 0) && actions.canReviewSla && (
                <Button variant="outline" onClick={() => actions.onReviewSla(a)}>Review SLA</Button>
              )}
              {(a.at_capacity || a.overdue > 0) && actions.canRebalance && (
                <Button variant="outline" onClick={() => actions.onRebalance(a)}>Rebalance</Button>
              )}
            </div>
          </article>
        ))}
      </div>
      <div className="hidden max-h-[65dvh] overflow-auto rounded-xl md:block">
        <table className="w-full min-w-[1240px]">
          <caption className="sr-only">Agent workload, sortable by active cases, resolved, average time, overdue and score</caption>
          <thead className={THEAD}>
            <tr className="border-b border-border/70">
              <th className={cn(TH, "w-8")}><span className="sr-only">Expand</span></th>
              <SortableTh label="Rank" sortKey="rank" active={sortKey === "rank"} dir={sortDir} onToggle={toggle} className="text-left" />
              <th className={cn(TH, "text-left")} scope="col">Agent</th>
              <th className={cn(TH, "text-left")} scope="col">Role</th>
              <th className={cn(TH, "text-left")} scope="col">Availability</th>
              <SortableTh label="Active Cases" sortKey="active_cases" active={sortKey === "active_cases"} dir={sortDir} onToggle={toggle} className="text-center" />
              <SortableTh label="Waiting" sortKey="waiting_cases" active={sortKey === "waiting_cases"} dir={sortDir} onToggle={toggle} className="text-center" />
              <SortableTh label="Critical" sortKey="critical_cases" active={sortKey === "critical_cases"} dir={sortDir} onToggle={toggle} className="text-center" />
              <th className={cn(TH, "text-center")} scope="col">Workload</th>
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
            {paged.map((a) => (
              <Fragment key={a.user_id}>
              <tr
                className={cn("border-b border-border/60 transition-colors hover:bg-card/50", rowRingClass(a))}
              >
                <td className="px-2 py-4">
                  <button
                    type="button"
                    onClick={() => setExpanded((id) => (id === a.user_id ? null : a.user_id))}
                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
                    aria-expanded={expanded === a.user_id}
                    aria-label={`${expanded === a.user_id ? "Hide" : "Show"} details for ${agentShortName(a)}`}
                  >
                    {expanded === a.user_id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                </td>
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
                      <div className="truncate text-xs text-muted-foreground">{a.email ?? a.user_id}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4 text-sm text-muted-foreground">{a.role_label}</td>
                <td className="px-4 py-4">
                  <div className={cn("flex items-center gap-1.5 text-xs", availabilityTextClass(a.availability))}>
                    <span className={cn("h-2 w-2 rounded-full", availabilityDot(a.availability), a.is_live && "sd-live-dot")} />
                    {availabilityLabel(a.availability)}
                  </div>
                </td>
                <td className="px-4 py-4 text-center">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className={cn("rounded-full px-3 py-1 text-sm font-medium", activeCasesPillClass(a))}>
                        {a.active_cases}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs">
                      Capacity: {a.active_cases} of {a.max_active} concurrent cases
                      {a.at_capacity ? " (at capacity)" : ""}
                    </TooltipContent>
                  </Tooltip>
                </td>
                <td className="px-4 py-4 text-center text-sm text-muted-foreground">{a.waiting_cases}</td>
                <td className="px-4 py-4 text-center text-sm">
                  {a.critical_cases > 0
                    ? <span className="font-medium text-amber-300">{a.critical_cases}</span>
                    : <span className="text-muted-foreground">0</span>}
                </td>
                <td className="px-4 py-4 text-center">
                  <span className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
                    workloadStatusClass(workloadStatus(a)),
                  )}>
                    {workloadStatusLabel(workloadStatus(a))}
                  </span>
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
                    {(a.overdue > 0 || a.breached > 0)
                      ? actions.canReviewSla && <ActionButton label="Review SLA" onClick={() => actions.onReviewSla(a)} />
                      : actions.canViewCases && <ActionButton label="View Cases" onClick={() => actions.onViewCases(a)} />}
                    {(a.at_capacity || a.overdue > 0) && actions.canRebalance && (
                      <ActionButton
                        label="Rebalance"
                        onClick={() => actions.onRebalance(a)}
                        title="Open the Task Orchestration rebalance preview"
                      />
                    )}
                  </div>
                </td>
              </tr>
              {expanded === a.user_id && (
                <tr className="border-b border-border/60 bg-background/40">
                  <td colSpan={13} className="px-6 py-4">
                    <dl className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-3 lg:grid-cols-6">
                      <div><dt className="text-muted-foreground">Team</dt><dd className="text-foreground">{a.team ?? "—"}</dd></div>
                      <div><dt className="text-muted-foreground">Capacity</dt><dd className="text-foreground">{a.active_cases} / {a.max_active}</dd></div>
                      <div><dt className="text-muted-foreground">Avg first action</dt><dd className="text-foreground">{minutesLabel(a.avg_first_action_minutes)}</dd></div>
                      <div><dt className="text-muted-foreground">Escalations</dt><dd className="text-foreground">{a.escalations}</dd></div>
                      <div><dt className="text-muted-foreground">Reassignments</dt><dd className="text-foreground">{a.reassignments_in} in / {a.reassignments_out} out</dd></div>
                      <div><dt className="text-muted-foreground">SLA compliance</dt><dd className="text-foreground">{a.sla_compliance}%</dd></div>
                      <div><dt className="text-muted-foreground">Resolved (prev)</dt><dd className="text-foreground">{a.resolved_prev}</dd></div>
                      <div><dt className="text-muted-foreground">Resolution sample</dt><dd className="text-foreground">{a.resolution_sample} case(s)</dd></div>
                      <div className="col-span-2 lg:col-span-4">
                        <dt className="text-muted-foreground">Skills</dt>
                        <dd className="text-foreground">{a.skills.length ? a.skills.map((s) => s.skill).join(", ") : "—"}</dd>
                      </div>
                    </dl>
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <TablePagination
        total={sorted.length}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
    </TooltipProvider>
  );
}