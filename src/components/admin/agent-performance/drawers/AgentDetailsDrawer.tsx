import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  availabilityDot, availabilityLabel, availabilityTextClass,
  hoursLabel, minutesLabel, scoreTone, slaTone, SCORE_FORMULA, INNER_CARD_CLASS,
} from "../helpers";
import { agentInitials, agentName, type AgentPerformanceRow } from "@/services/agent-performance.service";

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className={INNER_CARD_CLASS}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-lg font-semibold text-foreground", tone)}>{value}</div>
    </div>
  );
}

export function AgentPerformanceDetailDrawer({
  agent, open, onOpenChange, onViewCases, onReviewSla, onRebalance, canRebalance,
}: {
  agent: AgentPerformanceRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onViewCases: (a: AgentPerformanceRow) => void;
  onReviewSla: (a: AgentPerformanceRow) => void;
  onRebalance: (a: AgentPerformanceRow) => void;
  canRebalance: boolean;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        {agent && (
          <>
            <SheetHeader className="text-left">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground ring-2 ring-border">
                  {agentInitials(agent)}
                </div>
                <div className="min-w-0">
                  <SheetTitle className="truncate">{agentName(agent)}</SheetTitle>
                  <SheetDescription className="flex items-center gap-2">
                    <span className={cn("h-2 w-2 rounded-full", availabilityDot(agent.availability))} />
                    <span className={availabilityTextClass(agent.availability)}>{availabilityLabel(agent.availability)}</span>
                    <span>· {agent.role_label}</span>
                  </SheetDescription>
                </div>
              </div>
            </SheetHeader>

            <div className="mt-6 space-y-6">
              <div className={cn(INNER_CARD_CLASS, "flex items-center justify-between")}>
                <div>
                  <div className="text-xs text-muted-foreground">Composite score</div>
                  <div className={cn("text-3xl font-bold", scoreTone(agent.score_band))}>{agent.score}</div>
                  <div className="text-xs text-muted-foreground">{agent.score_band} · Rank #{agent.rank}</div>
                </div>
                <p className="max-w-[55%] text-[11px] leading-relaxed text-muted-foreground">{SCORE_FORMULA}</p>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Capacity</span>
                  <span className="text-foreground">{agent.active_cases} / {agent.max_active}</span>
                </div>
                <Progress value={Math.min(100, (agent.active_cases / Math.max(1, agent.max_active)) * 100)} className="h-2" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Stat label="Resolved (range)" value={String(agent.resolved)} />
                <Stat label="Previous period" value={String(agent.resolved_prev)} />
                <Stat label="Avg resolution" value={hoursLabel(agent.avg_resolution_hours)} />
                <Stat label="Avg first action" value={minutesLabel(agent.avg_first_action_minutes)} />
                <Stat label="Overdue" value={String(agent.overdue)} tone={agent.overdue > 0 ? "text-rose-300" : undefined} />
                <Stat label="Breached" value={String(agent.breached)} tone={agent.breached > 0 ? "text-rose-300" : undefined} />
                <Stat label="Escalations" value={String(agent.escalations)} />
                <Stat label="Reassignments" value={String(agent.reassignments)} />
              </div>

              <div className={INNER_CARD_CLASS}>
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">SLA compliance</span>
                  <span className={cn("font-semibold", slaTone(agent.sla_compliance))}>{agent.sla_compliance}%</span>
                </div>
                <Progress value={agent.sla_compliance} className="h-1.5" />
              </div>

              <div>
                <div className="mb-2 text-xs font-medium text-muted-foreground">Skills</div>
                {agent.skills.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No skills recorded for this agent.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {agent.skills.map((s) => (
                      <Badge key={s.skill} variant="secondary" className="font-mono text-[11px]">
                        {s.skill}{s.proficiency != null ? ` · ${s.proficiency}` : ""}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div className={INNER_CARD_CLASS}>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div><span className="text-muted-foreground">Team</span><div className="text-foreground">{agent.team ?? "—"}</div></div>
                  <div><span className="text-muted-foreground">Department</span><div className="text-foreground">{agent.department ?? "—"}</div></div>
                  <div><span className="text-muted-foreground">Job title</span><div className="text-foreground">{agent.job_title ?? "—"}</div></div>
                  <div><span className="text-muted-foreground">Last active</span><div className="text-foreground">{agent.last_active_at ? new Date(agent.last_active_at).toLocaleString() : "—"}</div></div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pb-6">
                <Button size="sm" variant="outline" onClick={() => onViewCases(agent)}>View cases</Button>
                <Button size="sm" variant="outline" onClick={() => onReviewSla(agent)}>Review SLA</Button>
                <Button
                  size="sm"
                  onClick={() => onRebalance(agent)}
                  disabled={!canRebalance}
                  title={canRebalance ? "Rebalance workload" : "You do not have rebalance permission"}
                >
                  Rebalance workload
                </Button>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}