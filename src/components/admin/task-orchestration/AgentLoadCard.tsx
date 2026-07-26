import { Ban, Eye, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { availabilityDot, availabilityLabel, availabilityTextColor, availabilityRing, initialsOf, nameOf } from "./helpers";
import type { AgentRosterEntry } from "@/services/task-orchestration.service";

export function AgentLoadCard({ agent, onSelect }: { agent: AgentRosterEntry; onSelect: () => void }) {
  const offline = agent.availability === "offline";
  const atCap = agent.availability === "at_capacity";
  const loadPct = agent.max_active > 0
    ? Math.min(100, Math.round((agent.active / agent.max_active) * 100))
    : 0;

  return (
    <div className={cn(
      "rounded-xl border border-border/60 bg-background/40 p-3 backdrop-blur-sm transition",
      offline ? "opacity-60" : "hover:border-primary/40",
    )}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className={cn("relative h-8 w-8 flex-shrink-0 rounded-full ring-2", availabilityRing(agent.availability))}>
            <div className="flex h-full w-full items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground">
              {agent.avatar_url
                ? <img src={agent.avatar_url} alt="" className="h-full w-full rounded-full object-cover" />
                : initialsOf(agent)}
            </div>
            <span className={cn("absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-background", availabilityDot(agent.availability))} />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-foreground">{nameOf(agent)}</div>
            <div className={cn("text-[11px] font-medium", availabilityTextColor(agent.availability))}>
              {availabilityLabel(agent.availability)}
            </div>
          </div>
        </div>
        <button
          type="button" onClick={onSelect} disabled={offline}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-lg border border-border/60 bg-background/60 text-muted-foreground transition hover:border-primary/40 hover:text-foreground",
            offline && "cursor-not-allowed opacity-50",
          )}
          aria-label="Agent details"
        >
          {offline ? <Ban className="h-3 w-3" /> : atCap ? <Eye className="h-3 w-3" /> : <UserPlus className="h-3 w-3" />}
        </button>
      </div>

      <div className={cn("grid grid-cols-3 gap-2 text-[11px]", offline && "opacity-70")}>
        <div>
          <div className="text-muted-foreground">Active</div>
          <div className={cn("text-sm font-semibold tabular-nums", atCap ? "text-amber-300" : "text-foreground")}>{agent.active}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Avg</div>
          <div className="text-sm font-semibold tabular-nums text-foreground">
            {agent.avg_first_action_seconds ? `${Math.round(agent.avg_first_action_seconds / 60)}m` : "—"}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">Overdue</div>
          <div className={cn("text-sm font-semibold tabular-nums", agent.overdue > 0 ? "text-rose-300" : "text-foreground")}>
            {agent.overdue}
          </div>
        </div>
      </div>

      <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-border/60">
        <div
          className={cn(
            "h-full transition-all",
            atCap ? "bg-amber-400" : loadPct >= 70 ? "bg-primary" : "bg-emerald-400",
          )}
          style={{ width: `${loadPct}%` }}
        />
      </div>
    </div>
  );
}