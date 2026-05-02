import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  buildTransactionsDisputesTrend,
  type TrendSeries,
} from "@/services/admin-dashboard.service";

type Win = "7D" | "30D" | "90D";

function ChartCard({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        {right}
      </div>
      <div className="h-[260px]">{children}</div>
    </div>
  );
}

const tooltipStyle = {
  backgroundColor: "rgb(15 23 42)",
  border: "1px solid rgb(51 65 85)",
  borderRadius: 8,
  fontSize: 12,
  color: "white",
};

interface TrendChartsProps {
  initialTransactions: TrendSeries;
  escrow: TrendSeries;
}

export function TrendCharts({ initialTransactions, escrow }: TrendChartsProps) {
  const [win, setWin] = useState<Win>("7D");
  const txSeries = useMemo<TrendSeries>(
    () => (win === "7D" ? initialTransactions : buildTransactionsDisputesTrend(win)),
    [win, initialTransactions],
  );

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <ChartCard
        title="Transactions vs Disputes Trend"
        right={
          <div className="inline-flex rounded-md border border-slate-700 bg-slate-800/60 p-0.5 text-[11px]">
            {(["7D", "30D", "90D"] as Win[]).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setWin(w)}
                className={`rounded-sm px-2.5 py-1 transition-colors ${
                  win === w ? "bg-blue-500/20 text-blue-300" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {w}
              </button>
            ))}
          </div>
        }
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={txSeries.points} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid stroke="rgb(30 41 59)" strokeDasharray="3 3" />
            <XAxis dataKey="label" stroke="rgb(100 116 139)" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke="rgb(100 116 139)" fontSize={11} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: "rgb(59 130 246)", strokeOpacity: 0.2 }} />
            <Line type="monotone" dataKey="primary" name={txSeries.primary_label} stroke="rgb(59 130 246)" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="secondary" name={txSeries.secondary_label} stroke="rgb(249 115 22)" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Escrow, Releases & Refunds"
        right={<span className="text-[11px] text-slate-400">Last 30 days</span>}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={escrow.points} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="held" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgb(16 185 129)" stopOpacity={0.4} />
                <stop offset="100%" stopColor="rgb(16 185 129)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="released" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgb(59 130 246)" stopOpacity={0.4} />
                <stop offset="100%" stopColor="rgb(59 130 246)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="refunded" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgb(239 68 68)" stopOpacity={0.4} />
                <stop offset="100%" stopColor="rgb(239 68 68)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgb(30 41 59)" strokeDasharray="3 3" />
            <XAxis dataKey="label" stroke="rgb(100 116 139)" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke="rgb(100 116 139)" fontSize={11} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Area type="monotone" dataKey="primary" name={escrow.primary_label} stroke="rgb(16 185 129)" fill="url(#held)" strokeWidth={2} />
            <Area type="monotone" dataKey="secondary" name={escrow.secondary_label} stroke="rgb(59 130 246)" fill="url(#released)" strokeWidth={2} />
            <Area type="monotone" dataKey="tertiary" name={escrow.tertiary_label} stroke="rgb(239 68 68)" fill="url(#refunded)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}