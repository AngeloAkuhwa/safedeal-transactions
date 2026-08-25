import { ChevronDown, Banknote, Zap, Bot, FolderOpen, Search, User } from "lucide-react";
import type { FlaggedUserRow } from "@/services/admin-flagged-users.service";
import { formatMoney } from "@/lib/format";
import { UserAvatar } from "./UserAvatar";
import { RISK_AVATAR_RING, RISK_BORDER, RISK_LABEL, RISK_PILL, relative } from "./risk";
import { ADMIN_TONE } from "@/components/admin/palette";

interface Props {
  row: FlaggedUserRow;
  onOpen: (userId: string) => void;
}

const REASON_PILL: Record<string, string> = {
  multiple_disputes: ADMIN_TONE.danger.chip,
  chargeback_pattern: ADMIN_TONE.danger.chip,
  identity_issues: ADMIN_TONE.elevated.chip,
  suspicious_activity: "bg-amber-500/10 border-amber-500/20 text-amber-300",
  fraud_detection: "bg-purple-500/10 border-purple-500/20 text-purple-300",
  stuck_frozen_escrow: "bg-purple-500/10 border-purple-500/20 text-purple-300",
  admin_flag: "bg-blue-500/10 border-blue-500/20 text-blue-300",
};

export function FlaggedUserCard({ row, onOpen }: Props) {
  const showDetails = row.risk === "critical" || row.reasons.length > 1;
  return (
    <div className={`bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden border-l-4 ${RISK_BORDER[row.risk]}`}>
      <div className="p-4 flex items-start gap-4">
        <UserAvatar name={row.name} avatarUrl={row.avatar_url} ringClass={RISK_AVATAR_RING[row.risk]} size="lg" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-white font-bold text-base leading-none truncate">{row.name}</h4>
            <span className="text-xs text-slate-500 font-medium whitespace-nowrap">{relative(row.flagged_at)}</span>
          </div>
          <p className="text-slate-400 text-xs mt-1 truncate">
            ID: {row.short_id}{row.email ? ` • ${row.email}` : ""}
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            {row.reasons.slice(0, 2).map((r) => (
              <span key={r.key} className={`px-2 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${REASON_PILL[r.key] ?? "bg-slate-800 border-slate-700 text-slate-300"}`}>
                {r.label}
              </span>
            ))}
            <span className={`px-2 py-1 rounded-full text-xs font-bold uppercase border ${RISK_PILL[row.risk]}`}>
              {RISK_LABEL[row.risk]} Risk
            </span>
          </div>
        </div>
      </div>

      {showDetails && (
        <details className="group border-t border-slate-800">
          <summary className="flex items-center justify-between px-4 py-3 bg-slate-800/30 cursor-pointer list-none min-h-11">
            <span className="text-xs font-semibold text-slate-300">Fraud Context &amp; Details</span>
            <ChevronDown className="h-3 w-3 text-slate-400 transition-transform group-open:rotate-180" />
          </summary>
          <div className="p-4 space-y-3 bg-slate-900/50">
            {row.related.tx_code && (
              <div className="flex items-start gap-3">
                <div className={`w-6 h-6 ${ADMIN_TONE.special.panel} border rounded flex items-center justify-center flex-shrink-0`}>
                  <Banknote className={`h-3 w-3 ${ADMIN_TONE.special.text}`} />
                </div>
                <p className="text-xs text-slate-300">
                  <span className="text-white font-medium">#{row.related.tx_code}:</span>{" "}
                  {row.related.tx_amount > 0 ? `${formatMoney(row.related.tx_amount, "NGN")} Escrow held` : "Escrow context"}
                </p>
              </div>
            )}
            {row.refunds_30d >= 2 && (
              <div className="flex items-start gap-3">
                <div className={`w-6 h-6 ${ADMIN_TONE.danger.panel} border rounded flex items-center justify-center flex-shrink-0`}>
                  <Zap className={`h-3 w-3 ${ADMIN_TONE.danger.text}`} />
                </div>
                <p className={`text-xs ${ADMIN_TONE.danger.text} font-medium italic`}>
                  Repeated chargeback pattern detected ({row.refunds_30d} in 30 days)
                </p>
              </div>
            )}
            {row.auto_detected && (
              <div className="mt-2 p-3 bg-blue-500/5 border border-blue-500/20 rounded-xl flex items-center gap-2">
                <Bot className={`h-3 w-3 ${ADMIN_TONE.info.text}`} />
                <span className="text-xs text-blue-300">Auto-detected by fraud algorithm</span>
              </div>
            )}
          </div>
        </details>
      )}

      <div className="p-4 grid grid-cols-2 gap-3">
        <button type="button" onClick={() => onOpen(row.user_id)} className="col-span-2 bg-blue-600 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-transform">
          <FolderOpen className="h-4 w-4" /> Review Case
        </button>
        <button type="button" onClick={() => onOpen(row.user_id)} className="bg-slate-800 text-slate-300 font-semibold py-3 rounded-xl text-sm flex items-center justify-center gap-2">
          <Search className="h-4 w-4" /> Investigate
        </button>
        <button type="button" onClick={() => onOpen(row.user_id)} className="bg-slate-800 text-slate-300 font-semibold py-3 rounded-xl text-sm flex items-center justify-center gap-2">
          <User className="h-4 w-4" /> Profile
        </button>
        <button type="button" onClick={() => onOpen(row.user_id)} className="bg-purple-600/20 text-purple-400 font-bold py-3 rounded-xl text-sm border border-purple-600/20">
          Suspend
        </button>
        <button type="button" onClick={() => onOpen(row.user_id)} className="bg-emerald-600/20 text-emerald-400 font-bold py-3 rounded-xl text-sm border border-emerald-600/20">
          Clear Flag
        </button>
      </div>
    </div>
  );
}