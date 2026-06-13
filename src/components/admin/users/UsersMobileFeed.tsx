import { Flag, ShieldCheck, AlertTriangle, Star, ChevronRight, ChevronLeft, Banknote, Scale, Ban } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { UserDirectoryRow } from "@/services/admin-users-directory.service";
import { formatMoneyCompact } from "@/lib/format";

interface Props {
  rows: UserDirectoryRow[];
  total: number; page: number; pageSize: number;
  onOpen: (id: string) => void;
  onPage: (p: number) => void;
  onFlagToggle: (row: UserDirectoryRow) => void;
  onSuspend: (row: UserDirectoryRow) => void;
}

export function UsersMobileFeed({ rows, total, page, pageSize, onOpen, onPage, onFlagToggle, onSuspend }: Props) {
  const navigate = useNavigate();
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="lg:hidden space-y-3">
      {rows.length === 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-400">
          No users match these filters.
        </div>
      )}
      {rows.map((r) => {
        const init = (r.full_name || "?").slice(0, 1).toUpperCase();
        const ring = r.is_flagged || r.is_suspended ? "ring-red-500/30" : r.trust_badge === "trusted_seller" ? "ring-emerald-500/30" : "ring-slate-700";
        return (
          <div key={r.user_id} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <button onClick={() => onOpen(r.user_id)}>
                {r.avatar_url
                  ? <img src={r.avatar_url} className={`w-12 h-12 rounded-full ring-2 ${ring}`} alt={r.full_name} />
                  : <span className={`w-12 h-12 rounded-full ring-2 ${ring} bg-slate-700 text-white font-semibold inline-flex items-center justify-center`}>{init}</span>}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <button onClick={() => onOpen(r.user_id)} className="text-white font-semibold truncate">{r.full_name}</button>
                  {r.is_flagged && <Flag className="h-3 w-3 text-red-400" />}
                  {r.trust_badge === "trusted_seller" && <Star className="h-3 w-3 text-emerald-400" />}
                </div>
                <p className="text-slate-400 text-xs truncate">{r.email}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold capitalize ${r.status === "active" ? "bg-emerald-500/10 text-emerald-400" : r.status === "flagged" ? "bg-red-500/10 text-red-400" : r.status === "suspended" ? "bg-purple-500/10 text-purple-400" : "bg-yellow-500/10 text-yellow-400"}`}>{r.status.replace("_", " ")}</span>
                  <span className="text-slate-500 text-[10px]">• {r.transactions.count} tx</span>
                  {r.disputes.active > 0 && <span className="text-red-400 text-[10px]">• {r.disputes.active} disputes</span>}
                </div>
              </div>
              <button onClick={() => onOpen(r.user_id)} className="text-slate-400 p-1"><ChevronRight className="h-5 w-5" /></button>
            </div>
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-800">
              <span className="text-xs text-slate-400 flex items-center gap-1"><ShieldCheck className="h-3 w-3 text-emerald-400" /> {r.verification.level}</span>
              <span className="text-xs text-slate-400 ml-auto">{r.transactions.volume > 0 ? formatMoneyCompact(r.transactions.volume) : ""}</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5 mt-3">
              <button onClick={() => navigate(`/admin/transactions?user=${r.user_id}`)} className="py-2 bg-emerald-600 text-white rounded text-xs flex items-center justify-center gap-1"><Banknote className="h-3 w-3" /></button>
              <button onClick={() => navigate(`/admin/flagged-users?u=${r.user_id}`)} className="py-2 bg-red-600 text-white rounded text-xs flex items-center justify-center gap-1"><AlertTriangle className="h-3 w-3" /></button>
              <button onClick={() => onFlagToggle(r)} className={`py-2 rounded text-xs flex items-center justify-center gap-1 ${r.is_flagged ? "bg-slate-700 text-white" : "bg-yellow-600 text-white"}`}><Flag className="h-3 w-3" /></button>
              <button onClick={() => onSuspend(r)} disabled={r.is_suspended} className={`py-2 rounded text-xs flex items-center justify-center gap-1 ${r.is_suspended ? "bg-slate-700/50 text-slate-500" : "bg-purple-600 text-white"}`}><Ban className="h-3 w-3" /></button>
            </div>
          </div>
        );
      })}
      {rows.length > 0 && (
        <div className="flex items-center justify-between pt-3">
          <button disabled={page <= 1} onClick={() => onPage(page - 1)} className="px-3 py-2 bg-slate-800 text-slate-300 rounded-lg disabled:opacity-50"><ChevronLeft className="h-4 w-4" /></button>
          <span className="text-slate-400 text-sm">Page {page} of {pageCount}</span>
          <button disabled={page >= pageCount} onClick={() => onPage(page + 1)} className="px-3 py-2 bg-slate-800 text-slate-300 rounded-lg disabled:opacity-50"><ChevronRight className="h-4 w-4" /></button>
        </div>
      )}
    </div>
  );
}