import { ArrowDown, ArrowUp, Minus, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "./states/EmptyState";
import { rankBadgeClass, scoreTone, hoursLabel } from "./helpers";
import { agentInitials, agentShortName, type AgentPerformanceRow } from "@/services/agent-performance.service";

function Movement({ delta }: { delta: number }) {
  if (delta === 0) return <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Minus className="h-3 w-3" /> Even</span>;
  const up = delta > 0;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", up ? "text-emerald-300" : "text-rose-300")}>
      <Icon className="h-3 w-3" /> {up ? "+" : ""}{delta}
    </span>
  );
}

export function RankingsTable({
  agents, onViewDetail, onViewScore,
}: {
  agents: AgentPerformanceRow[];
  onViewDetail: (a: AgentPerformanceRow) => void;
  onViewScore: (a: AgentPerformanceRow) => void;
}) {
  if (agents.length === 0) {
    return <EmptyState icon={Trophy} title="No ranked agents" hint="Agents appear here once they handle at least one case in the range." />;
  }
  return (
    <div className="space-y-3">
      {agents.map((a) => (
        <div
          key={a.user_id}
          role="button"
          tabIndex={0}
          onClick={() => onViewDetail(a)}
          onKeyDown={(e) => { if (e.key === "Enter") onViewDetail(a); }}
          className={cn(
            "flex w-full items-center gap-4 rounded-xl border border-border/60 bg-background/60 p-4 text-left backdrop-blur-sm transition hover:-translate-y-0.5 hover:border-primary/40",
            a.rank === 1 && "ring-1 ring-inset ring-primary/30",
          )}
        >
          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold", rankBadgeClass(a.rank))}>
            {a.rank}
          </div>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground ring-2 ring-border">
            {agentInitials(a)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-foreground">{agentShortName(a)}</div>
            <div className="text-xs text-muted-foreground">
              {a.role_label} · {a.resolved} resolved · {hoursLabel(a.avg_resolution_hours)} avg
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              Sample: {a.resolved} completed
              {a.score_excluded_cases ? ` · ${a.score_excluded_cases} excluded` : ""}
            </div>
          </div>
          <div className="hidden text-right sm:block">
            <div className="text-xs text-muted-foreground">SLA</div>
            <div className="text-sm font-medium text-foreground">
              {a.sla_compliance == null ? "Not tracked" : `${a.sla_compliance}%`}
            </div>
          </div>
          <div className="text-right">
            {a.insufficient_data ? (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onViewScore(a); }}
                className="rounded-md bg-muted/60 px-2 py-1 text-[11px] font-medium text-muted-foreground ring-1 ring-inset ring-border min-h-11"
              >
                Insufficient Data
              </button>
            ) : (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onViewScore(a); }}
                title="View score breakdown"
                className={cn("text-lg font-bold underline-offset-4 hover:underline", scoreTone(a.score_band))}
              >
                {a.score}
              </button>
            )}
            <div className="text-[11px] text-muted-foreground">{a.score_band}</div>
            <Movement delta={a.resolved - a.resolved_prev} />
          </div>
        </div>
      ))}
    </div>
  );
}