import { Ban, Eye, UserPlus, Flame, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  availabilityDot, availabilityLabel, availabilityTextColor, availabilityRing,
  initialsOf, isEligibleAvailability, nameOf, relativeShort, humanize,
} from "./helpers";
import type { AgentRosterEntry } from "@/services/task-orchestration.service";

export function AgentLoadCard({ agent, onSelect }: { agent: AgentRosterEntry; onSelect: () => void }) {
  const offline = agent.availability === "offline";
  const atCap = agent.availability === "at_capacity";
  const eligible = isEligibleAvailability(agent.availability);
  const loadPct = agent.max_active > 0
    ? Math.min(100, Math.round((agent.active / agent.max_active) * 100))
    : 0;
  const slaTone =
    agent.sla_risk === "high" ? "text-rose-300 bg-rose-500/10 ring-rose-500/30" :
    agent.sla_risk === "medium" ? "text-amber-300 bg-amber-500/10 ring-amber-500/30" :
    "text-emerald-300 bg-emerald-500/10 ring-emerald-500/30";
  const roleText = agent.role ? humanize(agent.role) : agent.job_title ?? null;
  const teamText = agent.team ?? null;
  const lastActivity = agent.last_activity_at ?? agent.last_heartbeat ?? null;

  return (
    <div className={cn(
      "group rounded-xl border border-border/60 bg-background/40 p-3 backdrop-blur-sm transition-all duration-150",
      offline ? "opacity-60" : "hover:-translate-y-px hover:border-primary/40 hover:shadow-[0_8px_24px_-12px_hsl(var(--primary)/0.25)]",
    )}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className={cn("relative h-8 w-8 flex-shrink-0 rounded-full ring-2", availabilityRing(agent.availability))}>
            <div className="flex h-full w-full items-center justify-center rounded-full bg-muted text-[12px] font-semibold text-foreground">
              {agent.avatar_url
                ? <img src={agent.avatar_url} alt="" className="h-full w-full rounded-full object-cover" />
                : initialsOf(agent)}
            </div>
            <span className={cn("absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-background", availabilityDot(agent.availability))} />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-foreground">{nameOf(agent)}</div>
            <div className="flex items-center gap-1.5 text-[12px]">
              <span className={cn("font-medium", availabilityTextColor(agent.availability))}>
                {availabilityLabel(agent.availability)}
              </span>
              {!eligible && !offline && (
                <span className="rounded-full bg-muted/60 px-1.5 py-0 text-[12px] uppercase tracking-wider text-muted-foreground">
                  Ineligible
                </span>
              )}
            </div>
            {(roleText || teamText) && (
              <div className="truncate text-[12px] text-muted-foreground">
                {[roleText, teamText].filter(Boolean).join(" · ")}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {(agent.critical_active ?? 0) > 0 && (
            <span
              title={`${agent.critical_active} critical task${agent.critical_active === 1 ? "" : "s"}`}
              className="inline-flex items-center gap-0.5 rounded-full bg-rose-500/10 px-1.5 py-0.5 text-[12px] font-semibold text-rose-300 ring-1 ring-inset ring-rose-500/30"
            >
              <Flame className="h-2.5 w-2.5" /> {agent.critical_active}
            </span>
          )}
          {agent.sla_risk && agent.sla_risk !== "low" && (
            <span
              title={`${humanize(agent.sla_risk)} SLA risk`}
              className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[12px] font-semibold ring-1 ring-inset", slaTone)}
            >
              <AlertCircle className="h-2.5 w-2.5" />
            </span>
          )}
          <button
            type="button" onClick={onSelect} disabled={offline}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-lg border border-border/60 bg-background/60 text-muted-foreground transition hover:border-primary/40 hover:text-foreground relative before:absolute before:-inset-2 before:content-['']",
              offline && "cursor-not-allowed opacity-50",
            )}
            aria-label="Agent details"
          >
            {offline ? <Ban className="h-3 w-3" /> : atCap ? <Eye className="h-3 w-3" /> : <UserPlus className="h-3 w-3" />}
          </button>
        </div>
      </div>

      <div className={cn("grid grid-cols-3 gap-2 text-[12px]", offline && "opacity-70")}>
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

      {lastActivity && (
        <div className="mt-2 text-right text-[12px] text-muted-foreground">
          Last active {relativeShort(lastActivity)}
        </div>
      )}
    </div>
  );
}