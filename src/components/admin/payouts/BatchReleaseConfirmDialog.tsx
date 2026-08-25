import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2 } from "lucide-react";
import { ADMIN_TONE } from "@/components/admin/palette";

export const BATCH_RELEASE_CONFIRM_PHRASE = "RELEASE";

interface Props {
  open: boolean;
  count: number;
  totalLabel?: string;
  processing?: boolean;
  onClose: () => void;
  /** Receives the operator-supplied reason; must be non-empty. */
  onConfirm: (reason: string) => Promise<void> | void;
}

/**
 * Typed-confirmation gate for the batch payout release. Money leaves escrow
 * here, so we require (a) an explicit typed phrase and (b) an audit reason
 * that is forwarded to the release endpoint as `notes`.
 */
export function BatchReleaseConfirmDialog({
  open, count, totalLabel, processing, onClose, onConfirm,
}: Props) {
  const [phrase, setPhrase] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) { setPhrase(""); setReason(""); setBusy(false); }
  }, [open]);

  const phraseOk = phrase.trim().toUpperCase() === BATCH_RELEASE_CONFIRM_PHRASE;
  const reasonOk = reason.trim().length >= 5;
  const disabled = busy || !!processing || count === 0 || !phraseOk || !reasonOk;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className={`h-4 w-4 ${ADMIN_TONE.warning.text}`} />
            Confirm batch release
          </DialogTitle>
          <DialogDescription>
            You are about to release{" "}
            <strong className="text-foreground">{count}</strong> selected payout{count === 1 ? "" : "s"}
            {totalLabel ? <> totalling <strong className="text-foreground">{totalLabel}</strong></> : null}. This
            moves money out of escrow and cannot be undone from this screen.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="batch-release-reason">Reason (recorded in the audit trail)</Label>
            <Textarea
              id="batch-release-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Weekly settlement run approved by finance"
            />
            {!reasonOk && reason.length > 0 && (
              <p className="text-xs text-muted-foreground">Please give at least 5 characters of context.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="batch-release-phrase">
              Type <span className="font-mono text-foreground">{BATCH_RELEASE_CONFIRM_PHRASE}</span> to confirm
            </Label>
            <Input
              id="batch-release-phrase"
              value={phrase}
              autoComplete="off"
              onChange={(e) => setPhrase(e.target.value)}
              placeholder={BATCH_RELEASE_CONFIRM_PHRASE}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            disabled={disabled}
            onClick={async () => {
              setBusy(true);
              try { await onConfirm(reason.trim()); onClose(); }
              finally { setBusy(false); }
            }}
          >
            {busy || processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Release {count} payout{count === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
