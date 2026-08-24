import {
  Flag, FlagOff, Star, Clock, Mail, Phone, IdCard, User as UserIcon,
  ShieldHalf, Scale, ArrowLeftRight, MoreVertical, Ban, FileSearch,
  UserCog, FileDown, ChevronLeft, ChevronRight,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import type { UserDirectoryRow } from "@/services/admin-users-directory.service";
import { formatMoneyCompact } from "@/lib/format";
import { toast } from "@/hooks/use-toast";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PresenceDot } from "./PresenceDot";
import { keyActivate } from "@/lib/a11y";
import { ADMIN_TONE, ADMIN_GROUND } from "@/components/admin/palette";

interface Props {
  rows: UserDirectoryRow[];
  total: number; page: number; pageSize: number;
  onOpen: (id: string) => void;
  onPage: (p: number) => void;
  onFlagToggle: (row: UserDirectoryRow) => void;
  onSuspend: (row: UserDirectoryRow) => void;
  isOnline?: (userId: string) => boolean;
}

function relative(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function statusChip(r: UserDirectoryRow) {
  if (r.status === "suspended") return { label: "Suspended", cls: "bg-purple-500/10 text-purple-400 border-purple-500/20" };
  if (r.status === "under_investigation") return { label: "Investigating", cls: "bg-red-500/10 text-red-400 border-red-500/20" };
  if (r.status === "flagged") return { label: "Flagged", cls: "bg-red-500/10 text-red-400 border-red-500/20" };
  if (r.status === "pending") {
    return { label: r.verification.id ? "Pending" : "Pending ID", cls: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" };
  }
  return { label: "Active Now", cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" };
}

function ringClass(r: UserDirectoryRow) {
  if (r.is_flagged || r.status === "under_investigation" || r.is_suspended) return "ring-red-500/30";
  if (r.trust_badge === "trusted_seller") return "ring-emerald-500/30";
  if (r.status === "pending") return "ring-yellow-500/30";
  return "ring-slate-700";
}

function cornerBadge(r: UserDirectoryRow) {
  if (r.is_flagged || r.status === "under_investigation")
    return { wrap: "bg-red-600", icon: <Flag className="h-2.5 w-2.5 text-white" /> };
  if (r.trust_badge === "trusted_seller")
    return { wrap: "bg-emerald-600", icon: <Star className="h-2.5 w-2.5 text-white" /> };
  if (r.status === "pending")
    return { wrap: "bg-yellow-600", icon: <Clock className="h-2.5 w-2.5 text-white" /> };
  return null;
}

export function UsersMobileFeed({ rows, total, page, pageSize, onOpen, onPage, onFlagToggle, onSuspend, isOnline }: Props) {
  const navigate = useNavigate();
  const [overflowRow, setOverflowRow] = useState<UserDirectoryRow | null>(null);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);

  return (
    <div className="lg:hidden">
      <div className="p-4 space-y-4">
        {rows.length === 0 && (
          <div className={`${ADMIN_GROUND.panel} border rounded-2xl p-8 text-center ${ADMIN_GROUND.muted}`}>
            No users match these filters.
          </div>
        )}
        {rows.map((r) => {
          const init = (r.full_name || "?").slice(0, 1).toUpperCase();
          const ring = ringClass(r);
          const badge = cornerBadge(r);
          const chip = statusChip(r);
          const isFlaggedish = r.is_flagged || r.status === "under_investigation" || r.is_suspended;
          const isTrustedSeller = r.trust_badge === "trusted_seller" && r.roles.includes("seller");
          const isBusinessUnverified = r.roles.includes("business") && r.verification.level !== "fully";

          return (
            <div key={r.user_id} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl shadow-black/20">
              {/* Card body: opens full detail page */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/admin/users/${r.user_id}`)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(`/admin/users/${r.user_id}`); } }}
                className="cursor-pointer active:bg-slate-800/40 transition-colors"
              >
              <div className={`p-4 border-b ${ADMIN_GROUND.border} flex items-center gap-4`}>
                <button onClick={(e) => { e.stopPropagation(); onOpen(r.user_id); }} className="relative min-h-11 inline-flex items-center">
                  {r.avatar_url
                    ? <img src={r.avatar_url} className={`w-14 h-14 rounded-full ring-2 ${ring}`} alt={r.full_name} />
                    : <span className={`w-14 h-14 rounded-full ring-2 ${ring} bg-slate-700 text-white font-semibold inline-flex items-center justify-center`}>{init}</span>}
                  {badge && (
                    <div className={`absolute -bottom-1 -right-1 w-6 h-6 ${badge.wrap} rounded-full flex items-center justify-center border-2 border-slate-900`}>
                      {badge.icon}
                    </div>
                  )}
                  {!badge && <PresenceDot online={!!isOnline?.(r.user_id)} ringClass="ring-slate-900" size="md" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <button onClick={(e) => { e.stopPropagation(); onOpen(r.user_id); }} className={`${ADMIN_GROUND.heading} font-bold truncate min-h-11 inline-flex items-center`}>{r.full_name || "Unnamed"}</button>
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded border uppercase tracking-tight ${chip.cls}`}>{chip.label}</span>
                  </div>
                  <p className={`${ADMIN_GROUND.faint} text-xs truncate`}>
                    {r.handle} • {r.last_active_at ? `Active ${relative(r.last_active_at)}` : new Date(r.joined_at ?? Date.now()).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </div>
              </div>

              {/* Stats strip */}
              <div className="p-4 bg-slate-800/30 grid grid-cols-2 gap-4 border-b border-slate-800">
                {isTrustedSeller ? (
                  <>
                    <div>
                      <p className={`text-xs ${ADMIN_GROUND.faint} uppercase font-bold mb-1 tracking-widest`}>Verification</p>
                      <div className="flex gap-1.5">
                        <Mail className={`h-3 w-3 ${r.verification.email ? "text-emerald-400" : "text-slate-500"}`} />
                        <Phone className={`h-3 w-3 ${r.verification.phone ? "text-emerald-400" : "text-slate-500"}`} />
                        <IdCard className={`h-3 w-3 ${r.verification.id ? "text-emerald-400" : "text-slate-500"}`} />
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-xs ${ADMIN_GROUND.faint} uppercase font-bold mb-1 tracking-widest`}>Volume</p>
                      <p className={`${ADMIN_TONE.success.text} font-bold text-lg`}>{r.transactions.volume > 0 ? formatMoneyCompact(r.transactions.volume, r.transactions.currency) : "—"}</p>
                    </div>
                  </>
                ) : isBusinessUnverified ? (
                  <>
                    <div>
                      <p className={`text-xs ${ADMIN_GROUND.faint} uppercase font-bold mb-1 tracking-widest`}>Type</p>
                      <span className={`${ADMIN_TONE.special.text} font-bold text-sm`}>Business Account</span>
                    </div>
                    <div className="text-right">
                      <p className={`text-xs ${ADMIN_GROUND.faint} uppercase font-bold mb-1 tracking-widest`}>Disputes</p>
                      <p className={`${ADMIN_GROUND.heading} font-bold text-sm`}>
                        {r.disputes.active > 0 ? `${r.disputes.active} In Progress` : r.disputes.total > 0 ? `${r.disputes.total} Total` : "Clean"}
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <p className={`text-xs ${ADMIN_GROUND.faint} uppercase font-bold mb-1 tracking-widest`}>Transactions</p>
                      <p className={`${ADMIN_GROUND.heading} font-bold text-lg`}>
                        {r.transactions.count}{" "}
                        <span className={`text-xs font-normal ${ADMIN_GROUND.muted}`}>
                          ({r.transactions.resolved > 0
                            ? `${r.transactions.resolved} resolved`
                            : r.transactions.volume > 0 ? formatMoneyCompact(r.transactions.volume, r.transactions.currency) : "—"})
                        </span>
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-xs ${ADMIN_GROUND.faint} uppercase font-bold mb-1 tracking-widest`}>Disputes</p>
                      {r.disputes.active > 0
                        ? <p className={`${ADMIN_TONE.danger.text} font-bold text-sm`}>Active disputes</p>
                        : r.disputes.total > 0
                          ? <p className="text-yellow-400 font-bold text-sm">In progress</p>
                          : <p className={`${ADMIN_GROUND.muted} font-bold text-sm`}>Clean record</p>}
                    </div>
                  </>
                )}
              </div>
              </div>

              {/* Action row */}
              <div role="button" tabIndex={0} onKeyDown={keyActivate} className="p-4 flex gap-2" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={(e) => { e.stopPropagation(); onOpen(r.user_id); }}
                  className="flex-1 py-3 bg-blue-600 text-white rounded-xl text-xs font-bold active:scale-95 transition-transform inline-flex items-center justify-center gap-2 min-h-11"
                >
                  <UserIcon className="h-3.5 w-3.5" /> Profile
                </button>
                {isFlaggedish ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); navigate(`/admin/flagged-users?u=${r.user_id}`); }}
                    className="flex-1 py-3 bg-slate-800 text-slate-300 rounded-xl text-xs font-bold active:scale-95 transition-transform inline-flex items-center justify-center gap-2 min-h-11"
                  >
                    <ShieldHalf className="h-3.5 w-3.5" /> Review
                  </button>
                ) : isTrustedSeller ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); navigate(`/admin/transactions?q=${r.user_id}`); }}
                    className="flex-1 py-3 bg-emerald-600/10 text-emerald-400 rounded-xl text-xs font-bold border border-emerald-600/20 active:scale-95 inline-flex items-center justify-center gap-2 min-h-11"
                  >
                    <ArrowLeftRight className="h-3.5 w-3.5" /> Transactions
                  </button>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); navigate(`/admin/disputes?q=${r.user_id}`); }}
                    disabled={r.disputes.total === 0}
                    className={`min-h-11 flex-1 py-3 rounded-xl text-xs font-bold active:scale-95 inline-flex items-center justify-center gap-2 ${
                      r.disputes.total === 0 ? "bg-slate-800/60 text-slate-500" : "bg-slate-800 text-slate-300"
                    }`}
                  >
                    <Scale className="h-3.5 w-3.5" /> Disputes
                  </button>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); setOverflowRow(r); }}
                  className="w-12 h-12 bg-slate-800 text-slate-300 rounded-xl flex items-center justify-center active:scale-95"
                  aria-label="More actions"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {rows.length > 0 && (
        <div className="px-4 py-4 flex items-center justify-between">
          <span className={`${ADMIN_GROUND.faint} text-xs font-medium`}>Showing {start}–{end} of {total.toLocaleString()} users</span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => onPage(page - 1)}
              className="w-10 h-10 bg-slate-900 border border-slate-800 rounded-lg text-slate-300 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed relative before:absolute before:-inset-2 before:content-['']"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="w-10 h-10 bg-emerald-600 text-white rounded-lg flex items-center justify-center text-sm font-bold">{page}</span>
            <button
              disabled={page >= pageCount}
              onClick={() => onPage(page + 1)}
              className="w-10 h-10 bg-slate-900 border border-slate-800 rounded-lg text-slate-300 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed relative before:absolute before:-inset-2 before:content-['']"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Overflow sheet */}
      <Sheet open={!!overflowRow} onOpenChange={(o) => { if (!o) setOverflowRow(null); }}>
        <SheetContent side="bottom" className="bg-slate-950 border-slate-800 text-slate-200">
          <SheetHeader>
            <SheetTitle className={ADMIN_GROUND.heading}>{overflowRow?.full_name ?? "User"}</SheetTitle>
          </SheetHeader>
          {overflowRow && (
            <div className="mt-4 grid grid-cols-1 gap-2">
              <button
                onClick={() => { const r = overflowRow; setOverflowRow(null); onFlagToggle(r); }}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold ${
                  overflowRow.is_flagged ? "bg-slate-800 text-slate-200" : "bg-yellow-600 text-white"
                }`}
              >
                {overflowRow.is_flagged ? <FlagOff className="h-4 w-4" /> : <Flag className="h-4 w-4" />}
                {overflowRow.is_flagged ? "Clear flag" : "Flag user"}
              </button>
              <button
                onClick={() => { const r = overflowRow; setOverflowRow(null); onSuspend(r); }}
                disabled={overflowRow.is_suspended}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold bg-purple-600 text-white disabled:bg-slate-800/60 disabled:text-slate-500"
              >
                <Ban className="h-4 w-4" /> {overflowRow.is_suspended ? "Already suspended" : "Suspend user"}
              </button>
              <button
                onClick={() => { const id = overflowRow.user_id; setOverflowRow(null); navigate(`/admin/flagged-users?u=${id}`); }}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold bg-red-600 text-white"
              >
                <FileSearch className="h-4 w-4" /> Open investigation
              </button>
              <button
                onClick={() => { setOverflowRow(null); toast({ title: "Impersonation coming soon" }); }}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold ${ADMIN_GROUND.raised} text-slate-200`}
              >
                <UserCog className="h-4 w-4" /> Start impersonation
              </button>
              <button
                onClick={() => { setOverflowRow(null); toast({ title: "Per-user export coming soon" }); }}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold ${ADMIN_GROUND.raised} text-slate-200`}
              >
                <FileDown className="h-4 w-4" /> Export user
              </button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}