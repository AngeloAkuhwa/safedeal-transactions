import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

export function ExportPerformanceDialog({
  open, onOpenChange, tabLabel, rowCount, onConfirm, busy,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tabLabel: string;
  rowCount: number;
  onConfirm: (opts: { maskPii: boolean; reason: string }) => void;
  busy: boolean;
}) {
  const [maskPii, setMaskPii] = useState(true);
  const [reason, setReason] = useState("");
  const valid = reason.trim().length >= 20;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export performance report</DialogTitle>
          <DialogDescription>
            Exporting the <strong>{tabLabel}</strong> view · {rowCount} {rowCount === 1 ? "agent" : "agents"} with the current filters applied. This export is audit logged.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card/60 p-3">
            <div>
              <Label htmlFor="mask-pii" className="text-sm">Mask personal data</Label>
              <p className="text-xs text-muted-foreground">Hides agent emails in the CSV.</p>
            </div>
            <Switch id="mask-pii" checked={maskPii} onCheckedChange={setMaskPii} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="export-reason" className="text-sm">Reason (min 20 characters)</Label>
            <Textarea
              id="export-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Why is this export needed?"
            />
            <p className="text-[11px] text-muted-foreground">{reason.trim().length}/20</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={() => onConfirm({ maskPii, reason: reason.trim() })} disabled={!valid || busy}>
            {busy ? "Exporting…" : "Export CSV"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}