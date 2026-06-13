import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, BarChart, Bar, Legend,
} from "recharts";
import type { EscrowTrends } from "@/services/admin-escrow.service";

const STATE_COLORS: Record<string, string> = {
  Held: "#10b981",
  Frozen: "#ef4444",
  "Pending Release": "#f97316",
  Refunded: "#a855f7",
  Released: "#06b6d4",
};

function fmtDay(d: string): string {
  const dt = new Date(d + "T00:00:00Z");
  return dt.toLocaleDateString("en-NG", { month: "short", day: "numeric" });
}

function fmtCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `₦${(n / 1_000).toFixed(0)}k`;
  return `₦${n}`;
}

function Panel({ title, subtitle, children, className }: { title: string; subtitle: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-slate-900 border border-slate-800 rounded-xl ${className ?? ""}`}>
      <div className="p-4 lg:p-6 border-b border-slate-800">
        <h3 className="text-white text-base lg:text-lg font-semibold">{title}</h3>
        <p className="text-slate-400 text-xs lg:text-sm mt-1">{subtitle}</p>
      </div>
      <div className="p-3 lg:p-6">{children}</div>
    </div>
  );
}

export function EscrowCharts({ trends }: { trends: EscrowTrends }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
      <Panel title="Escrow Balance Trend" subtitle="Total funds held over the last 30 days">
        <div className="h-[240px] lg:h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trends.balance_30d} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" tickFormatter={fmtDay} stroke="#64748b" fontSize={11} />
              <YAxis tickFormatter={fmtCompact} stroke="#64748b" fontSize={11} width={50} />
              <Tooltip
                contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", borderRadius: 8, color: "#fff" }}
                formatter={(v: number) => fmtCompact(v)}
                labelFormatter={fmtDay}
              />
              <Line type="monotone" dataKey="balance" stroke="#10b981" strokeWidth={2} dot={false} fill="url(#balGrad)" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title="Escrow State Distribution" subtitle="Current breakdown by escrow status">
        <div className="h-[240px] lg:h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={trends.state_distribution} dataKey="value" nameKey="state" innerRadius="55%" outerRadius="85%" paddingAngle={2}>
                {trends.state_distribution.map((d) => (
                  <Cell key={d.state} fill={STATE_COLORS[d.state] ?? "#64748b"} stroke="#0f172a" />
                ))}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", borderRadius: 8, color: "#fff" }} />
              <Legend wrapperStyle={{ color: "#cbd5e1", fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title="Held vs Released vs Refunded Trend" subtitle="Daily comparison of escrow flow over the last 14 days" className="lg:col-span-2">
        <div className="h-[280px] lg:h-[350px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trends.flow_14d} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" tickFormatter={fmtDay} stroke="#64748b" fontSize={11} />
              <YAxis tickFormatter={fmtCompact} stroke="#64748b" fontSize={11} width={50} />
              <Tooltip
                contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", borderRadius: 8, color: "#fff" }}
                formatter={(v: number) => fmtCompact(v)}
                labelFormatter={fmtDay}
              />
              <Legend wrapperStyle={{ color: "#cbd5e1", fontSize: 12 }} />
              <Bar dataKey="held" name="Held" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="released" name="Released" fill="#06b6d4" radius={[4, 4, 0, 0]} />
              <Bar dataKey="refunded" name="Refunded" fill="#a855f7" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>
    </div>
  );
}