import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { currencyFmt, humanize, nameOf, priorityBadgeClass } from "../helpers";
import type { AgentRosterEntry, UnassignedTask } from "@/services/task-orchestration.service";

export function AssignTaskDrawer({
  open, onOpenChange, task, bulkCount, roster, onConfirm, submitting,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  task: UnassignedTask | null;
  bulkCount?: number;
  roster: AgentRosterEntry[];
  onConfirm: (agentId: string, reason: string) => void;
  submitting: boolean;
}) {
  const [agentId, setAgentId] = useState("");
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) { setAgentId(task?.suggested_agent_id ?? ""); setReason(""); }
  }, [open, task]);
  const eligible = roster.filter(a => a.availability !== "offline");
  const isBulk = (bulkCount ?? 0) > 1;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{isBulk ? `Assign ${bulkCount} tasks` : "Assign Task"}</SheetTitle>
          <SheetDescription>Pick an eligible agent and record why.</SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          {task && !isBulk && (
            <div className="rounded-xl border border-border/60 bg-card/40 p-3 text-sm">
              <div className="mb-1 flex items-center gap-2">
                <span className="font-medium text-foreground">#{task.task_code}</span>
                <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold", priorityBadgeClass(task.priority))}>
                  {humanize(task.priority)}
                </span>
              </div>
              <div className="text-[11px] text-muted-foreground">
                {humanize(task.type)} · {currencyFmt(task.amount, task.currency)}
              </div>
            </div>
          )}
          <div>
            <Label className="mb-1 block text-xs">Agent</Label>
            <Select value={agentId} onValueChange={setAgentId}>
              <SelectTrigger className="bg-background/60"><SelectValue placeholder="Choose agent" /></SelectTrigger>
              <SelectContent>
                {eligible.map(a => (
                  <SelectItem key={a.user_id} value={a.user_id}>
                    {nameOf(a)} — {a.active}/{a.max_active} active
                  </SelectItem>
                ))}
                {eligible.length === 0 && (
                  <SelectItem value="__none" disabled>No online agents</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1 block text-xs">Assignment reason (optional)</Label>
            <Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Why is this being assigned now?" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={() => onConfirm(agentId, reason)} disabled={!agentId || agentId === "__none" || submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirm
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}