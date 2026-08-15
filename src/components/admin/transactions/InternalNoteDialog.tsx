import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Lock } from "lucide-react";
import type { NoteCategory } from "@/services/admin-transaction-actions.service";

const CATEGORIES: { value: NoteCategory; label: string }[] = [
  { value: "general", label: "General" },
  { value: "payment", label: "Payment" },
  { value: "escrow", label: "Escrow" },
  { value: "dispute", label: "Dispute" },
  { value: "delivery", label: "Delivery" },
  { value: "evidence", label: "Evidence" },
  { value: "payout", label: "Payout" },
  { value: "risk", label: "Risk" },
];
const FOLLOW_UP_PRIORITIES = ["low", "medium", "high", "urgent"] as const;

export interface InternalNotePayload {
  note: string;
  category: NoteCategory;
  follow_up_required?: boolean;
  follow_up_priority?: typeof FOLLOW_UP_PRIORITIES[number];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactionCode: string;
  onSubmit: (payload: InternalNotePayload) => Promise<void> | void;
}

export function InternalNoteDialog({ open, onOpenChange, transactionCode, onSubmit }: Props) {
  const [note, setNote] = useState("");
  const [category, setCategory] = useState<NoteCategory>("general");
  const [followUp, setFollowUp] = useState(false);
  const [followUpPriority, setFollowUpPriority] = useState<typeof FOLLOW_UP_PRIORITIES[number]>("medium");
  const [submitting, setSubmitting] = useState(false);
  const trimmed = note.trim();
  const canSubmit = trimmed.length >= 5 && trimmed.length <= 2000 && !submitting;

  const close = (v: boolean) => {
    if (submitting) return;
    if (!v) { setNote(""); setCategory("general"); setFollowUp(false); setFollowUpPriority("medium"); }
    onOpenChange(v);
  };

  const handle = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onSubmit({
        note: trimmed,
        category,
        follow_up_required: followUp,
        follow_up_priority: followUp ? followUpPriority : undefined,
      });
      close(false);
    } finally { setSubmitting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-4 w-4" /> Add internal note
          </DialogTitle>
          <DialogDescription>Internal note for #{transactionCode}. Visible to admins only.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-foreground">Category</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as NoteCategory)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground min-h-11"
            >
              {CATEGORIES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-foreground">Note (5–2000 chars)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={2000}
              rows={4}
              placeholder="Visible to admins only…"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
            />
            <span className="mt-1 block text-[11px] text-muted-foreground">{trimmed.length}/2000</span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={followUp} onChange={(e) => setFollowUp(e.target.checked)} className="mt-1 min-h-11 inline-flex items-center" />
            <span>Requires follow-up (flags transaction for release review)</span>
          </label>
          {followUp && (
            <label className="block text-sm">
              <span className="mb-1 block">Follow-up priority</span>
              <select value={followUpPriority} onChange={(e) => setFollowUpPriority(e.target.value as typeof FOLLOW_UP_PRIORITIES[number])}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm min-h-11">
                {FOLLOW_UP_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
          )}
        </div>
        <DialogFooter>
          <button type="button" onClick={() => close(false)} disabled={submitting}
            className="rounded-md border border-border bg-muted/60 px-3 py-2 text-sm text-foreground hover:bg-muted disabled:opacity-60 min-h-11">Cancel</button>
          <button type="button" onClick={handle} disabled={!canSubmit}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 min-h-11">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Save note
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}