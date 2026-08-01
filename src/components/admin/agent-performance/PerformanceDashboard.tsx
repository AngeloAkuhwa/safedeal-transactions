import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";
import { INNER_CARD_CLASS, hoursLabel, minutesLabel, scoreTone } from "./helpers";
import { EmptyState } from "./states/EmptyState";
import { agentShortName, type AgentPerformanceRow, type AgentTrendPoint } from "@/services/agent-performance.service";
import { Activity } from "lucide-react";

export function PerformanceDashboard({
  agents, trend, onViewDetail,
}: {
  agents: AgentPerformanceRow[];
  trend: AgentTrendPoint[];
  onViewDetail: (a: AgentPerformanceRow) => void;
}) {
  if (agents.length === 0) {
    return <EmptyState icon={Activity} title="No performance data for this range" hint="Widen the date range or clear filters." />;
  }
  const totalResolved = agents.reduce((s, a) => s + a.resolved, 0);
  const totalEscalations = agents.reduce((s, a) => s + a.escalations, 0);
  const totalReassignments = agents.reduce((s, a) => s + a.reassignments, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className={INNER_CARD_CLASS}>
          <div className="text-sm text-muted-foreground">Total Resolved</div>
          <div className="mt-2 text-2xl font-bold text-foreground">{totalResolved}</div>
          <div className="mt-1 text-xs text-muted-foreground">Across {agents.length} agents</div>
        </div>
        <div className={INNER_CARD_CLASS}>
          <div className="text-sm text-muted-foreground">Escalations</div>
          <div className="mt-2 text-2xl font-bold text-foreground">{totalEscalations}</div>
          <div className="mt-1 text-xs text-amber-300">Raised out of the assigned tier</div>
        </div>
        <div className={INNER_CARD_CLASS}>
          <div className="text-sm text-muted-foreground">Reassignments</div>
          <div className="mt-2 text-2xl font-bold text-foreground">{totalReassignments}</div>
          <div className="mt-1 text-xs text-muted-foreground">Cases moved between agents</div>
        </div>
      </div>

      <div className={INNER_CARD_CLASS}>
        <div className="mb-4 text-sm font-medium text-foreground">Resolution trend</div>
        {trend.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">No activity recorded in this range.</div>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <RTooltip
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 12, fontSize: 12,
                  }}
                />
                <Line type="monotone" dataKey="resolved" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Resolved" />
                <Line type="monotone" dataKey="breached" stroke="hsl(0 84% 65%)" strokeWidth={2} dot={false} name="Breached" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px]">
          <thead>
            <tr className="border-b border-border/70">
              {["Agent", "Resolved", "Prev Period", "Avg Resolution", "Avg First Action", "Escalations", "Score"].map((h, i) => (
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
                <tr
                  key={a.user_id}
                  className="cursor-pointer border-b border-border/60 transition-colors hover:bg-card/50"
                  onClick={() => onViewDetail(a)}
                >
                  <td className="px-4 py-3 text-sm font-medium text-foreground">{agentShortName(a)}</td>
                  <td className="px-4 py-3 text-center text-sm text-foreground">{a.resolved}</td>
                  <td className="px-4 py-3 text-center text-sm">
                    <span className="text-muted-foreground">{a.resolved_prev}</span>
                    <span className={cn("ml-2 text-xs", delta >= 0 ? "text-emerald-300" : "text-rose-300")}>
                      {delta >= 0 ? "+" : ""}{delta}
                    </span>
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