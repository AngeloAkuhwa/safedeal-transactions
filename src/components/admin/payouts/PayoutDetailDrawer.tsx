import { useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { PayoutEligibilityChecklist } from "./PayoutEligibilityChecklist";
import * as payoutsApi from "@/services/admin-payouts.service";

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
  if (blocked) return { cls: "bg-orange-500/20 border-orange-500/30 text-orange-400", icon: <ShieldOff className="h-3.5 w-3.5" />, label: "Blocked" };
  switch (status) {
    case "released":
    case "paid":
      return { cls: "bg-emerald-500/20 border-emerald-500/30 text-emerald-400", icon: <Check className="h-3.5 w-3.5" />, label: "Released" };
    case "processing":
    case "initiated":
      return { cls: "bg-blue-500/20 border-blue-500/30 text-blue-400", icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />, label: "Processing" };
    case "failed":
      return { cls: "bg-red-500/20 border-red-500/30 text-red-400", icon: <X className="h-3.5 w-3.5" />, label: "Failed" };
    case "awaiting_release":
    case "queued":
    default:
      return { cls: "bg-amber-500/20 border-amber-500/30 text-amber-400", icon: <Clock className="h-3.5 w-3.5" />, label: status.replace(/_/g, " ") };
  }
}

const actionBtn = "px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg flex items-center gap-2 text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed";

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

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[480px] p-0 bg-slate-900 border-l border-slate-800 shadow-2xl overflow-y-auto overflow-x-hidden no-scrollbar">
        <div className="sticky top-0 z-10 bg-slate-900 border-b border-slate-800 p-6 flex items-center justify-between">
          <div className="min-w-0">
            <div className="font-mono text-xs text-slate-500 truncate mb-0.5">{p?.id ?? payoutId}</div>
            <h3 className="text-white text-lg font-semibold">Payout Details</h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 bg-slate-800 hover:bg-slate-700 rounded-lg flex items-center justify-center text-slate-300 hover:text-white transition-all"
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
                    <p className="text-white text-4xl font-bold">{formatMoney(p!.amount, p!.currency)}</p>
                    <p className="text-slate-400 text-sm mt-1">{detail.seller?.name ?? "Seller"}</p>
                  </div>
                </div>
                <div className="flex items-center justify-center">
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm font-semibold ${pill.cls}`}>
                    {pill.icon}
                    {pill.label}
                  </span>
                </div>
                {p!.failure_reason && (
                  <p className="mt-3 text-xs text-red-400 text-center flex items-center justify-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" />{p!.failure_reason}
                  </p>
                )}
                {p!.payout_blocked_reason && (
                  <p className="mt-3 text-xs text-orange-400 text-center flex items-center justify-center gap-1.5">
                    <ShieldOff className="h-3.5 w-3.5" />{p!.payout_blocked_reason}
                  </p>
                )}
              </div>

              {/* Eligibility */}
              <div className="space-y-3">
                <h4 className="text-white font-semibold text-sm">Eligibility checklist</h4>
                <PayoutEligibilityChecklist gates={detail.eligibility.gates} />
              </div>

              {/* Pricing */}
              <div className="space-y-3">
                <h4 className="text-white font-semibold text-sm">Pricing breakdown</h4>
                <div className="bg-slate-800 rounded-lg p-4 space-y-2">
                  <Row label="Item Total" value={formatMoney(detail.pricing.item_total, detail.pricing.currency)} />
                  <Row label="Protection Fee" value={formatMoney(detail.pricing.protection_fee, detail.pricing.currency)} />
                  <Row label="Payment Processing Fee" value={formatMoney(detail.pricing.payment_processing_fee, detail.pricing.currency)} />
                  <div className="border-t border-slate-700 my-2" />
                  <Row label="Total Charged" value={<span className="font-semibold text-white">{formatMoney(detail.pricing.total_charged, detail.pricing.currency)}</span>} />
                  <Row label="Seller Payout" value={<span className="font-semibold text-emerald-400">{formatMoney(detail.pricing.seller_payout, detail.pricing.currency)}</span>} />
                </div>
              </div>

              {/* Account */}
              <div className="space-y-3">
                <h4 className="text-white font-semibold text-sm">Seller payout account</h4>
                {detail.payout_account ? (
                  <div className="bg-slate-800 rounded-lg p-4 space-y-2">
                    <Row label="Bank" value={detail.payout_account.bank_name ?? "—"} />
                    <Row label="Account" value={detail.payout_account.masked_account ?? "—"} />
                    <Row label="Account name" value={detail.payout_account.account_name ?? "—"} />
                    <Row label="Verification" value={
                      <span className={detail.payout_account.verification_status === "verified" ? "text-emerald-400" : "text-amber-400"}>
                        {detail.payout_account.verification_status ?? "unverified"}
                      </span>
                    } />
                    <Row label="Recipient code" value={
                      detail.payout_account.has_recipient_code
                        ? <span className="inline-flex items-center gap-1 text-emerald-400"><ShieldCheck className="h-3.5 w-3.5" />present</span>
                        : <span className="text-red-400">missing</span>
                    } />
                  </div>
                ) : <p className="text-sm text-slate-400">No payout account on file.</p>}
              </div>

              {/* Linked */}
              <div className="space-y-3">
                <h4 className="text-white font-semibold text-sm">Linked records</h4>
                <div className="flex flex-col gap-2">
                  <button className={`${actionBtn} justify-between`} onClick={() => navigate(`/admin/transactions/${detail.transaction?.id}`)}>
                    Open Transaction <ExternalLink className="h-4 w-4" />
                  </button>
                  {detail.dispute && (
                    <button className={`${actionBtn} justify-between`} onClick={() => navigate(`/admin/disputes/${detail.dispute.id}`)}>
                      Open Dispute <ExternalLink className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Timeline */}
              <div className="space-y-3">
                <h4 className="text-white font-semibold text-sm">Timeline</h4>
                <div className="bg-slate-800 rounded-lg p-4">
                  <ul className="space-y-3 max-h-72 overflow-y-auto pr-1 no-scrollbar">
                    {detail.events.length === 0 && <li className="text-xs text-slate-400">No events recorded.</li>}
                    {detail.events.map((e: any) => (
                      <li key={e.id} className="border-l-2 border-slate-700 pl-3">
                        <div className="text-white text-sm font-medium">{e.event_type}</div>
                        <div className="text-slate-400 text-xs">{new Date(e.created_at).toLocaleString()}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-3 pb-4">
                <h4 className="text-white font-semibold text-sm">Actions</h4>
                <div className="flex flex-col gap-2">
                  <button
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center justify-center gap-2 text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={!eligible || busy === "release"}
                    onClick={() => setConfirm("release")}
                  >
                    {busy === "release" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Release Payout
                  </button>
                  <button
                    className={actionBtn}
                    disabled={!(p!.status === "failed" && p!.retry_allowed) || busy === "retry"}
                    onClick={handleRetry}
                  >
                    {busy === "retry" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                    Retry Payout
                  </button>
                  {p!.release_blocked ? (
                    <button className={actionBtn} onClick={() => { setReasonOpen("unblock"); setReason(""); }}>
                      <ShieldCheck className="h-4 w-4" /> Unblock Payout
                    </button>
                  ) : (
                    <button className={actionBtn} onClick={() => { setReasonOpen("block"); setReason(""); }}>
                      <ShieldOff className="h-4 w-4" /> Block Payout
                    </button>
                  )}
                  <button className={actionBtn} onClick={() => navigate(`/admin/transactions/${detail.transaction?.id}`)}>
                    <ExternalLink className="h-4 w-4" /> Open Transaction
                  </button>
                </div>
                {!eligible && (
                  <p className="text-xs text-slate-500 mt-1">Release is disabled — resolve the failing gate above before retrying.</p>
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
              <Row label="Amount" value={formatMoney(detail.payout.amount, detail.payout.currency)} />
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