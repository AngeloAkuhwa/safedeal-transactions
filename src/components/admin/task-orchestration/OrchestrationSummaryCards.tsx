import { AlertOctagon, Users, Gauge, ArrowUpRight, Clock, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { TONE, type ToneKey } from "./helpers";
import type { OrchestrationOverview } from "@/services/task-orchestration.service";

interface Card {
  key: string;
  label: string;
  value: string | number;
  delta?: string;
  deltaTone?: "danger" | "warning" | "success" | "muted";
  icon: any;
  tone: ToneKey;
  onClick?: () => void;
}

const DELTA_COLOR: Record<NonNullable<Card["deltaTone"]>, string> = {
  danger: "text-rose-300",
  warning: "text-amber-300",
  success: "text-emerald-300",
  muted: "text-muted-foreground",
};

export function OrchestrationSummaryCards({
  kpis, onOpenUnassigned, onOpenOverdue, onOpenAtCapacity, onOpenRoster,
  onOpenAssignedToday, teamLabel = "All", rangeLabel = "last 24h",
}: {
  kpis: OrchestrationOverview["kpis"];
  onOpenUnassigned?: () => void;
  onOpenOverdue?: () => void;
  onOpenAtCapacity?: () => void;
  onOpenRoster?: () => void;
  onOpenAssignedToday?: () => void;
  teamLabel?: string;
  rangeLabel?: string;
}) {
  const cards: Card[] = [
    {
      key: "unassigned", label: "Unassigned Tasks", value: kpis.unassigned,
      delta: kpis.unassigned_last_hour > 0 ? `+${kpis.unassigned_last_hour} in last hour` : "steady",
      deltaTone: kpis.unassigned_last_hour > 0 ? "danger" : "muted",
      icon: AlertOctagon, tone: "danger", onClick: onOpenUnassigned,
    },
    {
      key: "active", label: "Active Agents", value: kpis.active_agents,
      delta: `${kpis.available_agents} available`, deltaTone: "success",
      icon: Users, tone: "success", onClick: onOpenRoster,
    },
    {
      key: "capacity", label: "At Capacity", value: kpis.at_capacity,
      delta: kpis.at_capacity > 0 ? "Rebalance needed" : "Load balanced",
      deltaTone: kpis.at_capacity > 0 ? "warning" : "muted",
      icon: Gauge, tone: "warning", onClick: onOpenAtCapacity,
    },
    {
      key: "today", label: "Assigned Today", value: kpis.assigned_today,
      delta: kpis.assigned_delta_pct == null ? "no comparison" : `${kpis.assigned_delta_pct >= 0 ? "+" : ""}${kpis.assigned_delta_pct}% vs yesterday`,
      deltaTone: (kpis.assigned_delta_pct ?? 0) >= 0 ? "success" : "danger",
      icon: ArrowUpRight, tone: "info", onClick: onOpenAssignedToday,
    },
    {
      key: "overdue", label: "Overdue Tasks", value: kpis.overdue,
      delta: kpis.overdue > 0 ? "Escalation needed" : "None overdue",
      deltaTone: kpis.overdue > 0 ? "danger" : "success",
      icon: Clock, tone: "danger", onClick: onOpenOverdue,
    },
    {
      key: "first", label: "Avg First Action", value: `${kpis.avg_first_action_minutes}m`,
      delta: "server-derived", deltaTone: "muted",
      icon: Timer, tone: "primary",
    },
  ];

  return (
    <div className="space-y-2">
    <div className="text-xs text-muted-foreground">
      Range: <span className="text-foreground">{rangeLabel}</span> · Team: <span className="text-foreground">{teamLabel}</span>
    </div>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {cards.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={c.onClick}
          disabled={!c.onClick}
          className={cn(
            "group flex items-start gap-3 rounded-2xl border border-border/50 bg-card/60 p-4 text-left backdrop-blur-sm shadow-[0_1px_0_hsl(var(--border)/0.4)_inset] transition",
            c.onClick && "hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card/80",
          )}
        >
          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", TONE[c.tone])}>
            <c.icon className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{c.label}</div>
            <div className="mt-0.5 text-2xl font-bold leading-none text-foreground">{c.value}</div>
            {c.delta && (
              <div className={cn("mt-1.5 text-xs", DELTA_COLOR[c.deltaTone ?? "muted"])}>{c.delta}</div>
            )}
          </div>
        </button>
      ))}
    </div>
    </div>
  );
}