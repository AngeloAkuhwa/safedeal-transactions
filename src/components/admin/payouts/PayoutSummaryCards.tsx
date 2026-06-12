import { Clock, RotateCw, AlertTriangle, CheckCircle2, CalendarDays, Stopwatch } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/format";
import type { PayoutSummary } from "@/services/admin-payouts.service";

interface Props {
  summary: PayoutSummary | null;
  loading: boolean;
}

function Tile({
  icon: Icon, iconWrap, label, value, sub,
}: { icon: any; iconWrap: string; label: string; value: string; sub?: string | null }) {
  return (
    <Card className="p-4 sm:p-5 bg-card border-border">
      <div className="flex items-center justify-between mb-2">
        <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-lg flex items-center justify-center border ${iconWrap}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-lg sm:text-2xl font-bold text-foreground mt-0.5 truncate">{value}</p>
      {sub ? <p className="text-xs text-muted-foreground mt-1">{sub}</p> : null}
    </Card>
  );
}

export function PayoutSummaryCards({ summary, loading }: Props) {
  if (loading || !summary) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[120px] rounded-lg" />
        ))}
      </div>
    );
  }
  const s = summary.summary;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
      <Tile icon={Clock} iconWrap="bg-orange-500/10 border-orange-500/30 text-orange-400"
        label="Pending Release" value={`${s.pending_release.count}`}
        sub={formatMoney(s.pending_release.amount, "NGN")} />
      <Tile icon={RotateCw} iconWrap="bg-blue-500/10 border-blue-500/30 text-blue-400"
        label="Processing" value={`${s.processing.count}`}
        sub={formatMoney(s.processing.amount, "NGN")} />
      <Tile icon={AlertTriangle} iconWrap="bg-red-500/10 border-red-500/30 text-red-400"
        label="Failed" value={`${s.failed.count}`}
        sub={formatMoney(s.failed.amount, "NGN")} />
      <Tile icon={CheckCircle2} iconWrap="bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
        label="Released Today" value={formatMoney(s.released_today.amount, "NGN")} />
      <Tile icon={CalendarDays} iconWrap="bg-purple-500/10 border-purple-500/30 text-purple-400"
        label="Released This Week" value={formatMoney(s.released_week.amount, "NGN")} />
      <Tile icon={Stopwatch as any} iconWrap="bg-cyan-500/10 border-cyan-500/30 text-cyan-400"
        label="Avg Release Lead Time"
        value={s.avg_release_hours == null ? "—" : `${s.avg_release_hours.toFixed(1)}h`} />
    </div>
  );
}