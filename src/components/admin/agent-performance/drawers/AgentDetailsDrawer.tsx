import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  availabilityDot, availabilityLabel, availabilityTextClass,
  hoursLabel, minutesLabel, scoreTone, slaTone, INNER_CARD_CLASS,
} from "../helpers";
import {
  agentInitials, agentName, fetchAgentActivity, fetchAgentCases,
  type AgentActivityEvent, type AgentCaseRow, type AgentPerformanceFilters,
  type AgentPerformanceRow,
} from "@/services/agent-performance.service";

function Stat({ label, value, tone, hint }: { label: string; value: string; tone?: string; hint?: string }) {
  return (
    <div className={INNER_CARD_CLASS}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-lg font-semibold text-foreground", tone)}>{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

const dt = (v: string | null | undefined) => (v ? new Date(v).toLocaleString() : "—");

function CaseTable({ rows, empty }: { rows: AgentCaseRow[]; empty: string }) {
  if (rows.length === 0) return <p className="text-xs text-muted-foreground">{empty}</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-border/60">
      <table className="w-full text-left text-[11px] sd-stack">
        <thead className="bg-muted/40 text-muted-foreground">
          <tr>
            <th className="px-2 py-2 font-medium">Reference</th>
            <th className="px-2 py-2 font-medium">Type</th>
            <th className="px-2 py-2 font-medium">Priority</th>
            <th className="px-2 py-2 font-medium">Stage</th>
            <th className="px-2 py-2 font-medium">Status</th>
            <th className="px-2 py-2 font-medium">Assigned</th>
            <th className="px-2 py-2 font-medium">SLA due</th>
            <th className="px-2 py-2 font-medium">Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={`${c.source}-${c.id}`} className="border-t border-border/50">
              <td className="px-2 py-2 font-mono text-foreground">{c.case_ref ?? c.task_code ?? "—"}</td>
              <td className="px-2 py-2 text-muted-foreground">{(c.type ?? "—").replace(/_/g, " ")}</td>
              <td className="px-2 py-2 text-muted-foreground">{c.priority ?? "—"}</td>
              <td className="px-2 py-2 text-muted-foreground">{(c.stage ?? "—").replace(/_/g, " ")}</td>
              <td className={cn("px-2 py-2", c.is_overdue ? "text-rose-300" : "text-muted-foreground")}>
                {(c.status ?? "—").replace(/_/g, " ")}
              </td>
              <td className="px-2 py-2 text-muted-foreground">{dt(c.assigned_at ?? c.created_at)}</td>
              <td className="px-2 py-2 text-muted-foreground">{dt(c.due_at)}</td>
              <td className="px-2 py-2 text-muted-foreground">{dt(c.resolved_at ?? c.assigned_at ?? c.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AgentDetailsDrawer({
  agent, open, onOpenChange, filters, onViewCases, onViewOverdue, onReviewSla, onRebalance,
  onOpenOrchestration, onOpenUserRecord, onOpenAuditHistory, canRebalance,
}: {
  agent: AgentPerformanceRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  filters: AgentPerformanceFilters;
  onViewCases: (a: AgentPerformanceRow) => void;
  onViewOverdue: (a: AgentPerformanceRow) => void;
  onReviewSla: (a: AgentPerformanceRow) => void;
  onRebalance: (a: AgentPerformanceRow) => void;
  onOpenOrchestration: (a: AgentPerformanceRow) => void;
  onOpenUserRecord: (a: AgentPerformanceRow) => void;
  onOpenAuditHistory: (a: AgentPerformanceRow) => void;
  canRebalance: boolean;
}) {
  const [tab, setTab] = useState("overview");
  const [cases, setCases] = useState<AgentCaseRow[]>([]);
  const [casesLoading, setCasesLoading] = useState(false);
  const [activity, setActivity] = useState<AgentActivityEvent[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  useEffect(() => {
    if (!open || !agent) return;
    setTab("overview");
    setCasesLoading(true);
    fetchAgentCases(agent.user_id, filters)
      .then((r) => setCases(r.cases))
      .catch(() => setCases([]))
      .finally(() => setCasesLoading(false));
    setActivityLoading(true);
    fetchAgentActivity(agent.user_id)
      .then(setActivity)
      .catch(() => setActivity([]))
      .finally(() => setActivityLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, agent?.user_id]);

  const active = cases.filter((c) => c.is_active);
  const history = cases.filter((c) => !c.is_active);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
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

            <Tabs value={tab} onValueChange={setTab} className="mt-5">
              <TabsList className="flex w-full flex-wrap justify-start gap-1 bg-muted/40">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="workload">Current Workload</TabsTrigger>
                <TabsTrigger value="performance">Performance</TabsTrigger>
                <TabsTrigger value="sla">SLA</TabsTrigger>
                <TabsTrigger value="history">Case History</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
              </TabsList>

              {/* -------- Overview -------- */}
              <TabsContent value="overview" className="mt-4 space-y-4">
                <div className={INNER_CARD_CLASS}>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div><span className="text-muted-foreground">Name</span><div className="text-foreground">{agentName(agent)}</div></div>
                    <div><span className="text-muted-foreground">User ID</span><div className="truncate font-mono text-foreground">{agent.user_id}</div></div>
                    <div><span className="text-muted-foreground">Role</span><div className="text-foreground">{agent.role_label}</div></div>
                    <div><span className="text-muted-foreground">Team</span><div className="text-foreground">{agent.team ?? "—"}</div></div>
                    <div><span className="text-muted-foreground">Department</span><div className="text-foreground">{agent.department ?? "—"}</div></div>
                    <div><span className="text-muted-foreground">Job title</span><div className="text-foreground">{agent.job_title ?? "—"}</div></div>
                    <div>
                      <span className="text-muted-foreground">Status</span>
                      <div className={availabilityTextClass(agent.availability)}>{availabilityLabel(agent.availability)}</div>
                    </div>
                    <div><span className="text-muted-foreground">Availability</span><div className="text-foreground">{agent.is_live ? "Live now" : "Not signed in"}</div></div>
                    <div><span className="text-muted-foreground">Last active</span><div className="text-foreground">{dt(agent.last_active_at)}</div></div>
                    <div><span className="text-muted-foreground">Reporting manager</span><div className="text-foreground">—</div></div>
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Active workload / capacity</span>
                    <span className="text-foreground">{agent.active_cases} / {agent.max_active}</span>
                  </div>
                  <Progress value={Math.min(100, (agent.active_cases / Math.max(1, agent.max_active)) * 100)} className="h-2" />
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
              </TabsContent>

              {/* -------- Current workload -------- */}
              <TabsContent value="workload" className="mt-4 space-y-3">
                {casesLoading
                  ? <p className="text-xs text-muted-foreground">Loading cases…</p>
                  : <CaseTable rows={active} empty="No open cases assigned to this agent." />}
                <Button size="sm" variant="outline" onClick={() => onViewCases(agent)}>Open full case list</Button>
              </TabsContent>

              {/* -------- Performance -------- */}
              <TabsContent value="performance" className="mt-4 space-y-4">
                <div className={cn(INNER_CARD_CLASS, "flex items-start justify-between gap-4")}>
                  <div>
                    <div className="text-xs text-muted-foreground">Composite score</div>
                    <div className={cn("text-3xl font-bold", scoreTone(agent.score_band))}>
                      {agent.insufficient_data ? "—" : agent.score}
                    </div>
                    <div className="text-xs text-muted-foreground">{agent.score_band} · Rank #{agent.rank}</div>
                  </div>
                  <div className="max-w-[55%] space-y-1 text-[11px] text-muted-foreground">
                    {(agent.score_components ?? []).map((c) => (
                      <div key={c.key} className="flex items-center justify-between gap-2">
                        <span>{c.label} · {c.weight}%</span>
                        <span className="tabular-nums text-foreground">{c.tracked ? `+${c.contribution}` : "n/a"}</span>
                      </div>
                    ))}
                    {(agent.score_penalties ?? []).map((p) => (
                      <div key={p.reason} className="flex items-center justify-between gap-2 text-rose-300">
                        <span>{p.reason}</span><span className="tabular-nums">−{Math.round(p.points * 10) / 10}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Stat label="Resolved (scope)" value={String(agent.resolved)} hint={`${agent.resolution_sample} timed cases`} />
                  <Stat label="Previous period" value={String(agent.resolved_prev)} hint="Comparison window" />
                  <Stat label="Avg first action" value={minutesLabel(agent.avg_first_action_minutes)} hint={`n=${agent.first_action_sample ?? 0}`} />
                  <Stat label="Avg resolution" value={hoursLabel(agent.avg_resolution_hours)} hint={`n=${agent.resolution_sample}`} />
                  <Stat
                    label="SLA compliance"
                    value={agent.sla_compliance == null ? "Not tracked" : `${agent.sla_compliance}%`}
                    tone={agent.sla_compliance == null ? undefined : slaTone(agent.sla_compliance)}
                    hint={`n=${agent.sla_sample ?? 0}`}
                  />
                  <Stat
                    label="Overdue rate"
                    value={`${Math.round(((agent.overdue / Math.max(1, agent.active_cases + agent.resolved)) * 100) * 10) / 10}%`}
                    tone={agent.overdue > 0 ? "text-rose-300" : undefined}
                    hint={`${agent.overdue} overdue now`}
                  />
                  <Stat label="Escalations" value={String(agent.escalations)} />
                  <Stat label="Reassignments" value={`${agent.reassignments_in} in / ${agent.reassignments_out} out`} />
                </div>

                <div className={cn(INNER_CARD_CLASS, "text-xs text-muted-foreground")}>
                  Current period {agent.resolved} resolved vs {agent.resolved_prev} previous ·{" "}
                  <span className={agent.resolved >= agent.resolved_prev ? "text-emerald-300" : "text-rose-300"}>
                    {agent.resolved - agent.resolved_prev >= 0 ? "+" : ""}{agent.resolved - agent.resolved_prev}
                  </span>
                </div>
              </TabsContent>

              {/* -------- SLA -------- */}
              <TabsContent value="sla" className="mt-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="On track" value={String(agent.sla_on_track ?? 0)} />
                  <Stat label="At risk" value={String(agent.sla_at_risk ?? 0)} tone={(agent.sla_at_risk ?? 0) > 0 ? "text-amber-300" : undefined} />
                  <Stat label="Breached" value={String(agent.breached)} tone={agent.breached > 0 ? "text-rose-300" : undefined} />
                  <Stat label="Overdue (open)" value={String(agent.overdue)} tone={agent.overdue > 0 ? "text-rose-300" : undefined} />
                  <Stat label="Completed within SLA" value={String(agent.sla_completed_within ?? agent.on_time)} />
                  <Stat label="Completed outside SLA" value={String(agent.sla_completed_outside ?? agent.breached)} />
                </div>
                <Button size="sm" variant="outline" onClick={() => onReviewSla(agent)}>Review SLA cases</Button>
              </TabsContent>

              {/* -------- Case history -------- */}
              <TabsContent value="history" className="mt-4 space-y-3">
                {casesLoading
                  ? <p className="text-xs text-muted-foreground">Loading history…</p>
                  : <CaseTable rows={history} empty="No completed cases in the selected range." />}
              </TabsContent>

              {/* -------- Activity -------- */}
              <TabsContent value="activity" className="mt-4 space-y-2">
                {activityLoading && <p className="text-xs text-muted-foreground">Loading activity…</p>}
                {!activityLoading && activity.length === 0 && (
                  <p className="text-xs text-muted-foreground">No recorded operational activity for this agent.</p>
                )}
                {activity.map((e) => (
                  <div key={e.id} className={cn(INNER_CARD_CLASS, "py-2")}>
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="text-foreground">{e.title}</span>
                      <span className="shrink-0 text-muted-foreground">{dt(e.at)}</span>
                    </div>
                    {e.detail && <div className="mt-0.5 text-[11px] text-muted-foreground">{e.detail}</div>}
                  </div>
                ))}
              </TabsContent>
            </Tabs>

            <div className="mt-6 flex flex-wrap gap-2 pb-6">
              <Button size="sm" variant="outline" onClick={() => onViewCases(agent)}>View current cases</Button>
              <Button size="sm" variant="outline" onClick={() => onViewOverdue(agent)}>View overdue cases</Button>
              <Button size="sm" variant="outline" onClick={() => onOpenOrchestration(agent)}>Open task orchestration</Button>
              <Button size="sm" variant="outline" onClick={() => onOpenUserRecord(agent)}>View user in Users &amp; Access</Button>
              <Button size="sm" variant="outline" onClick={() => onOpenAuditHistory(agent)}>View audit history</Button>
              <Button
                size="sm"
                onClick={() => onRebalance(agent)}
                disabled={!canRebalance}
                title={canRebalance ? "Preview a workload rebalance" : "You do not have rebalance permission"}
              >
                Rebalance workload
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
