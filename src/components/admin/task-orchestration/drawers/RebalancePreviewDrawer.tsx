import { Loader2, ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { availabilityDot, availabilityLabel, nameOf } from "../helpers";
import { cn } from "@/lib/utils";
import type { AgentRosterEntry } from "@/services/task-orchestration.service";

export function RebalancePreviewDrawer({
  open, onOpenChange, roster, onConfirm, submitting,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  roster: AgentRosterEntry[];
  onConfirm: () => void;
  submitting: boolean;
}) {
  const online = roster.filter(a => a.availability !== "offline");
  const totalActive = online.reduce((s, a) => s + a.active, 0);
  const target = online.length ? Math.round(totalActive / online.length) : 0;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Rebalance preview</SheetTitle>
          <SheetDescription>
            {online.length} online agents · target ~{target} active per agent
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-2 max-h-[50vh] overflow-y-auto pr-1">
          {online.map(a => {
            const delta = a.active - target;
            const tone = delta > 0 ? "text-amber-300" : delta < 0 ? "text-emerald-300" : "text-muted-foreground";
            return (
              <div key={a.user_id} className="flex items-center justify-between rounded-xl border border-border/60 bg-card/40 p-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={cn("h-2 w-2 rounded-full", availabilityDot(a.availability))} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">{nameOf(a)}</div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{availabilityLabel(a.availability)}</div>
                  </div>
                </div>
                <div className={`text-sm font-semibold tabular-nums ${tone}`}>
                  {a.active} → {target} <span className="text-muted-foreground">({delta > 0 ? "+" : ""}{delta})</span>
                </div>
              </div>
            );
          })}
          {online.length === 0 && (
            <div className="rounded-xl border border-dashed border-border/60 bg-background/40 p-6 text-center text-sm text-muted-foreground">
              No online agents available for rebalancing.
            </div>
          )}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onConfirm} disabled={submitting || online.length === 0}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowLeftRight className="mr-2 h-4 w-4" />}
            Rebalance now
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}