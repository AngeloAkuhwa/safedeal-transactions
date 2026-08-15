import { Lock, Hourglass, RotateCcw, CheckCircle2, CalendarRange, Vault } from "lucide-react";
import type { EscrowKpis } from "@/services/admin-escrow.service";
import { formatMoney } from "@/lib/format";
import { formatMoneyCompactOrDash } from "@/lib/payment/money-format";

function fmtDelta(d: number): string {
  const v = Math.max(-999, Math.min(999, d));
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
}

function Card({ icon, iconBg, iconBorder, iconColor, label, value, currency, sub, delta, deltaColor }: {
  icon: React.ReactNode; iconBg: string; iconBorder: string; iconColor: string;
  label: string; value: number; currency: string | null; sub: string; delta: number; deltaColor: string;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 lg:p-6">
      <div className="flex items-center justify-between mb-3 lg:mb-4">
        <div className={`w-10 h-10 lg:w-12 lg:h-12 ${iconBg} border ${iconBorder} rounded-lg flex items-center justify-center`}>
          <span className={iconColor}>{icon}</span>
        </div>
        <span className={`text-xs font-semibold ${deltaColor}`}>{fmtDelta(delta)}</span>
      </div>
      <h3 className="text-slate-400 text-xs lg:text-sm font-medium mb-1">{label}</h3>
      <p
        className="text-white text-lg lg:text-2xl font-bold truncate"
        title={currency ? formatMoney(value, currency) : undefined}
      >
        {formatMoneyCompactOrDash(value, currency)}
      </p>
      <p className="text-slate-500 text-[12px] lg:text-xs mt-1 truncate">{sub}</p>
    </div>
  );
}

export function EscrowKpiCards({ kpis }: { kpis: EscrowKpis }) {
  const currency = kpis.currency_code;
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 lg:gap-4">
      <Card
        icon={<Vault className="h-5 w-5" />} iconBg="bg-blue-500/10" iconBorder="border-blue-500/30" iconColor="text-blue-400"
        label="Total Held in Escrow" value={kpis.total_held} currency={currency} sub={`Across ${kpis.total_held_count.toLocaleString("en-NG")} transactions`} delta={kpis.total_held_delta_pct} deltaColor="text-emerald-400"
      />
      <Card
        icon={<Lock className="h-5 w-5" />} iconBg="bg-red-500/10" iconBorder="border-red-500/30" iconColor="text-red-400"
        label="Total Frozen" value={kpis.total_frozen} currency={currency} sub={`${kpis.total_frozen_count.toLocaleString("en-NG")} frozen transactions`} delta={kpis.total_frozen_delta_pct} deltaColor="text-red-400"
      />
      <Card
        icon={<Hourglass className="h-5 w-5" />} iconBg="bg-orange-500/10" iconBorder="border-orange-500/30" iconColor="text-orange-400"
        label="Pending Release" value={kpis.pending_release} currency={currency} sub={`${kpis.pending_release_count.toLocaleString("en-NG")} pending releases`} delta={kpis.pending_release_delta_pct} deltaColor="text-orange-400"
      />
      <Card
        icon={<RotateCcw className="h-5 w-5" />} iconBg="bg-purple-500/10" iconBorder="border-purple-500/30" iconColor="text-purple-400"
        label="Total Refunded" value={kpis.total_refunded} currency={currency} sub={`${kpis.total_refunded_count.toLocaleString("en-NG")} refunded today`} delta={kpis.total_refunded_delta_pct} deltaColor="text-purple-400"
      />
      <Card
        icon={<CheckCircle2 className="h-5 w-5" />} iconBg="bg-emerald-500/10" iconBorder="border-emerald-500/30" iconColor="text-emerald-400"
        label="Released Today" value={kpis.released_today} currency={currency} sub={`${kpis.released_today_count.toLocaleString("en-NG")} transactions`} delta={kpis.released_today_delta_pct} deltaColor="text-emerald-400"
      />
      <Card
        icon={<CalendarRange className="h-5 w-5" />} iconBg="bg-cyan-500/10" iconBorder="border-cyan-500/30" iconColor="text-cyan-400"
        label="Released This Week" value={kpis.released_week} currency={currency} sub="7 days total" delta={kpis.released_week_delta_pct} deltaColor="text-cyan-400"
      />
    </div>
  );
}