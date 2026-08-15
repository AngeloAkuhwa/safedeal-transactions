import { cn } from "@/lib/utils";
import { hoursLabel, minutesLabel, scoreTone } from "./helpers";
import { EmptyState } from "./states/EmptyState";
import { PerformanceMetricGrid } from "./PerformanceMetricGrid";
import { PerformanceCharts } from "./PerformanceCharts";
import {
  agentShortName,
  type AgentPerformanceMetrics, type AgentPerformanceRow, type AgentTrendPoint,
} from "@/services/agent-performance.service";
import { Activity } from "lucide-react";
import { keyActivate } from "@/lib/a11y";

/**
 * Performance tab: headline metrics, six trend/comparison panels and the
 * per-agent breakdown. Everything reads the same filtered window as the cards.
 */
export function PerformanceDashboard({
  agents, trend, metrics, statusDistribution, rangeLabel, allTime, onViewDetail,
}: {
  agents: AgentPerformanceRow[];
  trend: AgentTrendPoint[];
  metrics: AgentPerformanceMetrics;
  statusDistribution: Record<string, number>;
  rangeLabel: string;
  allTime: boolean;
  onViewDetail: (a: AgentPerformanceRow) => void;
}) {
  if (agents.length === 0) {
    return <EmptyState icon={Activity} title="No performance data for this range" hint="Widen the date range or clear filters." />;
  }

  return (
    <div className="space-y-6">
      <PerformanceMetricGrid metrics={metrics} rangeLabel={rangeLabel} />

      <PerformanceCharts
        trend={trend}
        agents={agents}
        statusDistribution={statusDistribution}
        granularity={metrics.granularity}
        allTime={allTime}
      />

      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] sd-stack">
          <thead>
            <tr className="border-b border-border/70">
              {["Agent", "Resolved", allTime ? "Lifetime" : "Prev Period", "Avg Resolution", "Avg First Action", "Escalations", "Score"].map((h, i) => (
                <th key={h} className={cn("px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground", i === 0 ? "text-left" : "text-center")}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {agents.map((a) => {
              const delta = a.resolved - a.resolved_prev;
              return (
                <tr role="button" tabIndex={0} onKeyDown={keyActivate}
                  key={a.user_id}
                  className="cursor-pointer border-b border-border/60 transition-colors hover:bg-card/50"
                  onClick={() => onViewDetail(a)}
                >
                  <td className="px-4 py-3 text-sm font-medium text-foreground">{agentShortName(a)}</td>
                  <td className="px-4 py-3 text-center text-sm text-foreground">{a.resolved}</td>
                  <td className="px-4 py-3 text-center text-sm">
                    {allTime ? (
                      <span className="text-xs text-muted-foreground">No comparison</span>
                    ) : (
                      <>
                        <span className="text-muted-foreground">{a.resolved_prev}</span>
                        <span className={cn("ml-2 text-xs", delta >= 0 ? "text-emerald-300" : "text-rose-300")}>
                          {delta >= 0 ? "+" : ""}{delta}
                        </span>
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-sm text-foreground">{hoursLabel(a.avg_resolution_hours)}</td>
                  <td className="px-4 py-3 text-center text-sm text-foreground">{minutesLabel(a.avg_first_action_minutes)}</td>
                  <td className="px-4 py-3 text-center text-sm text-foreground">{a.escalations}</td>
                  <td className={cn("px-4 py-3 text-center text-sm font-bold", scoreTone(a.score_band))}>{a.score}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}