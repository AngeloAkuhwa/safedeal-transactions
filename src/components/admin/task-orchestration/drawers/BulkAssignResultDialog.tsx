import { CheckCircle2, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { BulkAssignRowResult } from "@/services/task-orchestration.service";

export function BulkAssignResultDialog({
  open, onOpenChange, results, taskCodeById,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  results: BulkAssignRowResult[];
  taskCodeById?: Record<string, string>;
}) {
  const ok = results.filter(r => r.ok);
  const fail = results.filter(r => !r.ok);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Bulk assignment result</DialogTitle>
          <DialogDescription>
            {ok.length} of {results.length} assigned. {fail.length ? `${fail.length} failed. See reasons below.` : "All succeeded."}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[50dvh] space-y-1.5 overflow-y-auto pr-1">
          {results.map(r => {
            const code = taskCodeById?.[r.task_id] ?? r.task_id.slice(0, 8);
            return (
              <div key={r.task_id} className="flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-card/40 p-2.5 text-sm">
                <div className="flex items-center gap-2">
                  {r.ok
                    ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    : <XCircle className="h-4 w-4 text-rose-400" />}
                  <span className="font-medium">#{code}</span>
                </div>
                <span className={`text-right text-xs ${r.ok ? "text-emerald-300" : "text-rose-300"}`}>
                  {r.ok ? "Assigned" : (r.error ?? "Failed")}
                </span>
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}