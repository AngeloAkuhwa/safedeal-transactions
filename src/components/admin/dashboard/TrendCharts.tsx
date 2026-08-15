import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
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
  AdminAccessRequiredError,
  getAdminDashboardTrend,
  type TrendSeries,
} from "@/services/admin-dashboard.service";

type Win = "7D" | "30D" | "90D";

function ChartCard({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {right}
      </div>
      <div className="h-[260px]">{children}</div>
    </div>
  );
}

const tooltipStyle = {
  backgroundColor: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  fontSize: 12,
  color: "hsl(var(--popover-foreground))",
};

interface TrendChartsProps {
  initialTransactions: TrendSeries;
  escrow: TrendSeries;
}

export function TrendCharts({ initialTransactions, escrow }: TrendChartsProps) {
  const [win, setWin] = useState<Win>("7D");
  const { data, isFetching } = useQuery({
    queryKey: ["admin-dashboard-trend", win],
    queryFn: () => getAdminDashboardTrend(win),
    staleTime: 30_000,
    initialData: win === "7D" ? initialTransactions : undefined,
    retry: (count, err) => !(err instanceof AdminAccessRequiredError) && count < 1,
  });
  const txSeries: TrendSeries = data ?? {
    primary_label: "Transactions",
    secondary_label: "Disputes",
    points: [],
  };

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <ChartCard
        title="Transactions vs Disputes Trend"
        right={
          <div className="inline-flex items-center gap-2">
            {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
            <div className="inline-flex rounded-md border border-border bg-muted/60 p-0.5 text-[11px]">
            {(["7D", "30D", "90D"] as Win[]).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setWin(w)}
                className={`rounded-sm px-2.5 py-1 transition-colors ${
                  win === w ? "bg-blue-500/20 text-blue-300" : "text-muted-foreground hover:text-foreground"
                } min-h-11 min-w-11 justify-center`}
              >
                {w}
              </button>
            ))}
            </div>
          </div>
        }>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={txSeries.points} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
            <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: "rgb(59 130 246)", strokeOpacity: 0.2 }} />
            <Line type="monotone" dataKey="primary" name={txSeries.primary_label} stroke="rgb(59 130 246)" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="secondary" name={txSeries.secondary_label} stroke="rgb(249 115 22)" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Escrow, Releases & Refunds"
        right={<span className="text-[11px] text-muted-foreground">Last 30 days</span>}
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
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
            <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
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