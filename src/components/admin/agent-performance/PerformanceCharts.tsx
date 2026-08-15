import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis,
} from "recharts";
import { INNER_CARD_CLASS } from "./helpers";
import { agentShortName, type AgentPerformanceRow, type AgentTrendPoint } from "@/services/agent-performance.service";

const TOOLTIP_STYLE = {
  background: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 12,
  fontSize: 12,
} as const;

const AXIS = { fontSize: 12, fill: "hsl(var(--muted-foreground))" } as const;

function ChartCard({
  title, subtitle, empty, children,
}: { title: string; subtitle: string; empty: boolean; children: React.ReactNode }) {
  return (
    <div className={INNER_CARD_CLASS}>
      <div className="mb-3">
        <div className="text-sm font-medium text-foreground">{title}</div>
        <div className="text-xs text-muted-foreground">{subtitle}</div>
      </div>
      {empty ? (
        <div className="flex h-48 items-center justify-center text-xs text-muted-foreground">
          No data in this range.
        </div>
      ) : (
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">{children as never}</ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  active: "hsl(var(--primary))",
  waiting: "hsl(45 93% 58%)",
  escalated: "hsl(25 90% 60%)",
  overdue: "hsl(0 84% 65%)",
  resolved: "hsl(152 60% 50%)",
};
const STATUS_LABEL: Record<string, string> = {
  active: "In progress", waiting: "Waiting", escalated: "Escalated",
  overdue: "Overdue", resolved: "Resolved",
};

/** The six visual panels of the Performance tab. */
export function PerformanceCharts({
  trend, agents, statusDistribution, granularity, allTime,
}: {
  trend: AgentTrendPoint[];
  agents: AgentPerformanceRow[];
  statusDistribution: Record<string, number>;
  granularity: "day" | "week" | "month";
  allTime: boolean;
}) {
  const bucketWord = granularity === "day" ? "day" : granularity === "week" ? "week" : "month";
  const trendEmpty = trend.length === 0 || trend.every((t) => t.resolved === 0 && t.assigned === 0);
  const compliancePoints = trend.filter((t) => t.compliance != null);
  const resolutionPoints = trend.filter((t) => t.avg_hours != null || t.prev_avg_hours != null);

  const workload = agents.slice(0, 10).map((a) => ({
    name: agentShortName(a), active: a.active_cases, resolved: a.resolved,
  }));
  const comparison = agents.slice(0, 10).map((a) => ({
    name: agentShortName(a), score: a.score, sla: a.sla_compliance ?? 0,
  }));
  const statusData = Object.entries(statusDistribution ?? {})
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ name: STATUS_LABEL[k] ?? k, key: k, value: v }));

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <ChartCard title="Resolved cases trend" subtitle={`Cases closed per ${bucketWord}`} empty={trendEmpty}>
        <LineChart data={trend} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
          <RTooltip contentStyle={TOOLTIP_STYLE} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="resolved" name="Resolved" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="assigned" name="Assigned" stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
        </LineChart>
      </ChartCard>

      <ChartCard title="SLA compliance trend" subtitle={`On-time share, on-time and breached counts per ${bucketWord}`} empty={compliancePoints.length === 0}>
        <LineChart data={trend} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} />
          <YAxis yAxisId="pct" domain={[0, 100]} tick={AXIS} tickLine={false} axisLine={false} unit="%" />
          <YAxis yAxisId="count" orientation="right" tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
          <RTooltip contentStyle={TOOLTIP_STYLE} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line yAxisId="pct" type="monotone" dataKey="compliance" name="Compliance %" stroke="hsl(152 60% 50%)" strokeWidth={2} dot={false} connectNulls />
          <Line yAxisId="count" type="monotone" dataKey="on_time" name="On time" stroke="hsl(var(--primary))" strokeWidth={1.5} dot={false} />
          <Line yAxisId="count" type="monotone" dataKey="breached" name="Breached" stroke="hsl(0 84% 65%)" strokeWidth={1.5} dot={false} />
        </LineChart>
      </ChartCard>

      <ChartCard title="Average resolution time" subtitle={allTime ? "Lifetime resolution duration" : "Current window versus the preceding one"} empty={resolutionPoints.length === 0}>
        <LineChart data={trend} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} unit="h" />
          <RTooltip contentStyle={TOOLTIP_STYLE} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="avg_hours" name="Current" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} connectNulls />
          {!allTime && <Line type="monotone" dataKey="prev_avg_hours" name="Previous" stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} strokeDasharray="4 4" dot={false} connectNulls />}
        </LineChart>
      </ChartCard>

      <ChartCard title="Assigned versus completed" subtitle={`Cases assigned and completed per ${bucketWord} in the selected scope`} empty={trendEmpty}>
        <BarChart data={trend} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} interval={0} angle={-20} textAnchor="end" height={48} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
          <RTooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "hsl(var(--muted)/0.3)" }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="assigned" name="Assigned" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
          <Bar dataKey="resolved" name="Completed" fill="hsl(152 60% 50%)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartCard>

      <ChartCard title="Open load per agent" subtitle="Active cases currently held by each agent" empty={workload.length === 0}>
        <BarChart data={workload} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
          <XAxis dataKey="name" tick={AXIS} tickLine={false} axisLine={false} interval={0} angle={-20} textAnchor="end" height={48} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
          <RTooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "hsl(var(--muted)/0.3)" }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="active" name="Active now" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartCard>

      <ChartCard title="Case status distribution" subtitle="Live and completed cases across the scope" empty={statusData.length === 0}>
        <PieChart>
          <RTooltip contentStyle={TOOLTIP_STYLE} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={40} outerRadius={68} paddingAngle={2}>
            {statusData.map((d) => <Cell key={d.key} fill={STATUS_COLORS[d.key] ?? "hsl(var(--muted-foreground))"} />)}
          </Pie>
        </PieChart>
      </ChartCard>

      <ChartCard title="Agent comparison" subtitle="Performance score and SLA compliance" empty={comparison.length === 0}>
        <BarChart data={comparison} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
          <XAxis dataKey="name" tick={AXIS} tickLine={false} axisLine={false} interval={0} angle={-20} textAnchor="end" height={48} />
          <YAxis domain={[0, 100]} tick={AXIS} tickLine={false} axisLine={false} />
          <RTooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "hsl(var(--muted)/0.3)" }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="score" name="Score" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
          <Bar dataKey="sla" name="SLA %" fill="hsl(45 93% 58%)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartCard>
    </div>
  );
}