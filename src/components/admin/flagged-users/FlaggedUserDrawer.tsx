import { X, Flag, Banknote, Scale, Bot, Clock } from "lucide-react";
import type { FlaggedUserRow } from "@/services/admin-flagged-users.service";
import { formatMoney } from "@/lib/format";
import { UserAvatar } from "./UserAvatar";
import { RISK_AVATAR_RING, RISK_LABEL, RISK_PILL, RISK_DOT, absoluteDate, relative } from "./risk";

interface Props {
  row: FlaggedUserRow | null;
  open: boolean;
  onClose: () => void;
}

export function FlaggedUserDrawer({ row, open, onClose }: Props) {
  if (!open || !row) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <aside className="relative h-full w-full max-w-md bg-slate-950 border-l border-slate-800 overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/95 backdrop-blur">
          <div className="flex items-center gap-2">
            <Flag className="h-4 w-4 text-red-400" />
            <h3 className="text-white font-semibold text-base">Flagged user</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="h-9 w-9 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="flex items-center gap-4">
            <UserAvatar name={row.name} avatarUrl={row.avatar_url} ringClass={RISK_AVATAR_RING[row.risk]} size="lg" />
            <div className="min-w-0">
              <p className="text-white font-bold truncate">{row.name}</p>
              <p className="text-slate-400 text-xs truncate">{row.email ?? "—"}</p>
              <p className="text-slate-500 text-xs">ID: {row.short_id}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold border ${RISK_PILL[row.risk]}`}>
              <span className={`h-2 w-2 rounded-full ${RISK_DOT[row.risk]}`} />
              {RISK_LABEL[row.risk]} Risk
            </span>
            <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-800 border border-slate-700 text-slate-300 capitalize">
              {row.status.replace("_", " ")}
            </span>
          </div>

          <section>
            <h4 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">Flag reasons</h4>
            <div className="flex flex-wrap gap-2">
              {row.reasons.length === 0 && <span className="text-slate-500 text-xs">—</span>}
              {row.reasons.map((r) => (
                <span key={r.key} className="px-2.5 py-1 rounded-full text-[11px] font-semibold border bg-slate-800/60 border-slate-700 text-slate-200">
                  {r.label}
                </span>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <h4 className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Context</h4>
            {row.related.tx_code ? (
              <div className="flex items-start gap-3 p-3 bg-slate-900 border border-slate-800 rounded-xl">
                <Banknote className="h-4 w-4 text-purple-400 mt-0.5" />
                <div>
                  <p className="text-white text-sm font-medium">#{row.related.tx_code}</p>
                  <p className="text-slate-400 text-xs">
                    {row.related.tx_amount > 0 ? `${formatMoney(row.related.tx_amount, "NGN")} • escrow context` : "Escrow context"}
                  </p>
                </div>
              </div>
            ) : <p className="text-slate-500 text-xs">No related transaction.</p>}
            {row.disputes_30d > 0 && (
              <div className="flex items-start gap-3 p-3 bg-slate-900 border border-slate-800 rounded-xl">
                <Scale className="h-4 w-4 text-orange-400 mt-0.5" />
                <div>
                  <p className="text-orange-300 text-sm font-medium">{row.disputes_30d} dispute{row.disputes_30d === 1 ? "" : "s"} in 30 days</p>
                  <p className="text-slate-400 text-xs">{row.refunds_30d > 0 ? `${row.refunds_30d} chargeback(s)` : "No chargebacks"}</p>
                </div>
              </div>
            )}
            {row.escrow_at_risk > 0 && (
              <div className="flex items-start gap-3 p-3 bg-slate-900 border border-slate-800 rounded-xl">
                <Clock className="h-4 w-4 text-red-300 mt-0.5" />
                <div>
                  <p className="text-white text-sm font-medium">{formatMoney(row.escrow_at_risk, "NGN")}</p>
                  <p className="text-slate-400 text-xs">Total escrow exposure across flagged transactions</p>
                </div>
              </div>
            )}
          </section>

          <section>
            <h4 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">Flagged by</h4>
            <div className="flex items-center gap-3">
              {row.flagged_by.is_system ? (
                <>
                  <div className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center">
                    <Bot className="h-4 w-4 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-white text-sm font-medium">Auto-Detection</p>
                    <p className="text-slate-400 text-xs">Fraud Algorithm • {relative(row.flagged_at)}</p>
                  </div>
                </>
              ) : (
                <>
                  <UserAvatar name={row.flagged_by.name} avatarUrl={row.flagged_by.avatar_url} size="sm" />
                  <div>
                    <p className="text-white text-sm font-medium">{row.flagged_by.name}</p>
                    <p className="text-slate-400 text-xs">Admin • {absoluteDate(row.flagged_at)}</p>
                  </div>
                </>
              )}
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}