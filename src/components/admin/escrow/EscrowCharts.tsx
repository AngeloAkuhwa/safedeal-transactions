import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, BarChart, Bar, Legend,
} from "recharts";
import type { EscrowTrends } from "@/services/admin-escrow.service";
import { ADMIN_GROUND } from "@/components/admin/palette";
import { formatMoneyCompactOrDash } from "@/lib/payment/money-format";

const STATE_COLORS: Record<string, string> = {
  Held: "#3b82f6",
  Frozen: "#ef4444",
  "Pending Release": "#f97316",
  Refunded: "#a855f7",
  Released: "#10b981",
};

function fmtDay(d: string): string {
  const dt = new Date(d + "T00:00:00Z");
  return dt.toLocaleDateString("en-NG", { month: "short", day: "numeric" });
}

function Panel({ title, subtitle, children, className }: { title: string; subtitle: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`${ADMIN_GROUND.panel} border rounded-xl ${className ?? ""}`}>
      <div className="p-4 lg:p-6 border-b border-slate-800">
        <h3 className="text-white text-base lg:text-lg font-semibold">{title}</h3>
        <p className="text-slate-400 text-xs lg:text-sm mt-1">{subtitle}</p>
      </div>
      <div className="p-3 lg:p-6">{children}</div>
    </div>
  );
}

export function EscrowCharts({ trends }: { trends: EscrowTrends }) {
  // Same ladder as the KPI tiles above. One formatter, one currency source.
  const fmtMoney = (n: number) => formatMoneyCompactOrDash(n, trends.currency_code);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
      <Panel title="Escrow Balance Trend" subtitle="Total funds held over the last 30 days">
        <div className="h-[240px] lg:h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trends.balance_30d} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" tickFormatter={fmtDay} stroke="#94a3b8" fontSize={12} />
              <YAxis tickFormatter={fmtMoney} stroke="#94a3b8" fontSize={12} width={72} />
              <Tooltip
                contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", borderRadius: 8, color: "#fff" }}
                formatter={(v: number) => fmtMoney(v)}
                labelFormatter={fmtDay}
              />
              <Area type="monotone" dataKey="balance" stroke="#10b981" strokeWidth={3} fill="url(#balGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title="Escrow State Distribution" subtitle="Current breakdown by escrow status">
        <div className="h-[240px] lg:h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={trends.state_distribution}
                dataKey="value"
                nameKey="state"
                outerRadius="85%"
                label={({ name, percent }) =>
                  percent && percent > 0.02 ? `${name} ${(percent * 100).toFixed(1)}%` : ""
                }
                labelLine={false}
                stroke="#0f172a"
              >
                {trends.state_distribution.map((d) => (
                  <Cell key={d.state} fill={STATE_COLORS[d.state] ?? "#64748b"} stroke="#0f172a" />
                ))}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", borderRadius: 8, color: "#fff" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title="Held vs Released vs Refunded Trend" subtitle="Daily comparison of escrow flow over the last 14 days" className="lg:col-span-2">
        <div className="h-[280px] lg:h-[350px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trends.flow_14d} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" tickFormatter={fmtDay} stroke="#94a3b8" fontSize={12} />
              <YAxis tickFormatter={fmtMoney} stroke="#94a3b8" fontSize={12} width={72} />
              <Tooltip
                contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", borderRadius: 8, color: "#fff" }}
                formatter={(v: number) => fmtMoney(v)}
                labelFormatter={fmtDay}
              />
              <Legend wrapperStyle={{ color: "#94a3b8", fontSize: 12 }} />
              <Bar dataKey="held" name="Held" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="released" name="Released" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="refunded" name="Refunded" fill="#a855f7" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>
    </div>
  );
}