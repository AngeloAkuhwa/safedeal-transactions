import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ADMIN_SOLID } from "@/components/admin/palette";
import { Loader2 } from "lucide-react";

const REASONS = [
  "Dispute opened","Suspicious buyer activity","Suspicious seller activity",
  "Conflicting evidence","Payment risk","Delivery risk","Manual admin review","Other",
];
const SEVERITIES = ["low","medium","high","critical"] as const;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (payload: { reason: string; category: string; severity: typeof SEVERITIES[number]; note?: string }) => Promise<void> | void;
}

export function FreezeFundsDialog({ open, onOpenChange, onConfirm }: Props) {
  const [category, setCategory] = useState(REASONS[0]);
  const [otherReason, setOtherReason] = useState("");
  const [severity, setSeverity] = useState<typeof SEVERITIES[number]>("medium");
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const reasonText = category === "Other" ? otherReason.trim() : category;
  const canSubmit = reasonText.length >= 8 && confirmed && !submitting;

  const close = (v: boolean) => {
    if (submitting) return;
    if (!v) { setCategory(REASONS[0]); setOtherReason(""); setSeverity("medium"); setNote(""); setConfirmed(false); }
    onOpenChange(v);
  };

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onConfirm({ reason: reasonText, category, severity, note: note.trim() || undefined });
      close(false);
    } finally { setSubmitting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Freeze Funds</DialogTitle>
          <DialogDescription>
            Freezing funds pauses payout/refund movement while the transaction is reviewed.
            It does not move money out of SafeDeal escrow.
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
          <label className="block text-sm">
            <span className="mb-1 block">Severity</span>
            <select value={severity} onChange={(e) => setSeverity(e.target.value as any)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm min-h-11">
              {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block">Note (optional)</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={3}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1 min-h-11 inline-flex items-center" />
            <span>I understand this will pause payout and refund movement until reviewed.</span>
          </label>
        </div>
        <DialogFooter>
          <button onClick={() => close(false)} disabled={submitting}
            className="rounded-md border border-border bg-muted/60 px-3 py-2 text-sm min-h-11">Cancel</button>
          <button onClick={submit} disabled={!canSubmit}
            className={`inline-flex items-center gap-2 rounded-md ${ADMIN_SOLID.danger} px-3 py-2 text-sm font-medium disabled:opacity-60 min-h-11`}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Freeze Funds
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}