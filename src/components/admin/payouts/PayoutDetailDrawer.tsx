import { useState } from "react";
import { useNavigate } from "react-router";
import { Loader2, X, ExternalLink, AlertTriangle, ShieldCheck, ShieldOff, Check, Clock, RotateCcw } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { formatMoney } from "@/lib/format";
import { formatMoneyOrDash } from "@/lib/payment/money-format";
import { AdminCaseTimeline } from "@/components/admin/timeline/AdminCaseTimeline";
import * as payoutsApi from "@/services/admin-payouts.service";
import { getPayoutPill, getPayoutCaption, getAccountPresentation } from "@/lib/payout-presentation";

interface Props {
  open: boolean;
  payoutId: string | null;
  detail: payoutsApi.PayoutDetail | null;
  loading: boolean;
  onClose: () => void;
  onActionDone: () => void;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-400 text-sm">{label}</span>
      <span className="text-white text-sm text-right">{value}</span>
    </div>
  );
}

function statusPill(status: string, blocked: boolean) {
  const pill = getPayoutPill(status, blocked);
  const map: Record<typeof pill.tone, { cls: string; icon: JSX.Element }> = {
    emerald: { cls: "bg-emerald-500/20 border-emerald-500/30 text-emerald-400", icon: <Check className="h-3.5 w-3.5" /> },
    blue: { cls: "bg-blue-500/20 border-blue-500/30 text-blue-400", icon: <Loader2 className="h-3.5 w-3.5 animate-spin" /> },
    red: { cls: "bg-red-500/20 border-red-500/30 text-red-400", icon: <X className="h-3.5 w-3.5" /> },
    amber: { cls: "bg-amber-500/20 border-amber-500/30 text-amber-400", icon: <Clock className="h-3.5 w-3.5" /> },
    orange: { cls: "bg-orange-500/20 border-orange-500/30 text-orange-400", icon: <ShieldOff className="h-3.5 w-3.5" /> },
    slate: { cls: "bg-slate-500/20 border-slate-500/30 text-slate-300", icon: <Clock className="h-3.5 w-3.5" /> },
  };
  const t = map[pill.tone];
  return { cls: t.cls, icon: t.icon, label: pill.label };
}

function ChecklistItem({ gate }: { gate: payoutsApi.PayoutEligibilityGate }) {
  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border ${
      gate.pass ? "bg-emerald-500/5 border-emerald-500/20" : "bg-red-500/5 border-red-500/20"}`}>
      <div className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center shrink-0 border ${
        gate.pass ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                  : "bg-red-500/15 text-red-400 border-red-500/30"}`}>
        {gate.pass ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-white text-sm font-medium leading-snug">{gate.label}</p>
          <span className={`text-[10px] uppercase tracking-wide font-semibold shrink-0 ${
            gate.pass ? "text-emerald-400" : "text-red-400"}`}>
            {gate.pass ? "Pass" : "Action needed"}
          </span>
        </div>
        {gate.detail && <p className="text-slate-400 text-xs mt-1 leading-snug">{gate.detail}</p>}
      </div>
    </div>
  );
}

function SellerAvatar({ name, src }: { name?: string | null; src?: string | null }) {
  const initial = (name ?? "?").trim().charAt(0).toUpperCase() || "?";
  return src ? (
    <img src={src} alt={name ?? "Seller"} className="w-12 h-12 rounded-full object-cover border border-slate-700" />
  ) : (
    <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center text-white font-semibold text-base">
      {initial}
    </div>
  );
}

function fmtDateTime(iso?: string | null) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" }); }
  catch { return iso; }
}

const actionBtn = "px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg flex items-center gap-2 text-sm font-medium transition-all min-h-11 disabled:opacity-50 disabled:cursor-not-allowed";

export function PayoutDetailDrawer({ open, payoutId, detail, loading, onClose, onActionDone }: Props) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | "release">(null);
  const [reasonOpen, setReasonOpen] = useState<null | "block" | "unblock">(null);
  const [reason, setReason] = useState("");

  async function handleRelease() {
    if (!detail?.transaction || !detail.payout) return;
    setBusy("release");
    try {
      await payoutsApi.releasePayout({
        transaction_id: detail.transaction.id,
        payout_id: detail.payout.id,
      });
      toast({ title: "Payout release initiated" });
      onActionDone();
      setConfirm(null);
    } catch (e) {
      toast({ title: "Release failed", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(null); }
  }

  async function handleRetry() {
    if (!detail?.payout) return;
    setBusy("retry");
    try {
      await payoutsApi.retryPayout({ payout_id: detail.payout.id });
      toast({ title: "Payout retry initiated" });
      onActionDone();
    } catch (e) {
      toast({ title: "Retry failed", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(null); }
  }

  async function submitReason() {
    if (!detail?.transaction || !detail.payout || !reasonOpen) return;
    if (reason.trim().length < 8) {
      toast({ title: "Reason must be at least 8 characters", variant: "destructive" });
      return;
    }
    setBusy(reasonOpen);
    try {
      if (reasonOpen === "block") {
        await payoutsApi.blockPayout({ transaction_id: detail.transaction.id, payout_id: detail.payout.id, reason });
        toast({ title: "Payout blocked" });
      } else {
        await payoutsApi.unblockPayout({ transaction_id: detail.transaction.id, payout_id: detail.payout.id, reason });
        toast({ title: "Payout unblocked" });
      }
      setReasonOpen(null); setReason("");
      onActionDone();
    } catch (e) {
      toast({ title: "Action failed", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(null); }
  }

  const p = detail?.payout;
  const eligible = detail?.eligibility.eligible ?? false;
  const releaseEnabled = !!(detail?.payout && eligible && detail.payout.status === "awaiting_release" && !detail.payout.release_blocked);
  const retryEnabled = !!(detail?.payout && detail.payout.status === "failed" && detail.payout.retry_allowed);
  const caption = detail ? getPayoutCaption({
    status: detail.payout.status,
    releaseBlocked: !!detail.payout.release_blocked,
    payoutBlockedReason: detail.payout.payout_blocked_reason,
    failureReason: detail.payout.failure_reason,
  }) : null;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[480px] p-0 bg-slate-900 border-l border-slate-800 shadow-2xl overflow-y-auto overflow-x-hidden no-scrollbar">
        <div className="sticky top-0 z-10 bg-slate-900 border-b border-slate-800 p-6 flex items-center justify-between">
          <h3 className="text-white text-lg font-semibold">Payout Details</h3>
          <button
            onClick={onClose}
            className="w-11 h-11 bg-slate-800 hover:bg-slate-700 rounded-lg flex items-center justify-center text-slate-300 hover:text-white transition-all"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading || !detail ? (
          <div className="p-6 space-y-3">
            <Skeleton className="h-40 bg-slate-800/60" />
            <Skeleton className="h-32 bg-slate-800/60" />
            <Skeleton className="h-32 bg-slate-800/60" />
          </div>
        ) : (
          (() => {
            const pill = statusPill(p!.status, p!.release_blocked);
            const gates = detail.eligibility.gates;
            const passed = gates.filter((g) => g.pass).length;
            const total = gates.length;
            const timelineItems = (detail.timeline && detail.timeline.length > 0)
              ? detail.timeline
              : (detail.events ?? []).map((e: any) => ({
                  id: `evt-${e.id}`, at: e.created_at, type: "event",
                  title: String(e.event_type).replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
                  description: e.event_data?.summary ?? e.event_data?.reason ?? null,
                  actorType: e.actor_role, actorName: null, severity: null, icon: "activity",
                }));
            return (
            <div className="p-6 space-y-6">
              {/* Hero amount card */}
              <div className="bg-slate-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-slate-400 text-sm">Payout ID</span>
                  <span className="text-white font-semibold text-sm font-mono truncate max-w-[240px]">{detail.transaction?.code ?? p!.id}</span>
                </div>
                <div className="flex items-center justify-center py-4">
                  <div className="text-center">
                    <p className="text-slate-400 text-sm mb-2">Amount</p>
                    <p className="text-white text-4xl font-bold">{formatMoneyOrDash(p!.amount, p!.currency)}</p>
                    <p className="text-slate-400 text-sm mt-1">{detail.seller?.name ?? "Seller"}</p>
                  </div>
                </div>
                <div className="flex items-center justify-center">
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm font-semibold ${pill.cls}`}>
                    {pill.icon}
                    {pill.label}
                  </span>
                </div>
                {caption && (
                  <p className={`mt-3 text-xs text-center flex items-center justify-center gap-1.5 ${
                    caption.tone === "red" ? "text-red-400"
                    : caption.tone === "emerald" ? "text-emerald-400"
                    : caption.tone === "blue" ? "text-blue-400"
                    : "text-slate-400"
                  }`}>
                    {caption.tone === "red" && <AlertTriangle className="h-3.5 w-3.5" />}
                    {caption.text}
                  </p>
                )}
              </div>

              {/* Seller information */}
              <div className="space-y-3">
                <h4 className="text-white font-semibold text-sm">Seller Information</h4>
                <div className="bg-slate-800 rounded-lg p-4 flex items-center gap-3">
                  <SellerAvatar name={detail.seller?.name} src={detail.seller?.avatar_url} />
                  <div className="min-w-0">
                    <p className="text-white text-sm font-medium truncate">{detail.seller?.name ?? "Unknown seller"}</p>
                    <p className="text-slate-400 text-xs truncate">{detail.seller?.email ?? "—"}</p>
                  </div>
                </div>
              </div>

              {/* Eligibility */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-white font-semibold text-sm">Eligibility Checklist</h4>
                  <span className={`text-xs font-semibold ${detail.eligibility.eligible ? "text-emerald-400" : "text-amber-400"}`}>
                    {passed}/{total} ready
                  </span>
                </div>
                <p className="text-slate-400 text-xs">Live pre-release audit pulled from the database. Failing items must be cleared before release.</p>
                <div className="space-y-2">
                  {gates.map((g) => <ChecklistItem key={g.key} gate={g} />)}
                </div>
              </div>

              {/* Pricing */}
              <div className="space-y-3">
                <h4 className="text-white font-semibold text-sm">Pricing breakdown</h4>
                <div className="bg-slate-800 rounded-lg p-4 space-y-2">
                  <Row label="Item Total" value={formatMoneyOrDash(detail.pricing.item_total, detail.pricing.currency)} />
                  <Row label="Protection Fee" value={formatMoneyOrDash(detail.pricing.protection_fee, detail.pricing.currency)} />
                  <Row label="Payment Processing Fee" value={formatMoneyOrDash(detail.pricing.payment_processing_fee, detail.pricing.currency)} />
                  <div className="border-t border-slate-700 my-2" />
                  <Row label="Total Charged" value={
                    <span className="font-semibold text-white">
                      {formatMoneyOrDash(detail.pricing.total_charged, detail.pricing.currency)}
                    </span>
                  } />
                  <Row label="Seller Payout" value={<span className="font-semibold text-emerald-400">{formatMoneyOrDash(detail.pricing.seller_payout, detail.pricing.currency)}</span>} />
                  {detail.pricing.release_amount_mismatch && (
                    <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5">
                      <p className="text-amber-300 text-xs font-semibold">Release amount mismatch</p>
                      <p className="text-amber-200/80 text-[11px] mt-1">
                        Agreement snapshot says{" "}
                        {detail.pricing.seller_payout != null
                          ? formatMoneyOrDash(detail.pricing.seller_payout, detail.pricing.currency)
                          : "an amount that is not recorded"}{" "}
                        but the payout record holds{" "}
                        {detail.pricing.recorded_payout_amount != null
                          ? formatMoneyOrDash(detail.pricing.recorded_payout_amount, detail.pricing.currency)
                          : "no recorded amount"}
                        . The snapshot is authoritative — reconcile before releasing.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Account */}
              <div className="space-y-3">
                <h4 className="text-white font-semibold text-sm">Seller payout account</h4>
                {detail.payout_account ? (
                  (() => {
                    const ap = getAccountPresentation(detail.payout_account);
                    return (
                  <div className="bg-slate-800 rounded-lg p-4 space-y-2">
                    <Row label="Bank" value={detail.payout_account.bank_name ?? "—"} />
                    <Row label="Account" value={detail.payout_account.masked_account ?? "—"} />
                    <Row label="Account name" value={detail.payout_account.account_name ?? "—"} />
                    <Row label="Verification" value={
                      <span className={ap.state === "verified_ready" || ap.state === "verified_no_recipient" ? "text-emerald-400" : "text-amber-400"}>
                        {ap.drawerVerificationLabel}
                      </span>
                    } />
                    <Row label="Recipient code" value={
                      ap.drawerRecipientPresent
                        ? <span className="inline-flex items-center gap-1 text-emerald-400"><ShieldCheck className="h-3.5 w-3.5" />present</span>
                        : <span className="text-red-400">missing</span>
                    } />
                  </div>
                    );
                  })()
                ) : <p className="text-sm text-slate-400">No payout account on file.</p>}
              </div>

              {/* Transaction details */}
              <div className="space-y-3">
                <h4 className="text-white font-semibold text-sm">Transaction Details</h4>
                <div className="bg-slate-800 rounded-lg p-4 space-y-2">
                  <Row label="Code" value={<span className="font-mono text-xs">{detail.transaction?.code ?? "—"}</span>} />
                  <Row label="Item" value={<span className="truncate max-w-[220px] inline-block">{detail.transaction?.item_title ?? "—"}</span>} />
                  <Row label="Status" value={detail.transaction?.status ?? "—"} />
                  <Row label="Money status" value={detail.transaction?.money_status ?? "—"} />
                  <Row label="Created" value={fmtDateTime(detail.transaction?.created_at)} />
                </div>
              </div>

              {/* Payout history */}
              <div className="space-y-3">
                <h4 className="text-white font-semibold text-sm">Payout History</h4>
                <div className="bg-slate-800 rounded-lg p-4 space-y-2">
                  <Row label="Queued" value={fmtDateTime(p!.entered_queue_at)} />
                  <Row label="Initiated" value={fmtDateTime(p!.initiated_at)} />
                  <Row label="Released" value={fmtDateTime(p!.released_at)} />
                  <Row label="Attempts" value={String(p!.failed_attempt_count ?? 0)} />
                  {p!.failure_reason && <Row label="Failure reason" value={<span className="text-red-400">{p!.failure_reason}</span>} />}
                  {p!.provider_reference && <Row label="Provider ref" value={<span className="font-mono text-xs">{p!.provider_reference}</span>} />}
                </div>
              </div>

              {/* Linked */}
              <div className="space-y-3">
                <h4 className="text-white font-semibold text-sm">Linked records</h4>
                <div className="flex flex-col gap-2">
                  {detail.transaction?.id && (
                    <button className={`${actionBtn} justify-between min-h-11`} onClick={() => navigate(`/admin/transactions/${detail.transaction!.id}`)}>
                      Open Transaction <ExternalLink className="h-4 w-4" />
                    </button>
                  )}
                  {detail.dispute && (
                    <button className={`${actionBtn} justify-between min-h-11`} onClick={() => navigate(`/admin/disputes/${detail.dispute.id}`)}>
                      Open Dispute <ExternalLink className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Complete Transaction Timeline */}
              <div className="space-y-3">
                <div>
                  <h4 className="text-white font-semibold text-sm">Complete Transaction Timeline</h4>
                  <p className="text-slate-400 text-xs mt-0.5">All events, status changes, and interventions</p>
                </div>
                <div className="bg-slate-800 rounded-lg p-4 max-h-96 overflow-y-auto no-scrollbar">
                  {timelineItems.length === 0 ? (
                    <p className="text-xs text-slate-400">No events recorded.</p>
                  ) : (
                    <AdminCaseTimeline
                      items={timelineItems as any}
                      disputeStatus={detail.dispute?.status ?? null}
                      resolvedAt={detail.dispute?.resolved_at ?? null}
                    />
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-3 pb-4">
                <h4 className="text-white font-semibold text-sm">Actions</h4>
                <div className="flex flex-col gap-2">
                  <button
                    className={
                      releaseEnabled
                        ? "px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center justify-center gap-2 text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed min-h-11"
                        : "px-4 py-2 bg-slate-800 text-slate-500 border border-slate-700 rounded-lg flex items-center justify-center gap-2 text-sm font-medium cursor-not-allowed"
                    }
                    disabled={!releaseEnabled || busy === "release"}
                    onClick={() => setConfirm("release")}
                  >
                    {busy === "release" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Release Payout
                  </button>
                  <button
                    className={
                      retryEnabled
                        ? "px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg flex items-center gap-2 text-sm font-medium transition-all justify-center min-h-11"
                        : "px-4 py-2 bg-slate-800/60 text-slate-500 border border-slate-800 rounded-lg flex items-center gap-2 text-sm font-medium cursor-not-allowed justify-center"
                    }
                    disabled={!retryEnabled || busy === "retry"}
                    onClick={handleRetry}
                  >
                    {busy === "retry" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                    Retry Payout
                  </button>
                  {p!.release_blocked ? (
                    <button className={actionBtn} onClick={() => { setReasonOpen("unblock"); setReason(""); }}>
                      <ShieldCheck className="h-4 w-4" /> Unblock Payout
                    </button>
                  ) : (p!.status === "awaiting_release" || p!.status === "failed") ? (
                    <button className={actionBtn} onClick={() => { setReasonOpen("block"); setReason(""); }}>
                      <ShieldOff className="h-4 w-4" /> Block Payout
                    </button>
                  ) : null}
                  {detail.transaction?.id && (
                    <button className={actionBtn} onClick={() => navigate(`/admin/transactions/${detail.transaction!.id}`)}>
                      <ExternalLink className="h-4 w-4" /> Open Transaction
                    </button>
                  )}
                </div>
                {!releaseEnabled && p!.status === "awaiting_release" && (
                  <p className="text-xs text-slate-500 mt-1">Release is disabled — resolve the failing gate above before retrying.</p>
                )}
                {p!.status === "failed" && !retryEnabled && (
                  <p className="text-xs text-slate-500 mt-1">Retry is disabled — the bank account must be updated or re-verified before retry.</p>
                )}
              </div>
            </div>
            );
          })()
        )}
      </SheetContent>

      {/* Confirm Release */}
      <Dialog open={confirm === "release"} onOpenChange={(v) => !v && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Release payout to seller?</DialogTitle>
            <DialogDescription>
              This initiates a real Paystack transfer. The action is idempotent — clicking again will not duplicate the payment.
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-1 text-sm py-2">
              <Row label="Seller" value={detail.seller?.name ?? "—"} />
              <Row label="Bank" value={`${detail.payout_account?.bank_name ?? "—"} ${detail.payout_account?.masked_account ?? ""}`} />
              <Row label="Amount" value={formatMoneyOrDash(detail.payout.amount, detail.payout.currency)} />
              <Row label="Transaction" value={detail.transaction?.code} />
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleRelease} disabled={busy === "release"}>
              {busy === "release" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Release"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Block / Unblock reason */}
      <Dialog open={reasonOpen !== null} onOpenChange={(v) => !v && setReasonOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{reasonOpen === "block" ? "Block this payout" : "Unblock this payout"}</DialogTitle>
            <DialogDescription>Provide a reason (minimum 8 characters). This will be written to the audit log.</DialogDescription>
          </DialogHeader>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason…" rows={4} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReasonOpen(null)}>Cancel</Button>
            <Button onClick={submitReason} disabled={busy !== null}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}