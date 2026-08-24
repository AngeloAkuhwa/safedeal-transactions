import { LineChart, Timer, Users, Scale, ArrowUp, ArrowDown, Minus } from "lucide-react";
import type { PerformanceMetric } from "@/services/admin-dashboard.service";
import { ADMIN_TONE } from "@/components/admin/palette";

const ICON: Record<string, typeof LineChart> = {
  tx_success: LineChart,
  avg_processing: Timer,
  dau: Users,
  dispute_res: Scale,
};

interface Props { metrics: PerformanceMetric[] }

export function PerformanceMetrics({ metrics }: Props) {
  const isEmpty = !metrics || metrics.length === 0;
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Performance Metrics</h3>
        <span className={`text-xs ${ADMIN_TONE.info.text}`}>View Details</span>
      </div>
      {isEmpty ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-8 text-center">
          <div className="text-sm font-medium text-foreground">No performance metrics available</div>
          <div className="mt-1 text-xs text-muted-foreground">
            The backend returned an empty metrics array. If this persists, it may indicate a data pipeline issue.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {metrics.map((m) => {
            const Icon = ICON[m.key] ?? LineChart;
            const isGood =
              m.delta_direction === "flat"
                ? null
                : m.up_is_good
                  ? m.delta_direction === "up"
                  : m.delta_direction === "down";
            const tone =
              isGood === null ? "text-muted-foreground" : isGood ? "text-emerald-400" : "text-red-400";
            const Arrow =
              m.delta_direction === "flat" ? Minus : m.delta_direction === "up" ? ArrowUp : ArrowDown;
            return (
              <div key={m.key} className="flex items-center justify-between rounded-lg border border-border bg-card/60 p-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-500/15 text-blue-400">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-xs text-muted-foreground">{m.label}</div>
                    <div className="text-lg font-semibold text-foreground tabular-nums">{m.value}</div>
                  </div>
                </div>
                <div className={`flex items-center gap-1 text-xs font-medium ${tone}`}>
                  <Arrow className="h-3 w-3" />
                  {m.delta_label}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
