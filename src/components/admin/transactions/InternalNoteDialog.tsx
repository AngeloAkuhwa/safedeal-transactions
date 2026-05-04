import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

export type AdminNoteType = "note" | "escalation" | "risk" | "payment" | "dispute" | "payout";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactionCode: string;
  onSubmit: (note: string, noteType: AdminNoteType) => Promise<void>;
}

const TYPES: { value: AdminNoteType; label: string }[] = [
  { value: "note", label: "Note" },
  { value: "escalation", label: "Escalation" },
  { value: "risk", label: "Risk" },
  { value: "payment", label: "Payment" },
  { value: "dispute", label: "Dispute" },
  { value: "payout", label: "Payout" },
];

export function InternalNoteDialog({ open, onOpenChange, transactionCode, onSubmit }: Props) {
  const [note, setNote] = useState("");
  const [noteType, setNoteType] = useState<AdminNoteType>("note");
  const [submitting, setSubmitting] = useState(false);
  const trimmed = note.trim();
  const canSubmit = trimmed.length >= 1 && trimmed.length <= 2000 && !submitting;

  const close = (v: boolean) => {
    if (submitting) return;
    if (!v) { setNote(""); setNoteType("note"); }
    onOpenChange(v);
  };

  const handle = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onSubmit(trimmed, noteType);
      setNote(""); setNoteType("note");
      onOpenChange(false);
    } finally { setSubmitting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add internal note</DialogTitle>
          <DialogDescription>Internal note for {transactionCode}. Visible to admins only.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-foreground">Type</span>
            <select
              value={noteType}
              onChange={(e) => setNoteType(e.target.value as AdminNoteType)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/40"
            >
              {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-foreground">Note</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={2000}
              rows={4}
              placeholder="Visible to admins only…"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
            <span className="mt-1 block text-[11px] text-muted-foreground">{trimmed.length}/2000</span>
          </label>
        </div>
        <DialogFooter>
          <button type="button" onClick={() => close(false)} disabled={submitting}
            className="rounded-md border border-border bg-muted/60 px-3 py-2 text-sm text-foreground hover:bg-muted disabled:opacity-60">Cancel</button>
          <button type="button" onClick={handle} disabled={!canSubmit}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Save note
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}