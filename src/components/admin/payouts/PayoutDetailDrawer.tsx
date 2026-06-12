import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, X, ExternalLink, AlertTriangle, ShieldCheck, ShieldOff } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { formatMoney } from "@/lib/format";
import { PayoutStatusPill } from "./PayoutStatusPill";
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
    <div className="flex justify-between text-sm py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground text-right">{value}</span>
    </div>
  );
}

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
      <SheetContent side="right" className="w-full sm:max-w-[480px] p-0 bg-card border-l border-border overflow-y-auto">
        <div className="sticky top-0 z-10 bg-card border-b border-border px-4 py-3 flex items-center justify-between">
          <div className="min-w-0">
            <div className="font-mono text-xs text-muted-foreground truncate">{p?.id ?? payoutId}</div>
            <div className="font-semibold text-foreground">Payout details</div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        {loading || !detail ? (
          <div className="p-4 space-y-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
        ) : (
          <div className="p-4 space-y-5">
            {/* Header */}
            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <div className="flex items-center justify-between gap-2 mb-2">
                <PayoutStatusPill row={{ status: p!.status, release_blocked: p!.release_blocked, transaction: detail.transaction as any }} />
                {detail.pricing.protection_fee_capped && (
                  <Badge variant="outline" className="text-xs">Protection capped @ ₦2,500</Badge>
                )}
              </div>
              <div className="text-2xl font-bold text-foreground">{formatMoney(p!.amount, p!.currency)}</div>
              <div className="text-sm text-muted-foreground mt-1">{detail.seller?.name ?? "Seller"}</div>
              <div className="text-xs text-muted-foreground font-mono mt-0.5">{detail.transaction?.code}</div>
              {p!.failure_reason && (
                <div className="mt-2 text-xs text-red-400 flex items-start gap-2"><AlertTriangle className="h-4 w-4 mt-0.5" />{p!.failure_reason}</div>
              )}
              {p!.payout_blocked_reason && (
                <div className="mt-2 text-xs text-red-400 flex items-start gap-2"><ShieldOff className="h-4 w-4 mt-0.5" />{p!.payout_blocked_reason}</div>
              )}
            </div>

            {/* Eligibility */}
            <section>
              <h3 className="text-sm font-semibold text-foreground mb-2">Eligibility checklist</h3>
              <PayoutEligibilityChecklist gates={detail.eligibility.gates} />
            </section>
            <Separator />

            {/* Pricing */}
            <section>
              <h3 className="text-sm font-semibold text-foreground mb-2">Pricing breakdown</h3>
              <Row label="Item Total" value={formatMoney(detail.pricing.item_total, detail.pricing.currency)} />
              <Row label="Protection Fee" value={formatMoney(detail.pricing.protection_fee, detail.pricing.currency)} />
              <Row label="Payment Processing Fee" value={formatMoney(detail.pricing.payment_processing_fee, detail.pricing.currency)} />
              <Separator className="my-2" />
              <Row label="Total Charged" value={<span className="font-bold">{formatMoney(detail.pricing.total_charged, detail.pricing.currency)}</span>} />
              <Row label="Seller Payout" value={<span className="font-bold text-emerald-500">{formatMoney(detail.pricing.seller_payout, detail.pricing.currency)}</span>} />
            </section>
            <Separator />

            {/* Account */}
            <section>
              <h3 className="text-sm font-semibold text-foreground mb-2">Seller payout account</h3>
              {detail.payout_account ? (
                <div className="space-y-1">
                  <Row label="Bank" value={detail.payout_account.bank_name ?? "—"} />
                  <Row label="Account" value={detail.payout_account.masked_account ?? "—"} />
                  <Row label="Account name" value={detail.payout_account.account_name ?? "—"} />
                  <Row label="Verification" value={
                    <span className={detail.payout_account.verification_status === "verified" ? "text-emerald-500" : "text-amber-500"}>
                      {detail.payout_account.verification_status ?? "unverified"}
                    </span>
                  } />
                  <Row label="Recipient code" value={
                    detail.payout_account.has_recipient_code
                      ? <span className="inline-flex items-center gap-1 text-emerald-500"><ShieldCheck className="h-3 w-3" />present</span>
                      : <span className="text-red-400">missing</span>
                  } />
                </div>
              ) : <p className="text-sm text-muted-foreground">No payout account on file.</p>}
            </section>
            <Separator />

            {/* Linked */}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground mb-1">Linked records</h3>
              <Button variant="outline" size="sm" className="w-full justify-between"
                onClick={() => navigate(`/admin/transactions/${detail.transaction?.id}`)}>
                Open Transaction <ExternalLink className="h-4 w-4" />
              </Button>
              {detail.dispute && (
                <Button variant="outline" size="sm" className="w-full justify-between"
                  onClick={() => navigate(`/admin/disputes/${detail.dispute.id}`)}>
                  Open Dispute <ExternalLink className="h-4 w-4" />
                </Button>
              )}
            </section>
            <Separator />

            {/* Timeline */}
            <section>
              <h3 className="text-sm font-semibold text-foreground mb-2">Timeline</h3>
              <ul className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {detail.events.length === 0 && <li className="text-xs text-muted-foreground">No events recorded.</li>}
                {detail.events.map((e: any) => (
                  <li key={e.id} className="text-xs border-l-2 border-border pl-3 py-1">
                    <div className="font-medium text-foreground">{e.event_type}</div>
                    <div className="text-muted-foreground">{new Date(e.created_at).toLocaleString()}</div>
                  </li>
                ))}
              </ul>
            </section>
            <Separator />

            {/* Actions */}
            <section className="space-y-2 pb-6">
              <h3 className="text-sm font-semibold text-foreground">Actions</h3>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={!eligible || busy === "release"}
                  onClick={() => setConfirm("release")}
                >
                  {busy === "release" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Release"}
                </Button>
                <Button variant="outline"
                  disabled={!(p!.status === "failed" && p!.retry_allowed) || busy === "retry"}
                  onClick={handleRetry}>
                  {busy === "retry" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Retry"}
                </Button>
                {p!.release_blocked
                  ? <Button variant="outline" onClick={() => { setReasonOpen("unblock"); setReason(""); }}>Unblock</Button>
                  : <Button variant="outline" onClick={() => { setReasonOpen("block"); setReason(""); }}>Block</Button>}
                <Button variant="outline" onClick={() => navigate(`/admin/transactions/${detail.transaction?.id}`)}>Open Transaction</Button>
              </div>
              {!eligible && (
                <p className="text-xs text-muted-foreground">Release is disabled — resolve the failing gate above before retrying.</p>
              )}
            </section>
          </div>
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