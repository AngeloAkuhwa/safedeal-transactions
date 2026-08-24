import {
  Flag, ShieldCheck, IdCard, Mail, Phone, Star, Clock,
  User as UserIcon, Scale, Search, ChevronLeft, ChevronRight,
  UserCog, ArrowLeftRight, FileSearch, FlagOff, FileDown,
} from "lucide-react";
import { useNavigate } from "react-router";
import type { UserDirectoryRow } from "@/services/admin-users-directory.service";
import { formatMoneyCompact } from "@/lib/format";
import { toast } from "@/hooks/use-toast";
import { PresenceDot } from "./PresenceDot";
import { resolveClaim } from "@/lib/trust/trust-claims";
import { keyActivate } from "@/lib/a11y";
import { ADMIN_TONE, ADMIN_SOLID, ADMIN_GROUND } from "@/components/admin/palette";

interface Props {
  rows: UserDirectoryRow[];
  total: number;
  page: number;
  pageSize: number;
  onOpenDetail: (id: string) => void;
  onPage: (p: number) => void;
  onFlagToggle: (row: UserDirectoryRow) => void;
  onSuspend: (row: UserDirectoryRow) => void;
  isOnline?: (userId: string) => boolean;
}

const ROLE_CLASS: Record<string, string> = {
  buyer: "bg-blue-500/10 border-blue-500/20 text-blue-400",
  seller: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
  business: "bg-purple-500/10 border-purple-500/20 text-purple-400",
  admin: ADMIN_TONE.warning.chip,
};

const STATUS_CLASS: Record<string, string> = {
  active: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
  flagged: "bg-red-500/10 border-red-500/20 text-red-400",
  suspended: "bg-purple-500/10 border-purple-500/20 text-purple-400",
  pending: ADMIN_TONE.warning.chip,
  under_investigation: "bg-orange-500/10 border-orange-500/20 text-orange-400",
};

function relativeDate(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const d = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (d < 1) return "today";
  if (d < 30) return `${d}d ago`;
  const m = Math.floor(d / 30);
  if (m < 12) return `${m}mo ago`;
  const y = Math.floor(m / 12);
  return `${y}yr${y === 1 ? "" : "s"} ago`;
}

function fmtJoined(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" });
}

export function UsersTable({ rows, total, page, pageSize, onOpenDetail, onPage, onFlagToggle, isOnline }: Props) {
  const navigate = useNavigate();
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className={`hidden lg:block ${ADMIN_GROUND.panel} border rounded-xl`}>
      <div className={`p-6 border-b ${ADMIN_GROUND.border} flex items-center justify-between`}>
        <div>
          <h3 className={`${ADMIN_GROUND.heading} text-lg font-semibold`}>User Records</h3>
          <p className={`${ADMIN_GROUND.muted} text-sm mt-1`}>{total.toLocaleString()} total • Showing {start}-{end}</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full sd-stack">
          <thead className={`${ADMIN_GROUND.raised} border-b ${ADMIN_GROUND.borderSoft}`}>
            <tr>
              <th className={`text-left p-4 ${ADMIN_GROUND.body} font-semibold text-sm whitespace-nowrap`}>User</th>
              <th className={`text-left p-4 ${ADMIN_GROUND.body} font-semibold text-sm whitespace-nowrap`}>Contact</th>
              <th className={`text-left p-4 ${ADMIN_GROUND.body} font-semibold text-sm whitespace-nowrap`}>Roles</th>
              <th className={`text-left p-4 ${ADMIN_GROUND.body} font-semibold text-sm whitespace-nowrap`}>Verification</th>
              <th className={`text-right p-4 ${ADMIN_GROUND.body} font-semibold text-sm whitespace-nowrap`}>Transactions</th>
              <th className={`text-right p-4 ${ADMIN_GROUND.body} font-semibold text-sm whitespace-nowrap`}>Disputes</th>
              <th className={`text-left p-4 ${ADMIN_GROUND.body} font-semibold text-sm whitespace-nowrap`}>Status</th>
              <th className={`text-left p-4 ${ADMIN_GROUND.body} font-semibold text-sm whitespace-nowrap`}>Joined</th>
              <th className="text-center p-4 text-slate-300 font-semibold text-sm whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {rows.length === 0 && (
              <tr><td colSpan={9} className={`p-12 text-center ${ADMIN_GROUND.muted}`}>
                <Search className="h-8 w-8 mx-auto mb-2 opacity-40" />
                No users match these filters.
              </td></tr>
            )}
            {rows.map((r) => {
              const ring = r.is_flagged || r.is_suspended ? "ring-red-500/30"
                : r.trust_badge === "trusted_seller" ? "ring-emerald-500/30"
                : r.status === "pending" ? "ring-amber-500/30" : "ring-slate-700";
              const init = (r.full_name || "?").slice(0, 1).toUpperCase();
              return (
                <tr role="button" tabIndex={0} onKeyDown={keyActivate}
                  key={r.user_id}
                  className="hover:bg-slate-800/50 transition-all cursor-pointer"
                  onClick={() => navigate(`/admin/users/${r.user_id}`)}
                >
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={(e) => { e.stopPropagation(); onOpenDetail(r.user_id); }}
                        className="relative block min-h-11"
                      >
                        {r.avatar_url
                          ? <img src={r.avatar_url} className={`w-10 h-10 rounded-full ring-2 ${ring}`} alt={r.full_name} />
                          : <span className={`w-10 h-10 rounded-full ring-2 ${ring} bg-slate-700 text-white font-semibold inline-flex items-center justify-center`}>{init}</span>}
                        <PresenceDot online={!!isOnline?.(r.user_id)} ringClass="ring-slate-900" />
                      </button>
                      <div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); onOpenDetail(r.user_id); }}
                            className={`${ADMIN_GROUND.heading} font-semibold hover:underline text-left min-h-11 inline-flex items-center`}
                          >{r.full_name}</button>
                          {r.is_flagged && (
                            <span className={`w-5 h-5 ${ADMIN_TONE.danger.panel} border rounded flex items-center justify-center`} title="Flagged">
                              <Flag className={`h-3 w-3 ${ADMIN_TONE.danger.text}`} />
                            </span>
                          )}
                          {r.trust_badge === "trusted_seller" && (
                            <span className={`w-5 h-5 ${ADMIN_TONE.success.panel} border rounded flex items-center justify-center`} title="Trusted Seller">
                              <Star className={`h-3 w-3 ${ADMIN_TONE.success.text}`} />
                            </span>
                          )}
                          {r.status === "pending" && (
                            <span className="w-5 h-5 bg-amber-500/10 border border-amber-500/30 rounded flex items-center justify-center" title="Pending verification">
                              <Clock className="h-3 w-3 text-amber-400" />
                            </span>
                          )}
                        </div>
                        <p className={`${ADMIN_GROUND.muted} text-xs mt-0.5`}>{r.handle}</p>
                        <p className={`${ADMIN_GROUND.faint} text-xs mt-1`}>{r.display_id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <p className={`${ADMIN_GROUND.heading} text-sm font-medium truncate max-w-[220px]`}>{r.email || "—"}</p>
                    <p className={`${ADMIN_GROUND.muted} text-xs mt-0.5`}>{r.phone ?? "—"}</p>
                  </td>
                  <td className="p-4">
                    <div className="flex flex-wrap gap-1.5">
                      {r.roles.length === 0 && <span className={`${ADMIN_GROUND.faint} text-xs`}>—</span>}
                      {r.roles.map((role) => (
                        <span key={role} className={`px-2.5 py-1 border rounded-md text-xs font-semibold capitalize ${ROLE_CLASS[role] ?? "bg-slate-700 text-slate-300 border-slate-600"}`}>{role}</span>
                      ))}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="space-y-1.5">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 border rounded-md text-xs font-semibold ${r.verification.level === "fully" || r.verification.level === "id" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : r.verification.level === "none" ? "bg-slate-700/40 border-slate-600/30 text-slate-400" : ADMIN_TONE.warning.chip}`}>
                        <ShieldCheck className="h-3 w-3" />
                        {r.verification.level === "fully" ? "Fully Verified" : r.verification.level === "id" ? "ID Verified" : r.verification.level === "phone" ? resolveClaim("SELLER_PHONE_VERIFIED", { phoneVerified: r.verification.level === "phone" }) : r.verification.level === "email" ? "Email Only" : "Unverified"}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className={`w-5 h-5 rounded flex items-center justify-center border ${r.verification.email ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-slate-700/40 border-slate-600/30 text-slate-500"}`} title="Email"><Mail className="h-3 w-3" /></span>
                        <span className={`w-5 h-5 rounded flex items-center justify-center border ${r.verification.phone ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-slate-700/40 border-slate-600/30 text-slate-500"}`} title="Phone"><Phone className="h-3 w-3" /></span>
                        <span className={`w-5 h-5 rounded flex items-center justify-center border ${r.verification.id ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-slate-700/40 border-slate-600/30 text-slate-500"}`} title="ID"><IdCard className="h-3 w-3" /></span>
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-right">
                    <p className={`${ADMIN_GROUND.heading} font-bold text-base`}>{r.transactions.count}</p>
                    <p className={`${ADMIN_TONE.success.text} text-xs mt-0.5 font-medium`}>
                      {r.transactions.resolved > 0
                        ? `${r.transactions.resolved} resolved`
                        : r.transactions.volume > 0 ? formatMoneyCompact(r.transactions.volume, r.transactions.currency) : "—"}
                    </p>
                  </td>
                  <td className="p-4 text-right">
                    <p className={`font-bold text-base ${r.disputes.active > 0 ? "text-red-400" : "text-white"}`}>
                      {r.disputes.active > 0 ? r.disputes.active : r.disputes.total}
                    </p>
                    {r.disputes.active > 0
                      ? <p className={`${ADMIN_TONE.danger.text} text-xs mt-0.5 font-medium`}>Active · of {r.disputes.total} total</p>
                      : r.disputes.total > 0
                        ? <p className="text-amber-400 text-xs mt-0.5 font-medium">In progress</p>
                        : <p className={`${ADMIN_GROUND.muted} text-xs mt-0.5`}>Clean record</p>}
                  </td>
                  <td className="p-4">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-md text-xs font-semibold ${STATUS_CLASS[r.status]}`}>
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      {r.status === "under_investigation"
                        ? "Investigating"
                        : r.status === "pending"
                          ? (r.verification.id ? "Pending" : "Pending ID")
                          : r.status === "active"
                            ? "Active Now"
                            : r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                    </span>
                  </td>
                  <td className="p-4">
                    <p className={`${ADMIN_GROUND.heading} text-sm font-medium`}>{fmtJoined(r.joined_at)}</p>
                    <p className={`${ADMIN_GROUND.muted} text-xs mt-0.5`}>{relativeDate(r.joined_at)}</p>
                  </td>
                  <td className="p-4">
                    <div role="button" tabIndex={0} onKeyDown={keyActivate} className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <button title="Quick preview" onClick={(e) => { e.stopPropagation(); onOpenDetail(r.user_id); }} className={`px-2.5 py-1.5 ${ADMIN_SOLID.info} rounded text-xs min-h-11 min-w-11 inline-flex items-center justify-center`}><UserIcon className="h-3.5 w-3.5" /></button>
                      <button title="Transactions" onClick={(e) => { e.stopPropagation(); navigate(`/admin/transactions?q=${r.user_id}`); }} className={`px-2.5 py-1.5 ${ADMIN_SOLID.success} rounded text-xs min-h-11 min-w-11 inline-flex items-center justify-center`}><ArrowLeftRight className="h-3.5 w-3.5" /></button>
                      <button title="Disputes" disabled={r.disputes.total === 0} onClick={(e) => { e.stopPropagation(); navigate(`/admin/disputes?q=${r.user_id}`); }} className={`px-2.5 py-1.5 rounded text-xs relative ${r.disputes.total === 0 ? "bg-slate-700/50 text-slate-500 cursor-not-allowed" : "bg-orange-600 hover:bg-orange-700 text-white"} min-h-11 min-w-11 justify-center`}>
                        <Scale className="h-3.5 w-3.5" />
                        {r.disputes.active > 0 && <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">{r.disputes.active}</span>}
                      </button>
                      <button title="Review Investigation" onClick={(e) => { e.stopPropagation(); navigate(`/admin/flagged-users?u=${r.user_id}`); }} className="px-2.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-xs min-h-11 min-w-11 inline-flex items-center justify-center"><FileSearch className="h-3.5 w-3.5" /></button>
                      <button title="Start Impersonation" onClick={(e) => { e.stopPropagation(); toast({ title: "Impersonation coming soon" }); }} className={`px-2.5 py-1.5 ${ADMIN_SOLID.special} rounded text-xs min-h-11 min-w-11 inline-flex items-center justify-center`}><UserCog className="h-3.5 w-3.5" /></button>
                      <button title={r.is_flagged ? "Unflag user" : "Flag user"} onClick={(e) => { e.stopPropagation(); onFlagToggle(r); }} className={`px-2.5 py-1.5 rounded text-xs text-white ${r.is_flagged ? "bg-slate-700 hover:bg-slate-600" : "bg-amber-600 hover:bg-amber-700"} min-h-11 min-w-11 justify-center`}>
                        {r.is_flagged ? <FlagOff className="h-3.5 w-3.5" /> : <Flag className="h-3.5 w-3.5" />}
                      </button>
                      <button title="Generate Export" onClick={(e) => { e.stopPropagation(); toast({ title: "Per-user export coming soon" }); }} className="px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs min-h-11 min-w-11 inline-flex items-center justify-center"><FileDown className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className={`p-6 border-t ${ADMIN_GROUND.border} flex flex-col sm:flex-row items-center justify-between gap-4`}>
        <p className={`${ADMIN_GROUND.muted} text-sm`}>Showing {start}–{end} of {total.toLocaleString()} users</p>
        <div className="flex items-center gap-2">
          <button disabled={page <= 1} onClick={() => onPage(page - 1)} className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg disabled:opacity-50 min-h-11 min-w-11 inline-flex items-center justify-center"><ChevronLeft className="h-4 w-4" /></button>
          <span className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium">{page}</span>
          <span className={`${ADMIN_GROUND.faint} text-sm`}>of {pageCount.toLocaleString()}</span>
          <button disabled={page >= pageCount} onClick={() => onPage(page + 1)} className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg disabled:opacity-50 min-h-11 min-w-11 inline-flex items-center justify-center"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
    </div>
  );
}