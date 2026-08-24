import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Loader2, Flag, Ban, CheckCircle2, ShieldCheck, Banknote, Scale, ExternalLink, Clock, Mail, Phone, IdCard } from "lucide-react";
import { useNavigate } from "react-router";
import { fetchUserDirectoryDetail } from "@/services/admin-users-directory.service";
import { formatMoneyCompact } from "@/lib/format";
import { formatMoneyOrDash } from "@/lib/payment/money-format";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ADMIN_TONE } from "@/components/admin/palette";

interface Props {
  userId: string | null;
  open: boolean;
  onClose: () => void;
  onFlag: (id: string, name: string) => void;
  onSuspend: (id: string, name: string) => void;
  onClearFlag: (id: string, name: string) => void;
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-NG", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function UserDetailDrawer({ userId, open, onClose, onFlag, onSuspend, onClearFlag }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-user-detail", userId],
    queryFn: () => fetchUserDirectoryDetail(userId!),
    enabled: !!userId && open,
    staleTime: 15_000,
  });

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-xl bg-slate-950 border-l border-slate-800 text-slate-200 p-0 overflow-y-auto">
        <div className="sticky top-0 bg-slate-900 border-b border-slate-800 px-5 py-4 flex items-center justify-between z-sticky">
          <h3 className="text-white font-semibold flex items-center gap-2"><ShieldCheck className={`h-4 w-4 ${ADMIN_TONE.success.text}`} /> User Detail</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-800 rounded min-h-11 min-w-11 inline-flex items-center justify-center"><X className="h-4 w-4" /></button>
        </div>

        {isLoading && (
          <div className="p-10 text-center text-slate-400"><Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" /> Loading user…</div>
        )}
        {error && (
          <div className={`p-6 ${ADMIN_TONE.danger.text} text-sm`}>{(error as Error).message}</div>
        )}

        {data && (
          <div className="p-5 space-y-5">
            <div className="flex items-start gap-4">
              {data.user.avatar_url
                ? <img src={data.user.avatar_url} className="w-16 h-16 rounded-full ring-2 ring-slate-700" alt={data.user.full_name} />
                : <span className="w-16 h-16 rounded-full bg-slate-800 ring-2 ring-slate-700 inline-flex items-center justify-center text-white text-xl font-bold">{(data.user.full_name || "?").slice(0,1).toUpperCase()}</span>}
              <div className="min-w-0">
                <h4 className="text-white text-lg font-semibold">{data.user.full_name}</h4>
                <p className="text-slate-400 text-sm truncate">{data.user.handle}</p>
                <p className="text-slate-500 text-xs mt-0.5">{data.user.display_id}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                <p className="text-slate-500 text-xs mb-1 flex items-center gap-1"><Mail className="h-3 w-3" /> Email</p>
                <p className="text-slate-200 text-sm truncate">{data.user.email || "—"}</p>
                {data.user.verification.email && <span className={`${ADMIN_TONE.success.text} text-xs`}>verified</span>}
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                <p className="text-slate-500 text-xs mb-1 flex items-center gap-1"><Phone className="h-3 w-3" /> Phone</p>
                <p className="text-slate-200 text-sm">{data.user.phone ?? "—"}</p>
                {data.user.verification.phone && <span className={`${ADMIN_TONE.success.text} text-xs`}>verified</span>}
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                <p className="text-slate-500 text-xs mb-1 flex items-center gap-1"><IdCard className="h-3 w-3" /> Identity</p>
                <p className="text-slate-200 text-sm capitalize">{data.user.verification.id_status ?? "none"}</p>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                <p className="text-slate-500 text-xs mb-1 flex items-center gap-1"><Clock className="h-3 w-3" /> Joined</p>
                <p className="text-slate-200 text-sm">{fmt(data.user.joined_at)}</p>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
              <p className="text-slate-400 text-xs uppercase tracking-wide mb-2">Activity</p>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-white text-xl font-bold">{data.user.transactions.count}</p>
                  <p className="text-slate-500 text-xs">Transactions</p>
                </div>
                <div>
                  <p className={`${ADMIN_TONE.success.text} text-base font-semibold`}>{data.user.transactions.volume > 0 ? formatMoneyCompact(data.user.transactions.volume, data.user.transactions.currency) : "—"}</p>
                  <p className="text-slate-500 text-xs">Volume</p>
                </div>
                <div>
                  <p className={`text-xl font-bold ${data.user.disputes.active > 0 ? "text-red-400" : "text-white"}`}>{data.user.disputes.active}/{data.user.disputes.total}</p>
                  <p className="text-slate-500 text-xs">Active/Total disputes</p>
                </div>
              </div>
            </div>

            <div>
              <p className="text-slate-400 text-xs uppercase tracking-wide mb-2">Recent transactions</p>
              <div className="space-y-2">
                {data.recent_transactions.length === 0 && <p className="text-slate-500 text-sm">No recent transactions.</p>}
                {data.recent_transactions.map((t) => (
                  <button key={t.transaction_id} onClick={() => navigate(`/admin/transactions/${t.transaction_id}`)} className="w-full text-left bg-slate-900 border border-slate-800 rounded-lg p-3 hover:border-emerald-500/30 transition">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-white text-sm font-medium">{t.transaction_code}</p>
                        <p className="text-slate-500 text-xs capitalize">{t.counterparty === "as_buyer" ? "as buyer" : "as seller"} · {t.status}</p>
                      </div>
                      <div className="text-right">
                        <p className={`${ADMIN_TONE.success.text} text-sm font-semibold`}>{formatMoneyOrDash(t.amount, t.currency_code)}</p>
                        <ExternalLink className="h-3 w-3 text-slate-500 inline-block" />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-slate-400 text-xs uppercase tracking-wide mb-2">Admin actions timeline</p>
              <div className="space-y-2">
                {data.timeline.length === 0 && <p className="text-slate-500 text-sm">No admin actions recorded.</p>}
                {data.timeline.map((a) => (
                  <div key={a.id} className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-white text-sm font-medium capitalize">{a.type.replace(/_/g, " ")}</p>
                      <p className="text-slate-500 text-xs">{fmt(a.created_at)}</p>
                    </div>
                    <p className="text-slate-400 text-xs mt-1">by {a.admin_name}</p>
                    {a.note && <p className="text-slate-300 text-sm mt-1.5">{a.note}</p>}
                  </div>
                ))}
              </div>
            </div>

            <div className="sticky bottom-0 bg-slate-950 pt-3 -mx-5 px-5 border-t border-slate-800">
              <button
                onClick={() => { onClose(); navigate(`/admin/users/${data.user.user_id}`); }}
                className="w-full mb-2 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs flex items-center justify-center gap-1 font-medium min-h-11"
              >
                <ExternalLink className="h-3 w-3" /> Open Full Investigation Hub
              </button>
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => navigate(`/admin/flagged-users?u=${data.user.user_id}`)} className="py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs flex items-center justify-center gap-1 min-h-11">
                  <ExternalLink className="h-3 w-3" /> Fraud workspace
                </button>
                {data.user.is_flagged
                  ? <button onClick={() => onClearFlag(data.user.user_id, data.user.full_name)} className="py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs flex items-center justify-center gap-1 min-h-11"><CheckCircle2 className="h-3 w-3" /> Clear flag</button>
                  : <button onClick={() => onFlag(data.user.user_id, data.user.full_name)} className="py-2 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs flex items-center justify-center gap-1 min-h-11"><Flag className="h-3 w-3" /> Flag</button>}
                <button onClick={() => onSuspend(data.user.user_id, data.user.full_name)} disabled={data.user.is_suspended} className={`py-2 rounded text-xs flex items-center justify-center gap-1 ${data.user.is_suspended ? "bg-slate-700/50 text-slate-500" : "bg-purple-600 hover:bg-purple-700 text-white"} min-h-11`}>
                  <Ban className="h-3 w-3" /> {data.user.is_suspended ? "Suspended" : "Suspend"}
                </button>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}