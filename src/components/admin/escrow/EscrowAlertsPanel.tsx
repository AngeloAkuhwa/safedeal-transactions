import { TriangleAlert, Clock, AlertCircle, TrendingUp, MessageSquareWarning, Lock, Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatMoney } from "@/lib/format";
import type { EscrowAlerts } from "@/services/admin-escrow.service";

function AlertGroup({
  icon, title, subtitle, count, accent, items, onOpen,
}: {
  icon: React.ReactNode; title: string; subtitle: string; count: number;
  accent: { bg: string; border: string; text: string };
  items: { id: string; code: string; right: string; amount?: number }[];
  onOpen: (id: string) => void;
}) {
  return (
    <div className={`bg-slate-800/50 border ${accent.border} rounded-lg p-4`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 ${accent.bg} border ${accent.border} rounded-lg flex items-center justify-center`}>
            <span className={accent.text}>{icon}</span>
          </div>
          <div>
            <h4 className="text-white font-semibold text-sm">{title}</h4>
            <p className="text-slate-400 text-xs">{subtitle}</p>
          </div>
        </div>
        <span className={`px-2 py-1 ${accent.bg} ${accent.text} rounded text-xs font-bold`}>{count}</span>
      </div>
      <div className="space-y-2">
        {items.length === 0 ? (
          <p className="text-slate-500 text-xs italic px-2 py-2">No active alerts.</p>
        ) : items.slice(0, 4).map((it) => (
          <button
            key={it.id}
            type="button"
            onClick={() => onOpen(it.id)}
            className={`w-full flex items-center justify-between p-2.5 bg-slate-900/50 rounded border border-slate-700 hover:${accent.border.replace("/30", "/50")} transition-all text-left`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Lock className={`h-3 w-3 ${accent.text} shrink-0`} />
              <span className="text-white text-sm font-medium truncate">{it.code}</span>
              {it.amount !== undefined && (
                <span className="text-slate-400 text-xs">{formatMoney(it.amount, "NGN")}</span>
              )}
            </div>
            <span className={`${accent.text} text-xs font-semibold shrink-0 ml-2`}>{it.right}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function EscrowAlertsPanel({ alerts }: { alerts: EscrowAlerts }) {
  const nav = useNavigate();
  const open = (id: string) => nav(`/admin/transactions/${id}`);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl">
      <div className="p-4 lg:p-6 border-b border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-white text-base lg:text-lg font-semibold flex items-center gap-2">
              <TriangleAlert className="h-5 w-5 text-orange-400" />
              Escrow Alerts &amp; Anomalies
            </h3>
            <p className="text-slate-400 text-xs lg:text-sm mt-1">Active operational alerts requiring attention • Updated real-time</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1.5 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-xs font-semibold">
              {alerts.counts.critical} Critical
            </span>
            <span className="px-3 py-1.5 bg-orange-500/10 border border-orange-500/20 text-orange-400 rounded-lg text-xs font-semibold">
              {alerts.counts.warning} Warnings
            </span>
          </div>
        </div>
      </div>
      <div className="p-4 lg:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4">
          <AlertGroup
            icon={<Clock className="h-5 w-5" />}
            title="Frozen Too Long"
            subtitle="Escrow frozen beyond expected timeframe"
            count={alerts.frozen_too_long.length}
            accent={{ bg: "bg-red-500/20", border: "border-red-500/30", text: "text-red-400" }}
            items={alerts.frozen_too_long.map((r) => ({ id: r.tx_id, code: `#${r.code}`, amount: r.amount, right: `Frozen ${r.days_frozen}d` }))}
            onOpen={open}
          />
          <AlertGroup
            icon={<AlertCircle className="h-5 w-5" />}
            title="Mismatch with Provider"
            subtitle="Ledger drift vs Paystack settlement"
            count={alerts.provider_mismatch.length}
            accent={{ bg: "bg-orange-500/20", border: "border-orange-500/30", text: "text-orange-400" }}
            items={alerts.provider_mismatch.map((r) => ({ id: r.tx_id, code: `#${r.code}`, right: `Δ ${formatMoney(r.delta, "NGN")}` }))}
            onOpen={open}
          />
          <AlertGroup
            icon={<TrendingUp className="h-5 w-5" />}
            title="High Value Held"
            subtitle="Escrow above ₦1M still in hold"
            count={alerts.high_value_held.length}
            accent={{ bg: "bg-purple-500/20", border: "border-purple-500/30", text: "text-purple-400" }}
            items={alerts.high_value_held.map((r) => ({ id: r.tx_id, code: `#${r.code}`, amount: r.amount, right: `Held ${r.held_for}d` }))}
            onOpen={open}
          />
          <AlertGroup
            icon={<MessageSquareWarning className="h-5 w-5" />}
            title="Dispute Stalled"
            subtitle="Disputes open over 7 days"
            count={alerts.dispute_stalled.length}
            accent={{ bg: "bg-cyan-500/20", border: "border-cyan-500/30", text: "text-cyan-400" }}
            items={alerts.dispute_stalled.map((r) => ({ id: r.tx_id, code: `#${r.code}`, right: `Stalled ${r.stalled_for}d` }))}
            onOpen={open}
          />
        </div>
        <div className="flex items-center justify-end mt-4">
          <button
            type="button"
            disabled
            title="Coming soon"
            className="px-4 py-2 bg-slate-700/60 text-slate-400 rounded-lg text-sm font-medium inline-flex items-center cursor-not-allowed"
          >
            <Settings className="h-4 w-4 mr-2" />
            Configure Alerts
          </button>
        </div>
      </div>
    </div>
  );
}