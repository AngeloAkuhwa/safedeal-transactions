import { cn } from "@/lib/utils";
import { INNER_CARD_CLASS } from "./helpers";
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
};

const NOTE_TONE: Record<Card["noteTone"], string> = {
  success: "text-emerald-300",
  warning: "text-amber-300",
  danger: "text-rose-300",
  primary: "text-primary",
  muted: "text-muted-foreground",
};

export function AgentPerformanceSummary({
  summary, rangeLabel, onOpenRoster, onOpenOverdue, onOpenResolved, onOpenTopAgent, onOpenDisputes,
}: {
  summary: AgentPerformanceSummaryData;
  rangeLabel: string;
  onOpenRoster?: () => void;
  onOpenOverdue?: () => void;
  onOpenResolved?: () => void;
  onOpenTopAgent?: () => void;
  onOpenDisputes?: () => void;
}) {
  const cards: Card[] = [
    {
      key: "active",
      label: "Active Agents",
      value: String(summary.active_agents),
      note: summary.active_agents_delta > 0
        ? `+${summary.active_agents_delta} this period`
        : summary.active_agents_delta < 0 ? `${summary.active_agents_delta} this period` : "No change",
      noteTone: summary.active_agents_delta >= 0 ? "success" : "danger",
      onClick: onOpenRoster,
      title: "Show all agents",
    },
    {
      key: "open",
      label: "Open Disputes",
      value: String(summary.open_disputes),
      note: "Assigned",
      noteTone: "warning",
      onClick: onOpenDisputes,
      title: "Open the dispute queue",
    },
    {
      key: "resolved",
      label: "Resolved This Week",
      value: String(summary.resolved_in_window),
      note: summary.resolved_delta_pct == null
        ? "No prior period"
        : `${summary.resolved_delta_pct >= 0 ? "+" : ""}${summary.resolved_delta_pct}% vs last period`,
      noteTone: (summary.resolved_delta_pct ?? 0) >= 0 ? "success" : "danger",
      onClick: onOpenResolved,
      title: "Rank agents by resolved volume",
    },
    {
      key: "avg",
      label: "Avg Resolution",
      value: summary.avg_resolution_hours == null ? "—" : `${summary.avg_resolution_hours}h`,
      note: summary.avg_resolution_delta == null
        ? "No prior period"
        : summary.avg_resolution_delta <= 0
          ? `${Math.abs(summary.avg_resolution_delta)}h improvement`
          : `+${summary.avg_resolution_delta}h slower`,
      noteTone: (summary.avg_resolution_delta ?? 0) <= 0 ? "success" : "danger",
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
      value: summary.top_agent?.name ?? "—",
      note: summary.top_agent ? `${summary.top_agent.score}% score` : "No ranked agents",
      noteTone: "primary",
      onClick: summary.top_agent ? onOpenTopAgent : undefined,
      title: "Open top agent detail",
    },
  ];

  return (
    <section className="rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur-sm shadow-[0_1px_0_hsl(var(--border)/0.4)_inset] lg:p-6">
      <div className="mb-3 text-[11px] text-muted-foreground">
        Range: <span className="text-foreground">{rangeLabel}</span> · Live now:{" "}
        <span className="text-foreground">{summary.live_agents}</span>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {cards.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={c.onClick}
            disabled={!c.onClick}
            title={c.onClick ? c.title : undefined}
            className={cn(
              INNER_CARD_CLASS,
              "text-left transition",
              c.accent && "border-l-4 border-l-rose-500",
              c.onClick && "hover:-translate-y-0.5 hover:border-primary/40",
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
        ))}
      </div>
    </section>
  );
}