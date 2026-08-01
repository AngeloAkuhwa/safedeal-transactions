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
    },
    {
      label: "Cases started", value: String(metrics.cases_started),
      note: "First work logged",
      hint: "Cases an agent actively started (started_at) inside the window.",
    },
    {
      label: "Cases resolved", value: String(metrics.cases_resolved),
      note: rangeLabel,
      hint: "Tasks closed plus disputes personally resolved by these agents in the window.",
    },
    {
      label: "Resolution rate",
      value: metrics.resolution_rate == null ? "—" : `${metrics.resolution_rate}%`,
      tone: metrics.resolution_rate == null ? undefined : slaTone(metrics.resolution_rate),
      note: "Resolved ÷ assigned",
      hint: "Share of cases assigned in this window that are already resolved.",
    },
    {
      label: "Avg first action",
      value: minutesLabel(metrics.avg_first_action_minutes),
      note: "Assignment → first action",
      hint: "Mean time between assignment and the first recorded action on the case.",
    },
    {
      label: "Avg resolution",
      value: hoursLabel(metrics.avg_resolution_hours),
      note: metrics.avg_resolution_prev_hours == null
        ? "No comparable previous window"
        : `Previous ${hoursLabel(metrics.avg_resolution_prev_hours)}`,
      hint: "Mean assignment-to-resolution time across completed cases.",
    },
    {
      label: "SLA compliance",
       value: metrics.sla_compliance == null ? "No tracked cases" : `${metrics.sla_compliance}%`,
      tone: metrics.sla_compliance == null ? undefined : slaTone(metrics.sla_compliance),
       note: metrics.sla_compliance == null ? "SLA due dates unavailable" : "Completed on time",
      hint: "Completed cases closed on or before their due date.",
    },
    {
      label: "Overdue rate",
      value: metrics.overdue_rate == null ? "—" : `${metrics.overdue_rate}%`,
      tone: metrics.overdue_rate == null ? undefined : slaTone(100 - metrics.overdue_rate),
      note: "Of live cases",
      hint: "Share of currently open cases that are past their due date.",
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
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{t.label}</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" aria-label={`About ${t.label}`} className="text-muted-foreground/70 hover:text-foreground">
                    <Info className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-[240px] text-xs">{t.hint}</TooltipContent>
              </Tooltip>
            </div>
            <div className={cn(
              "mt-1.5 font-semibold tabular-nums",
              t.value === "Not tracked" ? "text-sm text-muted-foreground" : "text-xl text-foreground",
              t.tone,
            )}>
              {t.value}
            </div>
            {t.note && <div className="mt-0.5 text-[11px] text-muted-foreground">{t.note}</div>}
          </div>
        ))}
      </div>
    </TooltipProvider>
  );
}