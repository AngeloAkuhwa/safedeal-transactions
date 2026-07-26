import { Loader2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";

export function AutoAssignPreviewDrawer({
  open, onOpenChange, pending, seats, wouldAssign, onConfirm, submitting,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pending: number;
  seats: number;
  wouldAssign: number;
  onConfirm: () => void;
  submitting: boolean;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Auto-assign preview</SheetTitle>
          <SheetDescription>Dry-run against the current unassigned queue.</SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-3">
          <Row label="Pending tasks" value={pending} tone="text-foreground" />
          <Row label="Open agent seats" value={seats} tone="text-sky-300" />
          <Row label="Would be assigned" value={wouldAssign} tone="text-emerald-300" />
          <Row label="Would remain unassigned" value={Math.max(0, pending - wouldAssign)} tone="text-amber-300" />
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={onConfirm} disabled={submitting || wouldAssign === 0}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCw className="mr-2 h-4 w-4" />}
              Run assignment
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card/40 p-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-lg font-bold tabular-nums ${tone}`}>{value}</span>
    </div>
  );
}