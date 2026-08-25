import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { ADMIN_SOLID } from "@/components/admin/palette";
import { Label } from "@/components/ui/label";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  variant?: "default" | "destructive";
  requireReason?: boolean;
  onConfirm: (reason?: string) => Promise<void> | void;
}

export function ActionConfirmDialog({
  open, onOpenChange, title, description, confirmLabel,
  variant = "default", requireReason = false, onConfirm,
}: Props) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) { setReason(""); setBusy(false); } }, [open]);

  const canSubmit = !busy && (!requireReason || reason.trim().length >= 3);
  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await onConfirm(requireReason ? reason.trim() : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {requireReason && (
          <div className="space-y-2">
            <Label htmlFor="confirm-reason" className="text-xs uppercase tracking-wide text-muted-foreground">
              Reason (required)
            </Label>
            <Textarea
              id="confirm-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Provide context for the audit trail (min 3 characters)"
              rows={3}
            />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); void submit(); }}
            disabled={!canSubmit}
            className={variant === "destructive" ? ADMIN_SOLID.danger : undefined}
          >
            {busy ? "Working…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}