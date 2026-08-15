import { FaClock, FaArrowsRotate, FaTriangleExclamation, FaCheck, FaCalendarWeek, FaStopwatch } from "react-icons/fa6";
import type { IconType } from "react-icons";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatMoney } from "@/lib/format";
import type { PayoutSummary } from "@/services/admin-payouts.service";

interface Props {
  summary: PayoutSummary | null;
  loading: boolean;
}

type Tone = "orange" | "blue" | "red" | "emerald" | "purple" | "cyan";

const TONE: Record<Tone, { box: string; icon: string; chip: string }> = {
  orange:  { box: "bg-orange-500/10 border-orange-500/30",   icon: "text-orange-400",  chip: "text-orange-400 bg-orange-500/10" },
  blue:    { box: "bg-blue-500/10 border-blue-500/30",       icon: "text-blue-400",    chip: "text-blue-400 bg-blue-500/10" },
  red:     { box: "bg-red-500/10 border-red-500/30",         icon: "text-red-400",     chip: "text-red-400 bg-red-500/10" },
  emerald: { box: "bg-emerald-500/10 border-emerald-500/30", icon: "text-emerald-400", chip: "text-emerald-400 bg-emerald-500/10" },
  purple:  { box: "bg-purple-500/10 border-purple-500/30",   icon: "text-purple-400",  chip: "text-purple-400 bg-purple-500/10" },
  cyan:    { box: "bg-cyan-500/10 border-cyan-500/30",       icon: "text-cyan-400",    chip: "text-cyan-400 bg-cyan-500/10" },
};

function Tile({
  icon: Icon, tone, label, value, badge, hint,
}: { icon: IconType; tone: Tone; label: string; value: string; badge?: string | null; hint?: string }) {
  const t = TONE[tone];
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 lg:p-6">
      <div className="flex items-center justify-between mb-2">
        <div className={`w-9 h-9 lg:w-12 lg:h-12 rounded-lg flex items-center justify-center border ${t.box}`}>
          <Icon className={t.icon} size={16} />
        </div>
        {badge ? (
          <span className={`text-[12px] lg:text-xs font-semibold px-1.5 lg:px-2 py-0.5 lg:py-1 rounded ${t.chip}`}>{badge}</span>
        ) : null}
      </div>
      {hint ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <p className="text-slate-400 text-xs font-medium mb-0.5 lg:mb-1 cursor-help underline decoration-dotted decoration-slate-600 underline-offset-2 truncate">{label}</p>
          </TooltipTrigger>
          <TooltipContent>{hint}</TooltipContent>
        </Tooltip>
      ) : (
        <p className="text-slate-400 text-xs font-medium mb-0.5 lg:mb-1 truncate">{label}</p>
      )}
      <p className="text-white text-xl lg:text-2xl font-bold">{value}</p>
    </div>
  );
}

export function PayoutSummaryCards({ summary, loading }: Props) {
  if (loading || !summary) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 lg:gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[108px] lg:h-[148px] rounded-xl" />
        ))}
      </div>
    );
  }
  const s = summary.summary;
  const pendingDelta = s.pending_release.delta_24h;
  const processingDelta = s.processing.delta_24h;
  const failedDelta = s.failed.delta_24h;
  // Absent data is not "+0", and a negative delta is not "+-3": render the
  // sign the number actually has, and nothing at all when there is no number.
  const fmtDelta = (n?: number): string | null => {
    if (typeof n !== "number" || Number.isNaN(n)) return null;
    if (n === 0) return "0";
    return n > 0 ? `+${n}` : `−${Math.abs(n)}`;
  };
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 lg:gap-4">
      <Tile icon={FaClock} tone="orange"
        badge={fmtDelta(pendingDelta)}
        hint="Payouts with status = awaiting_release (held for admin to disburse)."
        label="Pending Payouts" value={`${s.pending_release.count}`} />
      <Tile icon={FaArrowsRotate} tone="blue"
        badge={fmtDelta(processingDelta)}
        label="Processing" value={`${s.processing.count}`} />
      <Tile icon={FaTriangleExclamation} tone="red"
        badge={fmtDelta(failedDelta)}
        label="Failed Payouts" value={`${s.failed.count}`} />
      <Tile icon={FaCheck} tone="emerald" badge="Today"
        label="Paid Today" value={formatMoney(s.released_today.amount, "NGN")} />
      <Tile icon={FaCalendarWeek} tone="purple" badge="Week"
        label="Paid This Week" value={formatMoney(s.released_week.amount, "NGN")} />
      <Tile icon={FaStopwatch} tone="cyan" badge="Avg"
        label="Avg Payout Time"
        value={s.avg_release_hours == null ? "—" : `${s.avg_release_hours.toFixed(1)}h`} />
    </div>
  );
}