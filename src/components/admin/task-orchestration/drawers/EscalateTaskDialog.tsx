import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

export function EscalateTaskDialog({
  open, onOpenChange, count, onConfirm, submitting,
}: { open: boolean; onOpenChange: (v: boolean) => void; count: number; onConfirm: (reason: string) => void; submitting: boolean }) {
  const [reason, setReason] = useState("");
  useEffect(() => { if (open) setReason(""); }, [open]);
  const short = reason.trim().length < 20;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Escalate {count} task{count === 1 ? "" : "s"}</DialogTitle>
          <DialogDescription>
            Escalated tasks move to the senior agent pool. The reason is written to the audit log.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Reason (min 20 characters)"
          className="min-h-[120px]"
        />
        <div className="text-[11px] text-muted-foreground">
          {reason.trim().length}/20 characters minimum
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onConfirm(reason)} disabled={short || submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Escalate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}