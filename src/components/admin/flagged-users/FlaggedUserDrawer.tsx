import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  X, Flag, Banknote, Scale, Bot, Clock, Loader2,
  Ban, CheckCircle2, ArrowUpRight, StickyNote, ShieldCheck,
} from "lucide-react";
import {
  fetchFlaggedUserDetail, performFlaggedAction,
  type FlaggedUserRow, type FlaggedActionType,
} from "@/services/admin-flagged-users.service";
import { formatMoney } from "@/lib/format";
import { toast } from "@/hooks/use-toast";
import { UserAvatar } from "./UserAvatar";
import { RISK_AVATAR_RING, RISK_LABEL, RISK_PILL, RISK_DOT, absoluteDate, relative } from "./risk";
import { keyActivate } from "@/lib/a11y";
import { ADMIN_TONE } from "@/components/admin/palette";

interface Props {
  row: FlaggedUserRow | null;
  /** Deep-link fallback when row isn't present in the current page. */
  userId?: string | null;
  open: boolean;
  onClose: () => void;
}

const ACTION_LABELS: Record<FlaggedActionType, string> = {
  clear_flag: "Clear Flag",
  suspend_user: "Suspend",
  unsuspend_user: "Unsuspend",
  escalate_case: "Escalate",
  add_note: "Add Note",
  flag_user: "Flag",
};

export function FlaggedUserDrawer({ row, userId, open, onClose }: Props) {
  const qc = useQueryClient();
  const [pending, setPending] = useState<FlaggedActionType | null>(null);
  const [note, setNote] = useState("");
  const targetId = row?.user_id ?? userId ?? "";

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ["admin-flagged-user-detail", targetId],
    queryFn: () => fetchFlaggedUserDetail(targetId),
    enabled: !!targetId && open,
    staleTime: 15_000,
  });

  if (!open || !targetId) return null;

  // Build display from row when present, otherwise from the detail payload
  const view = row ?? (detail ? {
    user_id: detail.user.id,
    name: detail.user.full_name || "Unknown user",
    email: detail.user.email || null,
    avatar_url: detail.user.avatar_url,
    short_id: detail.user.display_id,
    risk: detail.risk.level,
    reasons: detail.flag_reasons.map((r) => ({ key: r.key, label: r.label })),
    disputes_30d: 0, refunds_30d: 0, identity_rejected: false,
    auto_detected: false,
    related: { tx_code: null, tx_id: null, tx_amount: null, dispute_count: 0 },
    escrow_at_risk: null,
    flagged_by: { name: "Auto-Detection", avatar_url: null, is_system: true },
    flagged_at: detail.flagged_at,
    status: detail.status,
  } as FlaggedUserRow : null);

  const runAction = async (action: FlaggedActionType) => {
    if (!note.trim()) {
      toast({ title: "Note required", description: "Add a short reason before continuing.", variant: "destructive" });
      return;
    }
    setPending(action);
    try {
      await performFlaggedAction({
        action, user_id: targetId, note: note.trim(),
        reason_key: view?.reasons[0]?.key,
        transaction_id: view?.related.tx_id ?? undefined,
      });
      toast({ title: `${ACTION_LABELS[action]} recorded`, description: view?.name ?? "" });
      setNote("");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin-flagged-users"] }),
        qc.invalidateQueries({ queryKey: ["admin-flagged-user-detail", targetId] }),
      ]);
      if (action === "suspend_user" || action === "clear_flag") onClose();
    } catch (e) {
      toast({ title: `${ACTION_LABELS[action]} failed`, description: (e as Error).message, variant: "destructive" });
    } finally {
      setPending(null);
    }
  };

  const av = detail?.available_actions;
  const canSuspend = av?.can_suspend ?? (view?.status !== "suspended");
  const canClear = av?.can_clear ?? ((view?.reasons.length ?? 0) > 0);
  const canEscalate = av?.can_escalate ?? (view?.status !== "suspended");

  // While detail is loading and we have no row, show a minimal shell
  if (!view) {
    return (
      <div className="fixed inset-0 z-overlay flex justify-end">
        <div role="button" tabIndex={0} onKeyDown={keyActivate} className="absolute inset-0 bg-black/60" onClick={onClose} />
        <aside className="relative h-full w-full max-w-md bg-slate-950 border-l border-slate-800 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
        </aside>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-overlay flex justify-end">
      <div role="button" tabIndex={0} onKeyDown={keyActivate} className="absolute inset-0 bg-black/60" onClick={onClose} />
      <aside className="relative h-full w-full max-w-md bg-slate-950 border-l border-slate-800 overflow-y-auto">
        <div className="sticky top-0 z-sticky flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/95 backdrop-blur">
          <div className="flex items-center gap-2">
            <Flag className={`h-4 w-4 ${ADMIN_TONE.danger.text}`} />
            <h3 className="text-white font-semibold text-base">Flagged user</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="h-11 w-11 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="flex items-center gap-4">
            <UserAvatar name={view.name} avatarUrl={view.avatar_url} ringClass={RISK_AVATAR_RING[view.risk]} size="lg" />
            <div className="min-w-0">
              <p className="text-white font-bold truncate">{view.name}</p>
              <p className="text-slate-400 text-xs truncate">{view.email ?? "—"}</p>
              <p className="text-slate-500 text-xs">ID: {view.short_id}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold border ${RISK_PILL[view.risk]}`}>
              <span className={`h-2 w-2 rounded-full ${RISK_DOT[view.risk]}`} />
              {RISK_LABEL[view.risk]} Risk
            </span>
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-800 border border-slate-700 text-slate-300 capitalize">
              {view.status.replace("_", " ")}
            </span>
          </div>

          <section>
            <h4 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">Flag reasons</h4>
            <div className="flex flex-wrap gap-2">
              {view.reasons.length === 0 && <span className="text-slate-500 text-xs">—</span>}
              {view.reasons.map((r) => (
                <span key={r.key} className="px-2.5 py-1 rounded-full text-xs font-semibold border bg-slate-800/60 border-slate-700 text-slate-200">
                  {r.label}
                </span>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <h4 className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Context</h4>
            {view.related.tx_code ? (
              <div className="flex items-start gap-3 p-3 bg-slate-900 border border-slate-800 rounded-xl">
                <Banknote className={`h-4 w-4 ${ADMIN_TONE.special.text} mt-0.5`} />
                <div>
                  <p className="text-white text-sm font-medium">#{view.related.tx_code}</p>
                  <p className="text-slate-400 text-xs">
                    {view.related.tx_amount > 0 ? `${formatMoney(view.related.tx_amount, "NGN")} • escrow context` : "Escrow context"}
                  </p>
                </div>
              </div>
            ) : <p className="text-slate-500 text-xs">No related transaction.</p>}
            {view.disputes_30d > 0 && (
              <div className="flex items-start gap-3 p-3 bg-slate-900 border border-slate-800 rounded-xl">
                <Scale className={`h-4 w-4 ${ADMIN_TONE.elevated.text} mt-0.5`} />
                <div>
                  <p className={`${ADMIN_TONE.elevated.text} text-sm font-medium`}>{view.disputes_30d} dispute{view.disputes_30d === 1 ? "" : "s"} in 30 days</p>
                  <p className="text-slate-400 text-xs">{view.refunds_30d > 0 ? `${view.refunds_30d} chargeback(s)` : "No chargebacks"}</p>
                </div>
              </div>
            )}
            {view.escrow_at_risk > 0 && (
              <div className="flex items-start gap-3 p-3 bg-slate-900 border border-slate-800 rounded-xl">
                <Clock className="h-4 w-4 text-red-300 mt-0.5" />
                <div>
                  <p className="text-white text-sm font-medium">{formatMoney(view.escrow_at_risk, "NGN")}</p>
                  <p className="text-slate-400 text-xs">Total escrow exposure across flagged transactions</p>
                </div>
              </div>
            )}
          </section>

          <section>
            <h4 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">Flagged by</h4>
            <div className="flex items-center gap-3">
              {view.flagged_by.is_system ? (
                <>
                  <div className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center">
                    <Bot className={`h-4 w-4 ${ADMIN_TONE.info.text}`} />
                  </div>
                  <div>
                    <p className="text-white text-sm font-medium">Auto-Detection</p>
                    <p className="text-slate-400 text-xs">Fraud Algorithm • {relative(view.flagged_at)}</p>
                  </div>
                </>
              ) : (
                <>
                  <UserAvatar name={view.flagged_by.name} avatarUrl={view.flagged_by.avatar_url} size="sm" />
                  <div>
                    <p className="text-white text-sm font-medium">{view.flagged_by.name}</p>
                    <p className="text-slate-400 text-xs">Admin • {absoluteDate(view.flagged_at)}</p>
                  </div>
                </>
              )}
            </div>
          </section>

          {detail?.risk?.recommendation && (
            <section className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
              <div className="flex items-start gap-2">
                <ShieldCheck className="h-4 w-4 text-blue-300 mt-0.5" />
                <div>
                  <p className="text-blue-200 text-xs font-semibold uppercase tracking-wider mb-1">Recommendation</p>
                  <p className="text-slate-200 text-sm">{detail.risk.recommendation}</p>
                </div>
              </div>
            </section>
          )}

          <section>
            <h4 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">Recent admin actions</h4>
            {detailLoading && <Loader2 className="h-4 w-4 animate-spin text-slate-500" />}
            {!detailLoading && (detail?.admin_actions?.length ?? 0) === 0 && (
              <p className="text-slate-500 text-xs">No admin actions yet.</p>
            )}
            <ul className="space-y-2">
              {detail?.admin_actions?.slice(0, 5).map((a) => (
                <li key={a.id} className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="text-white text-xs font-semibold">{a.label}</span>
                    <span className="text-slate-500 text-xs">{relative(a.created_at)}</span>
                  </div>
                  <p className="text-slate-400 text-xs mt-0.5">by {a.admin_name}</p>
                  {a.note && <p className="text-slate-500 text-xs mt-1 line-clamp-2">{a.note}</p>}
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-2 pt-2 border-t border-slate-800">
            <h4 className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Take action</h4>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Required note: reason for this action…"
              rows={3}
              className="w-full p-3 bg-slate-900 border border-slate-800 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-red-500"
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button" disabled={!canSuspend || !!pending}
                onClick={() => runAction("suspend_user")}
                className="px-3 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-lg flex items-center justify-center gap-2 text-white text-sm font-semibold min-h-11"
              >
                {pending === "suspend_user" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
                Suspend
              </button>
              <button
                type="button" disabled={!canClear || !!pending}
                onClick={() => runAction("clear_flag")}
                className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg flex items-center justify-center gap-2 text-white text-sm font-semibold min-h-11"
              >
                {pending === "clear_flag" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Clear Flag
              </button>
              <button
                type="button" disabled={!canEscalate || !!pending}
                onClick={() => runAction("escalate_case")}
                className="px-3 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 rounded-lg flex items-center justify-center gap-2 text-white text-sm font-semibold min-h-11"
              >
                {pending === "escalate_case" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />}
                Escalate
              </button>
              <button
                type="button" disabled={!!pending}
                onClick={() => runAction("add_note")}
                className="px-3 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded-lg flex items-center justify-center gap-2 text-white text-sm font-semibold min-h-11"
              >
                {pending === "add_note" ? <Loader2 className="h-4 w-4 animate-spin" /> : <StickyNote className="h-4 w-4" />}
                Add Note
              </button>
              {view.status === "suspended" && (
                <button
                  type="button" disabled={!!pending}
                  onClick={() => runAction("unsuspend_user")}
                  className="col-span-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 disabled:opacity-50 rounded-lg flex items-center justify-center gap-2 text-emerald-300 text-sm font-semibold min-h-11"
                >
                  {pending === "unsuspend_user" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  Unsuspend Account
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500">All actions are recorded in the admin audit log.</p>
          </section>
        </div>
      </aside>
    </div>
  );
}