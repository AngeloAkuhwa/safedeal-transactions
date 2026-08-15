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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  reasonMin?: number;
  reasonMax?: number;
  confirmLabel: string;
  confirmTone?: "primary" | "danger";
  /** Optional extra confirmation phrase user must type (e.g. "FREEZE"). */
  typeToConfirm?: string;
  onConfirm: (reason: string) => Promise<void> | void;
}

export function ActionConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  reasonLabel = "Reason",
  reasonPlaceholder = "Explain why this action is being taken…",
  reasonMin = 8,
  reasonMax = 1000,
  confirmLabel,
  confirmTone = "primary",
  typeToConfirm,
  onConfirm,
}: Props) {
  const [reason, setReason] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const trimmed = reason.trim();
  const reasonOk = trimmed.length >= reasonMin && trimmed.length <= reasonMax;
  const confirmOk = !typeToConfirm || confirmText.trim().toUpperCase() === typeToConfirm.toUpperCase();
  const canSubmit = reasonOk && confirmOk && !submitting;

  const handleClose = (next: boolean) => {
    if (submitting) return;
    if (!next) {
      setReason("");
      setConfirmText("");
    }
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onConfirm(trimmed);
      setReason("");
      setConfirmText("");
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  const btnCls =
    confirmTone === "danger"
      ? "bg-red-600 hover:bg-red-500 text-white"
      : "bg-blue-600 hover:bg-blue-500 text-white";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-foreground">{reasonLabel}</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={reasonMax}
              placeholder={reasonPlaceholder}
              rows={4}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/40"
            />
            <span className="mt-1 block text-[12px] text-muted-foreground">
              {trimmed.length}/{reasonMax} (min {reasonMin})
            </span>
          </label>
          {typeToConfirm && (
            <label className="block text-sm">
              <span className="mb-1 block text-foreground">
                Type <span className="font-mono font-semibold">{typeToConfirm}</span> to confirm
              </span>
              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm uppercase tracking-wider text-foreground focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/40 min-h-11"
              />
            </label>
          )}
        </div>
        <DialogFooter>
          <button
            type="button"
            onClick={() => handleClose(false)}
            disabled={submitting}
            className="rounded-md border border-border bg-muted/60 px-3 py-2 text-sm text-foreground hover:bg-muted disabled:opacity-60 min-h-11"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60 ${btnCls} min-h-11`}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}