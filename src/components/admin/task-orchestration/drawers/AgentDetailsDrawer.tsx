import { useNavigate } from "react-router";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { availabilityDot, availabilityLabel, availabilityTextColor, humanize, initialsOf, nameOf, slaBadgeClass } from "../helpers";
import { cn } from "@/lib/utils";
import { ListChecks, Repeat, AlertTriangle, Flame, Clock, Mail, Users } from "lucide-react";
import type { AgentRosterEntry } from "@/services/task-orchestration.service";
import { UserAvatar } from "@/components/common/UserAvatar";
import { ADMIN_TONE } from "@/components/admin/palette";

export function AgentDetailsDrawer({
  open, onOpenChange, agent, onReassign, focus, context,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  agent: AgentRosterEntry | null;
  onReassign?: (a: AgentRosterEntry) => void;
  /** When "performance", the performance stats are highlighted on open. */
  focus?: "performance" | null;
  /** Filter context carried in from the insight cards. */
  context?: { metricLabel?: string; range?: string; team?: string } | null;
}) {
  const navigate = useNavigate();
  const capacityPct = agent && agent.max_active ? Math.min(100, Math.round((agent.active / agent.max_active) * 100)) : 0;
  const capacityTone = capacityPct >= 100 ? "bg-rose-400" : capacityPct >= 80 ? ADMIN_TONE.warning.dot : "bg-emerald-400";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto bg-[radial-gradient(ellipse_at_top_right,hsl(var(--primary)/0.05),transparent_55%)]">
        <SheetHeader>
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="h-11 w-11 rounded-full bg-muted text-sm font-semibold text-foreground flex items-center justify-center overflow-hidden">
                <UserAvatar
                  url={agent?.avatar_url}
                  name={agent ? nameOf(agent) : null}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </div>
              {agent && (
                <span className={cn(
                  "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-background",
                  availabilityDot(agent.availability),
                )} />
              )}
            </div>
            <div className="min-w-0">
              <SheetTitle className="truncate">{nameOf(agent)}</SheetTitle>
              <SheetDescription className="truncate">
                {agent?.job_title ?? agent?.role ?? "Agent"} · <span className={availabilityTextColor(agent?.availability ?? "offline")}>{availabilityLabel(agent?.availability ?? "offline")}</span>
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {agent && (
          <div className="mt-5 space-y-4">
            <div className="rounded-xl border border-border/60 bg-card/40 p-3 backdrop-blur-sm shadow-[0_1px_0_hsl(var(--border)/0.4)_inset]">
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Capacity</span>
                <span className="font-semibold tabular-nums text-foreground">{agent.active} / {agent.max_active}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/50">
                <div className={cn("h-full transition-all", capacityTone)} style={{ width: `${capacityPct}%` }} />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                {(agent.critical_active ?? 0) > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-rose-300 ring-1 ring-inset ring-rose-500/30">
                    <Flame className="h-3 w-3" /> {agent.critical_active} critical
                  </span>
                )}
                {agent.sla_risk && (
                  <span className={cn("rounded-full px-2 py-0.5", slaBadgeClass(agent.sla_risk === "low" ? "on_track" : "at_risk"))}>
                    SLA risk · {humanize(agent.sla_risk)}
                  </span>
                )}
                {agent.overdue > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-300 ring-1 ring-inset ring-amber-500/30">
                    <AlertTriangle className="h-3 w-3" /> {agent.overdue} overdue
                  </span>
                )}
              </div>
            </div>

            {focus === "performance" && context && (
              <div className="rounded-xl border border-primary/30 bg-primary/10 p-3 text-xs text-primary">
                Performance view{context.metricLabel ? ` · ${context.metricLabel}` : ""}
                {context.range ? ` · ${context.range}` : ""}
                {context.team ? ` · team ${context.team}` : ""}
              </div>
            )}

            <div className={cn(
              "grid grid-cols-2 gap-2.5 rounded-xl",
              focus === "performance" && "ring-1 ring-primary/40 ring-offset-2 ring-offset-background",
            )}>
              <Stat label="Tasks Today" value={String(agent.tasks_today)} />
              <Stat label="Resolved Today" value={String(agent.resolved_today)} />
              <Stat label="Avg First Action" value={agent.avg_first_action_seconds ? `${Math.round(agent.avg_first_action_seconds / 60)}m` : "—"} />
              <Stat label="Avg Resolution" value={agent.avg_resolution_seconds ? `${Math.round(agent.avg_resolution_seconds / 60)}m` : "—"} />
            </div>

            <div className="rounded-xl border border-border/60 bg-card/40 p-3 backdrop-blur-sm shadow-[0_1px_0_hsl(var(--border)/0.4)_inset]">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Role &amp; Skills</div>
              <div className="flex flex-wrap gap-1.5">
                {(agent.role || agent.role_key) && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary ring-1 ring-inset ring-primary/25">
                    <Users className="h-3 w-3" /> {agent.role ?? humanize(agent.role_key!)}
                  </span>
                )}
                {(agent.skills ?? []).length === 0 && !agent.role && !agent.role_key && (
                  <span className="text-xs text-muted-foreground">No skills tagged.</span>
                )}
                {(agent.skills ?? []).map(s => (
                  <span key={s} className="rounded-md bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground ring-1 ring-inset ring-border">
                    {humanize(s)}
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-border/60 bg-card/40 p-3 backdrop-blur-sm shadow-[0_1px_0_hsl(var(--border)/0.4)_inset] text-xs text-muted-foreground">
              {agent.email && (
                <div className="flex items-center gap-1.5"><Mail className="h-3 w-3" /> {agent.email}</div>
              )}
              {agent.team && (
                <div className="mt-0.5 flex items-center gap-1.5"><Users className="h-3 w-3" /> Team · {agent.team}</div>
              )}
              {agent.last_activity_at && (
                <div className="mt-0.5 flex items-center gap-1.5"><Clock className="h-3 w-3" /> Last active {new Date(agent.last_activity_at).toLocaleString()}</div>
              )}
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  onOpenChange(false);
                  navigate(`/admin/task-orchestration?tab=queue&assignee=${agent.user_id}`);
                }}
              >
                <ListChecks className="mr-1.5 h-4 w-4" /> View queue
              </Button>
              {onReassign && (
                <Button
                  className="flex-1"
                  onClick={() => onReassign(agent)}
                  disabled={agent.active === 0}
                >
                  <Repeat className="mr-1.5 h-4 w-4" /> Reassign work
                </Button>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-3 backdrop-blur-sm shadow-[0_1px_0_hsl(var(--border)/0.4)_inset]">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  );
}