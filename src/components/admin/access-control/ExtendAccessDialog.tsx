import { useEffect, useMemo, useState } from "react";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { InternalUser } from "@/services/admin-access-control.service";

interface Props {
  user: InternalUser | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (values: { new_expires_at: string | null; reason: string }) => Promise<void> | void;
}

function isoAtEndOfDay(dateStr: string): string {
  const d = new Date(dateStr + "T23:59:59");
  return d.toISOString();
}

function defaultDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 90);
  return d.toISOString().slice(0, 10);
}

export function ExtendAccessDialog({ user, open, onOpenChange, onConfirm }: Props) {
  const [date, setDate] = useState<string>(defaultDate());
  const [reason, setReason] = useState("");
  const [clearExpiry, setClearExpiry] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setDate(defaultDate());
      setReason("");
      setClearExpiry(false);
      setSubmitting(false);
    }
  }, [open]);

  const currentExpiry = useMemo(
    () => (user?.access_expires_at ? new Date(user.access_expires_at) : null),
    [user],
  );
  const isExpired = currentExpiry ? currentExpiry.getTime() < Date.now() : false;

  const disabled = submitting || reason.trim().length < 4 || (!clearExpiry && !date);

  const handleConfirm = async () => {
    if (!user) return;
    setSubmitting(true);
    try {
      await onConfirm({
        new_expires_at: clearExpiry ? null : isoAtEndOfDay(date),
        reason: reason.trim(),
      });
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/15 text-amber-500">
              <CalendarClock className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle>Extend access</DialogTitle>
              <DialogDescription>
                {user ? `Update the access window for ${user.full_name}.` : ""}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="rounded-lg border bg-muted/40 p-3 text-xs">
            <p className="text-muted-foreground">Current expiry</p>
            <p className="mt-0.5 font-medium text-foreground">
              {currentExpiry
                ? `${currentExpiry.toLocaleString()}${isExpired ? " — expired" : ""}`
                : "No expiration set"}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="extend-date">New expiration date</Label>
            <Input
              id="extend-date"
              type="date"
              value={date}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setDate(e.target.value)}
              disabled={clearExpiry}
            />
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={clearExpiry}
                onChange={(e) => setClearExpiry(e.target.checked)} className="h-5 w-5 relative before:absolute before:-inset-3 before:content-['']" />
              Remove expiration (grant permanent access)
            </label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="extend-reason">
              Reason <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="extend-reason"
              placeholder="Why is this extension needed? (min 4 chars)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={disabled}>
            {submitting ? "Saving…" : clearExpiry ? "Remove expiry" : "Extend access"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}