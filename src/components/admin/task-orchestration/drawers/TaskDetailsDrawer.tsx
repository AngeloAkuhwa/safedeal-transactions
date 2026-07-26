import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ExternalLink, UserCheck, ArrowUpRightFromSquare } from "lucide-react";
import { Link } from "react-router";
import {
  currencyFmt, humanize, priorityBadgeClass, relative, shortNameOf,
} from "../helpers";
import { cn } from "@/lib/utils";
import type { AgentRosterEntry, UnassignedTask } from "@/services/task-orchestration.service";

export function TaskDetailsDrawer({
  open, onOpenChange, task, roster, onAssign, onEscalate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  task: UnassignedTask | null;
  roster: AgentRosterEntry[];
  onAssign: (t: UnassignedTask) => void;
  onEscalate: (t: UnassignedTask) => void;
}) {
  const suggested = task?.suggested_agent_id ? roster.find(r => r.user_id === task.suggested_agent_id) ?? null : null;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{task ? `Task #${task.task_code}` : "Task"}</SheetTitle>
          <SheetDescription>
            {task ? `${humanize(task.type)} · ${currencyFmt(task.amount, task.currency)}` : ""}
          </SheetDescription>
        </SheetHeader>
        {task && (
          <div className="mt-6 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold", priorityBadgeClass(task.priority))}>
                {humanize(task.priority)}
              </span>
              <span className="rounded-full border border-border/60 bg-card/40 px-2 py-0.5 text-[11px] text-muted-foreground">
                {humanize(task.type)}
              </span>
              <span className="rounded-full border border-border/60 bg-card/40 px-2 py-0.5 text-[11px] text-muted-foreground">
                Created {relative(task.created_at)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Amount" value={currencyFmt(task.amount, task.currency)} />
              <Field label="Suggested Agent" value={suggested ? shortNameOf(suggested) : "Auto"} />
              <Field label="Currency" value={task.currency} />
              <Field label="Task ID" value={`#${task.task_code}`} />
            </div>
            {task.dispute_id && (
              <div className="rounded-xl border border-border/60 bg-card/40 p-3">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Linked Dispute</div>
                <Link
                  to={`/admin/disputes/${task.dispute_id}`}
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  #{task.dispute_id.slice(0, 8)} <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <Button onClick={() => onAssign(task)} className="flex-1">
                <UserCheck className="mr-2 h-4 w-4" /> Assign
              </Button>
              <Button variant="outline" onClick={() => onEscalate(task)}>
                <ArrowUpRightFromSquare className="mr-2 h-4 w-4" /> Escalate
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}