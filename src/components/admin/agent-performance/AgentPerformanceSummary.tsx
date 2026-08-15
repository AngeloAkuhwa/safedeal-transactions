import { cn } from "@/lib/utils";
import { INNER_CARD_CLASS } from "./helpers";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { AgentPerformanceSummaryData } from "@/services/agent-performance.service";

type Card = {
  key: string;
  label: string;
  value: string;
  note: string;
  noteTone: "success" | "warning" | "danger" | "primary" | "muted";
  accent?: boolean;
  onClick?: () => void;
  title?: string;
  tooltip?: string;
};

const NOTE_TONE: Record<Card["noteTone"], string> = {
  success: "text-emerald-300",
  warning: "text-amber-300",
  danger: "text-rose-300",
  primary: "text-primary",
  muted: "text-muted-foreground",
};

export function AgentPerformanceSummary({
  summary, rangeLabel, selected, onOpenRoster, onOpenOverdue, onOpenResolved,
  onOpenTopAgent, onOpenDisputes, onOpenPerformance,
}: {
  summary: AgentPerformanceSummaryData;
  rangeLabel: string;
  selected?: string | null;
  onOpenRoster?: () => void;
  onOpenOverdue?: () => void;
  onOpenResolved?: () => void;
  onOpenTopAgent?: () => void;
  onOpenDisputes?: () => void;
  onOpenPerformance?: () => void;
}) {
  const resolvedLabel = summary.resolved_label ?? rangeLabel;
  const cards: Card[] = [
    {
      key: "active",
      label: "Active Agents",
      value: String(summary.active_agents),
      note: summary.active_agents_delta == null
        ? "All-time roster"
        : summary.active_agents_delta > 0
          ? `+${summary.active_agents_delta} this period`
          : summary.active_agents_delta < 0
            ? `${summary.active_agents_delta} this period`
            : "No change",
      noteTone: (summary.active_agents_delta ?? 0) >= 0 ? "success" : "danger",
      onClick: onOpenRoster,
      title: "Show all agents",
    },
    {
      key: "open",
      label: "Open Disputes",
      value: String(summary.open_disputes),
      note: `${summary.open_disputes} assigned · ${summary.open_disputes_unassigned} unassigned`,
      noteTone: "warning",
      onClick: onOpenDisputes,
      title: "Filter to open dispute work",
    },
    {
      key: "resolved",
      label: `Resolved · ${resolvedLabel}`,
      value: String(summary.resolved_in_window),
      note: summary.resolved_delta_pct == null
        ? "No prior period"
        : `${summary.resolved_delta_pct >= 0 ? "+" : ""}${summary.resolved_delta_pct}% vs last period`,
      noteTone: (summary.resolved_delta_pct ?? 0) >= 0 ? "success" : "danger",
      onClick: onOpenResolved,
      title: "Open resolved work for this period",
    },
    {
      key: "avg",
      label: "Avg Resolution",
      value: summary.avg_resolution_hours == null ? "—" : `${summary.avg_resolution_hours}h`,
      note: summary.avg_resolution_sample === 0
        ? "No completed cases"
        : summary.avg_resolution_delta == null
          ? "No prior period"
          : summary.avg_resolution_delta <= 0
            ? `${Math.abs(summary.avg_resolution_delta)}h improvement`
            : `+${summary.avg_resolution_delta}h slower`,
      noteTone: (summary.avg_resolution_delta ?? 0) <= 0 ? "success" : "danger",
      onClick: onOpenPerformance,
      title: "Open the Performance tab",
      tooltip: `Based on ${summary.avg_resolution_sample} completed case${summary.avg_resolution_sample === 1 ? "" : "s"} with a recorded start and resolution (${summary.avg_resolution_sample_tasks ?? 0} from tasks, ${summary.avg_resolution_sample_disputes ?? 0} from disputes). Open, cancelled and incomplete records are excluded.`,
    },
    {
      key: "overdue",
      label: "Overdue Cases",
      value: String(summary.overdue_cases),
      note: summary.overdue_cases > 0 ? "Needs attention" : "All within SLA",
      noteTone: summary.overdue_cases > 0 ? "danger" : "success",
      accent: true,
      onClick: onOpenOverdue,
      title: "Filter to agents with overdue cases",
    },
    {
      key: "top",
      label: "Top Agent",
      value: summary.top_agent?.name ?? "Insufficient data",
      note: summary.top_agent ? `${summary.top_agent.score}% score` : "Not enough completed work",
      noteTone: "primary",
      onClick: summary.top_agent ? onOpenTopAgent : undefined,
      title: "Open top agent detail",
    },
  ];

  return (
   <TooltipProvider delayDuration={200}>
    <section className="rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur-sm shadow-[0_1px_0_hsl(var(--border)/0.4)_inset] lg:p-6">
      <div className="mb-3 text-xs text-muted-foreground">
        Range: <span className="text-foreground">{rangeLabel}</span> · Live now:{" "}
        <span className="text-foreground">{summary.live_agents}</span>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {cards.map((c) => {
          const button = (
          <button
            key={c.key}
            type="button"
            onClick={c.onClick}
            disabled={!c.onClick}
            title={c.onClick ? c.title : undefined}
            aria-pressed={selected === c.key}
            className={cn(
              INNER_CARD_CLASS,
              "text-left transition min-h-11 inline-flex items-center",
              c.accent && "border-l-4 border-l-rose-500",
              c.onClick && "hover:-translate-y-0.5 hover:border-primary/40",
              selected === c.key && "border-primary/60 ring-1 ring-inset ring-primary/40",
            )}
          >
            <div className="text-sm text-muted-foreground">{c.label}</div>
            <div className={cn(
              "mb-1 mt-2 font-bold text-foreground",
              c.key === "top" ? "truncate text-lg" : "text-2xl lg:text-3xl",
            )}>
              {c.value}
            </div>
            <div className={cn("text-xs", NOTE_TONE[c.noteTone])}>{c.note}</div>
          </button>
          );
          if (!c.tooltip) return button;
          return (
            <Tooltip key={c.key}>
              <TooltipTrigger asChild>{button}</TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs">{c.tooltip}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </section>
   </TooltipProvider>
  );
}