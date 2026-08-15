import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

const REASONS = ["Dispute resolved","Risk cleared","Evidence reviewed","False flag","Manual correction","Other"];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  bothPartiesConfirmed: boolean;
  hasActiveDispute: boolean;
  onConfirm: (p: { reason: string; target_money_status: "funds_held_in_escrow"|"funds_pending_release"; note?: string; acknowledge_open_dispute?: boolean; notify_parties?: boolean }) => Promise<void> | void;
}

export function UnfreezeFundsDialog({ open, onOpenChange, bothPartiesConfirmed, hasActiveDispute, onConfirm }: Props) {
  const [category, setCategory] = useState(REASONS[0]);
  const [otherReason, setOtherReason] = useState("");
  const [target, setTarget] = useState<"funds_held_in_escrow"|"funds_pending_release">(
    bothPartiesConfirmed ? "funds_pending_release" : "funds_held_in_escrow"
  );
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [ack, setAck] = useState(false);
  const [notifyParties, setNotifyParties] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setTarget(bothPartiesConfirmed ? "funds_pending_release" : "funds_held_in_escrow");
  }, [bothPartiesConfirmed, open]);

  const reasonText = category === "Other" ? otherReason.trim() : category;
  const needsAck = hasActiveDispute && target === "funds_pending_release";
  const canSubmit = reasonText.length >= 8 && confirmed && (!needsAck || ack) && !submitting;

  const close = (v: boolean) => {
    if (submitting) return;
    if (!v) { setCategory(REASONS[0]); setOtherReason(""); setNote(""); setConfirmed(false); setAck(false); setNotifyParties(false); }
    onOpenChange(v);
  };

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onConfirm({
        reason: reasonText,
        target_money_status: target,
        note: note.trim() || undefined,
        acknowledge_open_dispute: needsAck ? ack : undefined,
        notify_parties: notifyParties || undefined,
      });
      close(false);
    } finally { setSubmitting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Unfreeze Funds</DialogTitle>
          <DialogDescription>
            Unfreezing removes the manual hold. It does not release funds to the seller.
            Release still follows the normal SafeDeal release process.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block">Reason</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm min-h-11">
              {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          {category === "Other" && (
            <input value={otherReason} onChange={(e) => setOtherReason(e.target.value)}
              placeholder="Describe the reason (min 8 chars)"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm min-h-11" />
          )}
          <fieldset className="space-y-1.5">
            <legend className="text-sm mb-1">Target state</legend>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" checked={target === "funds_held_in_escrow"} onChange={() => setTarget("funds_held_in_escrow")} className="h-5 w-5 relative before:absolute before:-inset-3 before:content-['']" />
              Held in Escrow
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" checked={target === "funds_pending_release"} onChange={() => setTarget("funds_pending_release")} className="h-5 w-5 relative before:absolute before:-inset-3 before:content-['']" />
              Pending Release
            </label>
          </fieldset>
          {needsAck && (
            <div className="rounded-md border border-orange-500/40 bg-orange-500/10 p-3 text-xs text-orange-300">
              <p className="font-semibold mb-1">Active dispute on this transaction</p>
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 h-5 w-5 relative before:absolute before:-inset-3 before:content-['']" />
                <span>I acknowledge the open dispute and still want to move funds to Pending Release.</span>
              </label>
            </div>
          )}
          {hasActiveDispute && target === "funds_held_in_escrow" && (
            <div className="rounded-md border border-blue-500/40 bg-blue-500/10 p-3 text-xs text-blue-300">
              This dispute is still open. Unfreezing to held escrow removes the manual freeze but keeps funds protected. The dispute remains open and must still be resolved separately.
            </div>
          )}
          <label className="block text-sm">
            <span className="mb-1 block">Note (optional)</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={3}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1 min-h-11 inline-flex items-center" />
            <span>I understand this does not release funds.</span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={notifyParties} onChange={(e) => setNotifyParties(e.target.checked)} className="mt-1 min-h-11 inline-flex items-center" />
            <span>Notify buyer and seller with a neutral status update</span>
          </label>
        </div>
        <DialogFooter>
          <button onClick={() => close(false)} disabled={submitting}
            className="rounded-md border border-border bg-muted/60 px-3 py-2 text-sm min-h-11">Cancel</button>
          <button onClick={submit} disabled={!canSubmit}
            className="inline-flex items-center gap-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 text-sm font-medium disabled:opacity-60 min-h-11">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Unfreeze
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}