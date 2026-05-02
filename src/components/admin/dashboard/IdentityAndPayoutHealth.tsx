import { ResponsiveContainer, Area, AreaChart } from "recharts";
import { formatMoney } from "@/lib/format";
import type { IdentityHealth, PayoutHealth } from "@/services/admin-dashboard.service";

function Spark({ data, color }: { data: number[]; color: string }) {
  const points = data.map((v, i) => ({ i, v }));
  return (
    <div className="h-12 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`sp-${color}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.4} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#sp-${color})`} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

interface Props {
  identity: IdentityHealth;
  payout: PayoutHealth;
}

export function IdentityAndPayoutHealth({ identity, payout }: Props) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <h3 className="mb-3 text-sm font-semibold text-white">Identity Review Health</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
            <div className="text-xs text-slate-400">Pending Reviews</div>
            <div className="mt-1 text-xl font-semibold text-white tabular-nums">
              {identity.pending_reviews}
            </div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
            <div className="text-xs text-slate-400">Avg Review Time</div>
            <div className="mt-1 text-xl font-semibold text-white tabular-nums">
              {identity.avg_review_hours.toFixed(1)}h
            </div>
          </div>
        </div>
        <div className="mt-3"><Spark data={identity.spark} color="rgb(168 85 247)" /></div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <h3 className="mb-3 text-sm font-semibold text-white">Payout Health</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
            <div className="text-xs text-slate-400">Pending Payouts</div>
            <div className="mt-1 truncate text-xl font-semibold text-white tabular-nums">
              {formatMoney(payout.pending_payouts_amount, "NGN")}
            </div>
            <div className="mt-1 text-[10px] text-slate-500">Awaiting release + processing</div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
            <div className="text-xs text-slate-400">Avg Payout Time</div>
            <div className="mt-1 text-xl font-semibold text-white tabular-nums">
              {payout.avg_payout_hours.toFixed(1)}h
            </div>
          </div>
        </div>
        <div className="mt-3"><Spark data={payout.spark} color="rgb(59 130 246)" /></div>
      </div>
    </div>
  );
}