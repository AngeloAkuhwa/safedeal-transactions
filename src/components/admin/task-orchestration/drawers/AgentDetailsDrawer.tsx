import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { availabilityDot, availabilityLabel, humanize, initialsOf, nameOf } from "../helpers";
import { cn } from "@/lib/utils";
import type { AgentRosterEntry } from "@/services/task-orchestration.service";

export function AgentDetailsDrawer({
  open, onOpenChange, agent,
}: { open: boolean; onOpenChange: (v: boolean) => void; agent: AgentRosterEntry | null }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-muted text-sm font-semibold text-foreground flex items-center justify-center overflow-hidden">
              {agent?.avatar_url
                ? <img src={agent.avatar_url} className="h-full w-full object-cover" alt="" />
                : initialsOf(agent)}
            </div>
            <div className="min-w-0">
              <SheetTitle className="truncate">{nameOf(agent)}</SheetTitle>
              <SheetDescription className="truncate">{agent?.email ?? ""}</SheetDescription>
            </div>
          </div>
        </SheetHeader>
        {agent && (
          <div className="mt-6 space-y-4">
            <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-card/40 p-3">
              <span className={cn("h-2 w-2 rounded-full", availabilityDot(agent.availability))} />
              <span className="text-sm font-medium text-foreground">{availabilityLabel(agent.availability)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2.5 text-sm">
              <Stat label="Load" value={`${agent.active} / ${agent.max_active}`} />
              <Stat label="Overdue" value={String(agent.overdue)} />
              <Stat label="Tasks Today" value={String(agent.tasks_today)} />
              <Stat label="Resolved Today" value={String(agent.resolved_today)} />
              <Stat label="Avg First Action" value={agent.avg_first_action_seconds ? `${Math.round(agent.avg_first_action_seconds / 60)}m` : "—"} />
              <Stat label="Role" value={humanize(agent.availability)} />
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}