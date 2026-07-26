import { Activity, CheckCircle2, GaugeCircle, Clock8, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { CARD_CLASS, TONE, initialsOf, nameOf, type ToneKey } from "./helpers";
import type { AgentRosterEntry, OrchestrationOverview } from "@/services/task-orchestration.service";

interface Item {
  key: string;
  label: string;
  icon: any;
  tone: ToneKey;
  agent: AgentRosterEntry | null;
  value: (a: AgentRosterEntry) => string;
  valueTone: string;
}

export function ProductivityInsights({ insights }: { insights: OrchestrationOverview["insights"] }) {
  const items: Item[] = [
    { key: "active", label: "Most Active", icon: Activity, tone: "success",
      agent: insights.most_active, value: a => `${a.tasks_today} tasks today`, valueTone: "text-emerald-300" },
    { key: "resolved", label: "Most Resolved", icon: CheckCircle2, tone: "success",
      agent: insights.most_resolved, value: a => `${a.resolved_today} completed`, valueTone: "text-emerald-300" },
    { key: "least", label: "Least Loaded", icon: GaugeCircle, tone: "primary",
      agent: insights.least_loaded, value: a => `${a.active} active task${a.active === 1 ? "" : "s"}`, valueTone: "text-primary" },
    { key: "overdue", label: "Highest Overdue", icon: Clock8, tone: "danger",
      agent: insights.highest_overdue, value: a => `${a.overdue} overdue`, valueTone: "text-rose-300" },
    { key: "fastest", label: "Fastest Response", icon: Zap, tone: "info",
      agent: insights.fastest_response, value: a => `Avg ${Math.round(a.avg_first_action_seconds / 60)}m`, valueTone: "text-sky-300" },
  ];
  return (
    <section className={CARD_CLASS}>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground">Productivity &amp; Load Insights</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">Real-time performance signals across the roster</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {items.map(it => (
          <div key={it.key} className="rounded-xl border border-border/60 bg-background/40 p-4 backdrop-blur-sm">
            <div className="mb-3 flex items-center gap-2">
              <div className={cn("flex h-7 w-7 items-center justify-center rounded-lg", TONE[it.tone])}>
                <it.icon className="h-3.5 w-3.5" />
              </div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{it.label}</div>
            </div>
            <div className="mb-1 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground">
                {it.agent?.avatar_url
                  ? <img src={it.agent.avatar_url} className="h-full w-full rounded-full object-cover" alt="" />
                  : initialsOf(it.agent)}
              </div>
              <div className="min-w-0 truncate text-sm font-medium text-foreground">{nameOf(it.agent)}</div>
            </div>
            <div className={cn("text-[11px] font-medium", it.valueTone)}>
              {it.agent ? it.value(it.agent) : "—"}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}