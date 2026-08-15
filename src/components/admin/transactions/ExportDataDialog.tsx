import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Download } from "lucide-react";
import type { ExportTransactionOptions } from "@/services/admin-transaction-actions.service";

interface SectionDef { key: keyof Omit<ExportTransactionOptions, "reason">; label: string; description: string; defaultOn: boolean }

const SECTIONS: SectionDef[] = [
  { key: "include_summary", label: "Transaction summary", description: "Status, parties, totals, key timestamps", defaultOn: true },
  { key: "include_agreement", label: "Agreement summary", description: "Locked terms (no downloadable file)", defaultOn: true },
  { key: "include_payment_ledger", label: "Payment & escrow ledger", description: "Money movements and provider references", defaultOn: true },
  { key: "include_timeline", label: "Timeline events", description: "All recorded events on the transaction", defaultOn: true },
  { key: "include_dispute_summary", label: "Dispute summary", description: "Status, claim, response, resolution", defaultOn: true },
  { key: "include_evidence_metadata", label: "Evidence metadata", description: "Filenames, hashes, uploader (no raw files)", defaultOn: true },
  { key: "include_admin_notes", label: "Admin internal notes", description: "Private notes added by admins", defaultOn: false },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  transactionCode: string;
  onSubmit: (opts: ExportTransactionOptions) => Promise<void> | void;
}

export function ExportDataDialog({ open, onOpenChange, transactionCode, onSubmit }: Props) {
  const [sections, setSections] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(SECTIONS.map((s) => [s.key, s.defaultOn])),
  );
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const trimmed = reason.trim();
  const anySection = Object.values(sections).some(Boolean);
  const canSubmit = trimmed.length >= 8 && anySection && !submitting;

  const close = (v: boolean) => {
    if (submitting) return;
    if (!v) {
      setSections(Object.fromEntries(SECTIONS.map((s) => [s.key, s.defaultOn])));
      setReason("");
    }
    onOpenChange(v);
  };

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onSubmit({
        include_summary: !!sections.include_summary,
        include_agreement: !!sections.include_agreement,
        include_payment_ledger: !!sections.include_payment_ledger,
        include_timeline: !!sections.include_timeline,
        include_dispute_summary: !!sections.include_dispute_summary,
        include_evidence_metadata: !!sections.include_evidence_metadata,
        include_admin_notes: !!sections.include_admin_notes,
        reason: trimmed,
      });
      close(false);
    } finally { setSubmitting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Export transaction data</DialogTitle>
          <DialogDescription>
            Generate an audited admin export for #{transactionCode}. Raw evidence files and downloadable
            agreement files are not included.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-300">
            Exports may contain sensitive transaction information. This action is audited.
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {SECTIONS.map((s) => (
              <label key={s.key} className="flex items-start gap-2 rounded-md border border-border p-2 text-sm min-h-11">
                <input
                  type="checkbox"
                  checked={!!sections[s.key]}
                  onChange={(e) => setSections((p) => ({ ...p, [s.key]: e.target.checked }))}
                  className="mt-0.5 min-h-11 inline-flex items-center"
                />
                <span className="min-w-0">
                  <span className="block font-medium text-foreground">{s.label}</span>
                  <span className="block text-xs text-muted-foreground">{s.description}</span>
                </span>
              </label>
            ))}
          </div>
          <label className="block text-sm">
            <span className="mb-1 block">Reason for export (min 8 chars)</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Why are you generating this export?"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <span className="mt-1 block text-xs text-muted-foreground">{trimmed.length}/500</span>
          </label>
        </div>
        <DialogFooter>
          <button onClick={() => close(false)} disabled={submitting}
            className="rounded-md border border-border bg-muted/60 px-3 py-2 text-sm min-h-11">Cancel</button>
          <button onClick={submit} disabled={!canSubmit}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 min-h-11">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Generate export
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}