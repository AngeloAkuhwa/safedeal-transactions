import {
  Flag,
  AlertTriangle,
  Banknote,
  Scale,
  Zap,
  Bot,
  Clock,
  FolderOpen,
  User,
  Search,
  ArrowUpRight,
  Ban,
  CheckCircle2,
  StickyNote,
} from "lucide-react";
import type { FlaggedUserRow } from "@/services/admin-flagged-users.service";
import { formatMoney } from "@/lib/format";
import { UserAvatar } from "./UserAvatar";
import { RISK_AVATAR_RING, RISK_BORDER, RISK_LABEL, RISK_PILL, RISK_DOT, relative, absoluteDate } from "./risk";
import { ADMIN_TONE, ADMIN_GROUND } from "@/components/admin/palette";

interface Props {
  rows: FlaggedUserRow[];
  total: number;
  page: number;
  pageSize: number;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleAll: () => void;
  onOpenDetail: (userId: string) => void;
  onPage: (n: number) => void;
  onSortToggle: () => void;
  sort: "risk" | "recent";
}

const REASON_CHIP: Record<string, string> = {
  multiple_disputes: "bg-red-500/10 border-red-500/20 text-red-400",
  chargeback_pattern: "bg-red-500/10 border-red-500/20 text-red-400",
  identity_issues: "bg-orange-500/10 border-orange-500/20 text-orange-400",
  suspicious_activity: "bg-amber-500/10 border-amber-500/20 text-amber-300",
  fraud_detection: "bg-purple-500/10 border-purple-500/20 text-purple-300",
  stuck_frozen_escrow: "bg-purple-500/10 border-purple-500/20 text-purple-300",
  admin_flag: "bg-blue-500/10 border-blue-500/20 text-blue-300",
};

export function FlaggedUsersTable(props: Props) {
  const {
    rows, total, page, pageSize, selected,
    onToggleSelect, onToggleAll, onOpenDetail, onPage, onSortToggle, sort,
  } = props;

  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.user_id));
  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className={`hidden lg:block ${ADMIN_GROUND.panel} border rounded-xl`}>
      <div className={`p-6 border-b ${ADMIN_GROUND.border} flex flex-col md:flex-row items-start md:items-center justify-between gap-4`}>
        <div>
          <h3 className={`${ADMIN_GROUND.heading} text-lg font-semibold`}>Flagged Users List</h3>
          <p className={`${ADMIN_GROUND.muted} text-sm mt-1`}>
            {total.toLocaleString()} flagged users • Showing {start}-{end}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onSortToggle}
            className={`min-h-11 px-4 py-2 ${ADMIN_GROUND.raised} ${ADMIN_GROUND.body} rounded-lg ${ADMIN_GROUND.raisedHover} transition-all text-sm font-medium`}
          >
            Sort by {sort === "risk" ? "Risk" : "Recent"}
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full sd-stack">
          <thead className="bg-slate-800 border-b border-slate-700">
            <tr>
              <th className={`text-left p-4 ${ADMIN_GROUND.body} font-semibold text-sm whitespace-nowrap`}>
                <input type="checkbox" checked={allChecked} onChange={onToggleAll} className="h-11 w-11 accent-red-600" />
              </th>
              <th className={`text-left p-4 ${ADMIN_GROUND.body} font-semibold text-sm whitespace-nowrap`}>User</th>
              <th className={`text-left p-4 ${ADMIN_GROUND.body} font-semibold text-sm whitespace-nowrap`}>Flag Reason</th>
              <th className={`text-left p-4 ${ADMIN_GROUND.body} font-semibold text-sm whitespace-nowrap`}>Risk Level</th>
              <th className={`text-left p-4 ${ADMIN_GROUND.body} font-semibold text-sm whitespace-nowrap`}>Related Context</th>
              <th className={`text-left p-4 ${ADMIN_GROUND.body} font-semibold text-sm whitespace-nowrap`}>Flagged By</th>
              <th className={`text-left p-4 ${ADMIN_GROUND.body} font-semibold text-sm whitespace-nowrap`}>Date</th>
              <th className={`text-center p-4 ${ADMIN_GROUND.body} font-semibold text-sm whitespace-nowrap`}>Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {rows.length === 0 && (
              <tr><td colSpan={8} className={`p-12 text-center ${ADMIN_GROUND.faint} text-sm`}>No flagged users match the current filters.</td></tr>
            )}
            {rows.map((r) => {
              const primaryReason = r.reasons[0];
              return (
                <tr key={r.user_id} className={`hover:bg-slate-800/50 transition-all border-l-4 ${RISK_BORDER[r.risk]}`}>
                  <td className="p-4">
                    <input type="checkbox" checked={selected.has(r.user_id)} onChange={() => onToggleSelect(r.user_id)} className="h-11 w-11 accent-red-600" />
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <UserAvatar name={r.name} avatarUrl={r.avatar_url} ringClass={RISK_AVATAR_RING[r.risk]} />
                      <div className="min-w-0">
                        <p className={`${ADMIN_GROUND.heading} font-medium truncate max-w-[180px]`}>{r.name}</p>
                        <p className={`${ADMIN_GROUND.muted} text-xs truncate max-w-[180px]`}>{r.email ?? "—"}</p>
                        <p className={`${ADMIN_GROUND.faint} text-xs`}>ID: {r.short_id}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        {r.risk === "critical" && <AlertTriangle className={`h-3 w-3 ${ADMIN_TONE.danger.text}`} />}
                        <Flag className={`h-3 w-3 ${ADMIN_TONE.danger.text}`} />
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="space-y-1">
                      {primaryReason ? (
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${REASON_CHIP[primaryReason.key] ?? "bg-slate-800 border-slate-700 text-slate-300"}`}>
                          <AlertTriangle className="h-3 w-3" /> {primaryReason.label}
                        </span>
                      ) : <span className={`${ADMIN_GROUND.faint} text-xs`}>—</span>}
                      <p className={`${ADMIN_GROUND.muted} text-xs`}>
                        {r.disputes_30d > 0
                          ? `${r.disputes_30d} dispute${r.disputes_30d === 1 ? "" : "s"} in 30 days`
                          : r.reasons.length > 1 ? `${r.reasons.length} fraud signals` : "1 fraud signal"}
                      </p>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold border ${RISK_PILL[r.risk]}`}>
                      <span className={`h-2 w-2 rounded-full ${RISK_DOT[r.risk]} ${r.risk === "critical" ? "sd-live-dot" : ""}`} />
                      {RISK_LABEL[r.risk]}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="space-y-2 min-w-[260px]">
                      {r.related.tx_code && (
                        <div className="flex items-start gap-2">
                          <div className={`w-5 h-5 ${ADMIN_TONE.special.panel} border rounded flex items-center justify-center flex-shrink-0 mt-0.5`}>
                            <Banknote className={`h-3 w-3 ${ADMIN_TONE.special.text}`} />
                          </div>
                          <div>
                            <p className={`${ADMIN_GROUND.heading} text-sm font-medium`}>#{r.related.tx_code}</p>
                            <p className={`${ADMIN_GROUND.muted} text-xs`}>
                              {r.related.tx_amount > 0 ? `Amount: ${formatMoney(r.related.tx_amount, "NGN")} • Escrow held` : "Escrow context"}
                            </p>
                          </div>
                        </div>
                      )}
                      {r.disputes_30d > 0 && (
                        <div className="flex items-start gap-2">
                          <div className={`w-5 h-5 ${ADMIN_TONE.elevated.panel} border rounded flex items-center justify-center flex-shrink-0 mt-0.5`}>
                            <Scale className={`h-3 w-3 ${ADMIN_TONE.elevated.text}`} />
                          </div>
                          <div>
                            <p className="text-orange-300 text-sm font-medium">{r.disputes_30d} active dispute{r.disputes_30d === 1 ? "" : "s"}</p>
                            <p className={`${ADMIN_GROUND.muted} text-xs`}>Last 30 days</p>
                          </div>
                        </div>
                      )}
                      {r.refunds_30d >= 2 && (
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-red-500/10 border border-red-500/20 rounded">
                          <Zap className={`h-3 w-3 ${ADMIN_TONE.danger.text}`} />
                          <p className={`${ADMIN_TONE.danger.text} text-xs font-semibold`}>Pattern: Repeated chargebacks ({r.refunds_30d} in 30 days)</p>
                        </div>
                      )}
                      {r.auto_detected && (
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-500/10 border border-blue-500/20 rounded">
                          <Bot className={`h-3 w-3 ${ADMIN_TONE.info.text}`} />
                          <p className={`${ADMIN_TONE.info.text} text-xs`}>Auto-detected by fraud algorithm</p>
                        </div>
                      )}
                      {r.risk === "critical" && (
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-red-500/20 border border-red-500/30 rounded">
                          <Clock className="h-3 w-3 text-red-300" />
                          <p className="text-red-300 text-xs font-semibold">URGENT: Review within 6 hours</p>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      {r.flagged_by.is_system ? (
                        <>
                          <div className="w-6 h-6 bg-blue-500/20 border border-blue-500/40 rounded-full flex items-center justify-center">
                            <Bot className={`h-3 w-3 ${ADMIN_TONE.info.text}`} />
                          </div>
                          <div>
                            <p className={`${ADMIN_GROUND.heading} text-sm font-medium`}>Auto-Detection</p>
                            <p className={`${ADMIN_GROUND.muted} text-xs`}>Fraud Algorithm</p>
                          </div>
                        </>
                      ) : (
                        <>
                          <UserAvatar name={r.flagged_by.name} avatarUrl={r.flagged_by.avatar_url} size="sm" />
                          <div>
                            <p className={`${ADMIN_GROUND.heading} text-sm font-medium`}>{r.flagged_by.name}</p>
                            <p className={`${ADMIN_GROUND.muted} text-xs`}>Admin</p>
                          </div>
                        </>
                      )}
                    </div>
                  </td>
                  <td className="p-4">
                    <p className={`${ADMIN_GROUND.body} text-sm`}>{relative(r.flagged_at)}</p>
                    <p className={`${ADMIN_GROUND.faint} text-xs`}>{absoluteDate(r.flagged_at)}</p>
                  </td>
                  <td className="p-4">
                    <div className="flex flex-col gap-2 min-w-[180px]">
                      <button type="button" onClick={() => onOpenDetail(r.user_id)} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center justify-center gap-2 transition-all text-white text-xs font-medium min-h-11">
                        <FolderOpen className="h-3 w-3" /> Review User
                      </button>
                      <button type="button" onClick={() => onOpenDetail(r.user_id)} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg flex items-center justify-center gap-2 transition-all text-slate-300 text-xs font-medium min-h-11">
                        <User className="h-3 w-3" /> View Profile
                      </button>
                      <div className="flex gap-1">
                        <button type="button" onClick={() => onOpenDetail(r.user_id)} className="flex-1 px-2 py-1.5 bg-orange-600 hover:bg-orange-700 rounded-lg flex items-center justify-center gap-1.5 transition-all text-white text-xs font-medium min-h-11">
                          <Search className="h-3 w-3" /> Investigate
                        </button>
                        <button type="button" onClick={() => onOpenDetail(r.user_id)} className="flex-1 px-2 py-1.5 bg-red-600 hover:bg-red-700 rounded-lg flex items-center justify-center gap-1.5 transition-all text-white text-xs font-medium min-h-11">
                          <ArrowUpRight className="h-3 w-3" /> Escalate
                        </button>
                      </div>
                      <div className="flex gap-1">
                        <button type="button" onClick={() => onOpenDetail(r.user_id)} className="flex-1 px-2 py-1.5 bg-purple-600 hover:bg-purple-700 rounded-lg flex items-center justify-center gap-1.5 transition-all text-white text-xs font-medium min-h-11">
                          <Ban className="h-3 w-3" /> Suspend
                        </button>
                        <button type="button" onClick={() => onOpenDetail(r.user_id)} className="flex-1 px-2 py-1.5 bg-emerald-600 hover:bg-emerald-700 rounded-lg flex items-center justify-center gap-1.5 transition-all text-white text-xs font-medium min-h-11">
                          <CheckCircle2 className="h-3 w-3" /> Unflag
                        </button>
                      </div>
                      <button type="button" onClick={() => onOpenDetail(r.user_id)} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg flex items-center justify-center gap-2 transition-all text-slate-300 text-xs font-medium min-h-11">
                        <StickyNote className="h-3 w-3" /> Add Note
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {total > pageSize && (
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800">
          <p className={`${ADMIN_GROUND.muted} text-sm`}>Page {page} of {lastPage}</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => onPage(Math.max(1, page - 1))} disabled={page <= 1} className={`px-3 py-1.5 ${ADMIN_GROUND.raised} ${ADMIN_GROUND.body} rounded-lg text-sm disabled:opacity-50 min-h-11`}>Previous</button>
            <button type="button" onClick={() => onPage(Math.min(lastPage, page + 1))} disabled={page >= lastPage} className={`px-3 py-1.5 ${ADMIN_GROUND.raised} ${ADMIN_GROUND.body} rounded-lg text-sm disabled:opacity-50 min-h-11`}>Next</button>
          </div>
        </div>
      )}
    </div>
  );
}