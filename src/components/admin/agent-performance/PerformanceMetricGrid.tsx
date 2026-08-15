import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { INNER_CARD_CLASS, hoursLabel, minutesLabel, slaTone } from "./helpers";
import type { AgentPerformanceMetrics } from "@/services/agent-performance.service";

type Tile = {
  label: string;
  value: string;
  note?: string;
  tone?: string;
  hint: string;
  /** Calculation and data-source detail shown under the hint. */
  calc?: string;
  sample?: number | null;
};

/** Headline metrics for the Performance tab, all scoped to the active filters. */
export function PerformanceMetricGrid({
  metrics, rangeLabel,
}: { metrics: AgentPerformanceMetrics; rangeLabel: string }) {
  const notTracked = "Not tracked yet — no field in the case record captures this.";
  const tiles: Tile[] = [
    {
      label: "Cases assigned", value: String(metrics.cases_assigned),
      note: `${metrics.agents_counted} agents in scope`,
      hint: "Cases whose assignment timestamp falls inside the selected window.",
      calc: "count(orchestration_tasks.assigned_at in window) · source: orchestration_tasks",
    },
    {
      label: "Cases started", value: String(metrics.cases_started),
      note: "First work logged",
      hint: "Cases an agent actively started (started_at) inside the window.",
      calc: "count(orchestration_tasks.started_at in window) · source: orchestration_tasks",
    },
    {
      label: "Cases resolved", value: String(metrics.cases_resolved),
      note: rangeLabel,
      hint: "Tasks closed plus disputes personally resolved by these agents in the window.",
      calc: "count(distinct case identity: task resolved_at, plus dispute outcomes with no task) · sources: orchestration_tasks, dispute_outcomes",
    },
    {
      label: "Resolution rate",
      value: metrics.resolution_rate == null ? "—" : `${metrics.resolution_rate}%`,
      tone: metrics.resolution_rate == null ? undefined : slaTone(metrics.resolution_rate),
      note: "Resolved ÷ assigned",
      hint: "Share of cases assigned in this window that are already resolved.",
      calc: "cases_resolved ÷ cases_assigned × 100",
    },
    {
      label: "Avg first action",
      value: minutesLabel(metrics.avg_first_action_minutes),
      note: "Assignment → first action",
      hint: "Mean time between assignment and the first recorded action on the case.",
      calc: "mean(first_action_at − assigned_at) over cases with both timestamps",
      sample: metrics.first_action_sample ?? null,
    },
    {
      label: "Avg resolution",
      value: hoursLabel(metrics.avg_resolution_hours),
      note: metrics.avg_resolution_prev_hours == null
        ? "No comparable previous window"
        : `Previous ${hoursLabel(metrics.avg_resolution_prev_hours)}`,
      hint: "Mean assignment-to-resolution time across completed cases.",
      calc: "mean(resolved_at − assigned_at) over resolved cases (tasks + dispute-only)",
      sample: metrics.resolution_sample ?? null,
    },
    {
      label: "SLA compliance",
       value: metrics.sla_compliance == null ? "No tracked cases" : `${metrics.sla_compliance}%`,
      tone: metrics.sla_compliance == null ? undefined : slaTone(metrics.sla_compliance),
       note: metrics.sla_compliance == null ? "SLA due dates unavailable" : "Completed on time",
      hint: "Completed cases closed on or before their due date.",
      calc: "on-time completions ÷ completions with a due date × 100 · cases without SLA excluded",
      sample: metrics.sla_sample ?? null,
    },
    {
      label: "Overdue rate",
      value: metrics.overdue_rate == null ? "—" : `${metrics.overdue_rate}%`,
      tone: metrics.overdue_rate == null ? undefined : slaTone(100 - metrics.overdue_rate),
      note: "Of live cases",
      hint: "Share of currently open cases that are past their due date.",
      calc: "open cases past due_at ÷ open cases with a due date × 100",
    },
    {
      label: "Escalated", value: String(metrics.cases_escalated),
      note: "Raised out of tier",
      hint: "Cases escalated while owned by an agent in scope.",
    },
    {
      label: "Reassigned away", value: String(metrics.cases_reassigned_away),
      note: "Moved to another agent",
      hint: "Cases taken off an agent in scope during the window.",
    },
    {
      label: "Reopened cases",
      value: metrics.reopened_cases == null ? "Not tracked" : String(metrics.reopened_cases),
      note: "Awaiting instrumentation",
      hint: notTracked,
    },
    {
      label: "Quality review",
      value: metrics.quality_review_score == null ? "Not tracked" : `${metrics.quality_review_score}`,
      note: "Awaiting instrumentation",
      hint: notTracked,
    },
  ];

  return (
    <TooltipProvider delayDuration={150}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className={cn(INNER_CARD_CLASS, "p-3")}>
            <div className="flex items-center gap-1.5">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">{t.label}</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" aria-label={`About ${t.label}`} className="text-muted-foreground/70 hover:text-foreground relative inline-flex items-center justify-center before:absolute before:-inset-4 before:content-[''] min-h-11 min-w-11">
                    <Info className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-[280px] space-y-1 text-xs">
                  <div>{t.hint}</div>
                  {t.calc && <div className="text-muted-foreground">{t.calc}</div>}
                  {t.sample != null && <div className="text-muted-foreground">Sample size: {t.sample}</div>}
                </TooltipContent>
              </Tooltip>
            </div>
            <div className={cn(
              "mt-1.5 font-semibold tabular-nums",
              t.value === "Not tracked" ? "text-sm text-muted-foreground" : "text-xl text-foreground",
              t.tone,
            )}>
              {t.value}
            </div>
            {t.note && <div className="mt-0.5 text-xs text-muted-foreground">{t.note}</div>}
          </div>
        ))}
      </div>
    </TooltipProvider>
  );
}