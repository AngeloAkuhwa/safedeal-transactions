import { useEffect, useMemo, useState } from "react";
import { Loader2, RotateCw, TrendingUp, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { humanize, shortNameOf } from "../helpers";
import type { AgentRosterEntry } from "@/services/task-orchestration.service";
import { ADMIN_TONE } from "@/components/admin/palette";

export interface AutoAssignPlanRow {
  task_id: string;
  task_code: string;
  agent_id: string;
  reason: string;
}

export interface AgentLoadRow {
  agent_id: string;
  current: number;
  projected: number;
  max: number;
}
export interface UnmatchedRow {
  task_id: string;
  task_code: string;
  reason: string;
}

const REASON_TEXT: Record<string, string> = {
  no_available_seats: "No agent has an open seat",
  no_eligible_agent_with_skill: "No agent holds the required permission/skill",
};

export function AutoAssignPreviewDrawer({
  open, onOpenChange, pending, plan, agentLoads = [], unmatched = [], roster, mode, scope,
  onConfirm, submitting,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pending: number;
  plan: AutoAssignPlanRow[];
  agentLoads?: AgentLoadRow[];
  unmatched?: UnmatchedRow[];
  roster: AgentRosterEntry[];
  mode: string;
  scope?: "queue" | "selection";
  onConfirm: (excludeTaskIds: string[]) => void;
  submitting: boolean;
}) {
  const rosterById = useMemo(() => new Map(roster.map(r => [r.user_id, r])), [roster]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  useEffect(() => { if (open) setExcluded(new Set()); }, [open, plan]);

  const toggle = (id: string) => setExcluded(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const wouldAssign = plan.length - excluded.size;
  const wouldRemain = Math.max(0, pending - wouldAssign);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Auto-assign preview</SheetTitle>
          <SheetDescription>
            Mode: <span className="font-medium text-foreground">{humanize(mode)}</span> ·
            Scope: <span className="font-medium text-foreground">{scope === "selection" ? "selected tasks" : "whole queue"}</span> ·
            Dry-run only. Uncheck any proposal to exclude it.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <Kpi label="Pending" value={pending} tone="text-foreground" />
          <Kpi label="Will assign" value={wouldAssign} tone="text-emerald-300" />
          <Kpi label="Remain unassigned" value={wouldRemain} tone={ADMIN_TONE.warning.text} />
        </div>

        <SectionHeader label="Proposed assignments" count={plan.length} icon={<RotateCw className="h-3 w-3" />} />
        <div className="space-y-1.5">
          {plan.length === 0 && (
            <div className="rounded-xl border border-dashed border-border/60 bg-background/40 p-6 text-center text-xs text-muted-foreground">
              No eligible proposals. Check agent capacity, availability, and skills.
            </div>
          )}
          {plan.map(p => {
            const agent = rosterById.get(p.agent_id);
            const off = excluded.has(p.task_id);
            return (
              <label key={p.task_id}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/40 p-3 text-sm transition hover:border-primary/40 ${off ? "opacity-50" : ""}`}>
                <div className="flex items-center gap-3">
                  <Checkbox checked={!off} onCheckedChange={() => toggle(p.task_id)} />
                  <div>
                    <div className="font-medium text-foreground">#{p.task_code}</div>
                    <div className="text-xs text-muted-foreground">{humanize(p.reason)}</div>
                  </div>
                </div>
                <div className="text-right text-xs">
                  <div className="text-muted-foreground">→</div>
                  <div className="font-medium text-foreground">{agent ? shortNameOf(agent) : p.agent_id.slice(0,8)}</div>
                  {agent && <div className="text-xs text-muted-foreground">{agent.active}/{agent.max_active} active</div>}
                </div>
              </label>
            );
          })}
        </div>

        {agentLoads.length > 0 && (
          <>
            <SectionHeader
              label="Projected agent load"
              count={agentLoads.length}
              icon={<TrendingUp className="h-3 w-3" />}
            />
            <div className="space-y-1">
              {agentLoads.map(l => {
                const agent = rosterById.get(l.agent_id);
                const delta = l.projected - l.current;
                const pct = l.max > 0 ? Math.min(100, Math.round((l.projected / l.max) * 100)) : 0;
                const barTone =
                  pct >= 100 ? "bg-rose-400" :
                  pct >= 80 ? ADMIN_TONE.warning.dot : "bg-emerald-400";
                return (
                  <div key={l.agent_id} className="rounded-lg border border-border/60 bg-card/30 p-2.5">
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="truncate font-medium text-foreground">{agent ? shortNameOf(agent) : l.agent_id.slice(0,8)}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {l.current} → <span className={delta > 0 ? "font-semibold text-foreground" : "text-muted-foreground"}>{l.projected}</span> / {l.max}
                        {delta !== 0 && <span className={`ml-1.5 ${delta > 0 ? ADMIN_TONE.warning.text : "text-emerald-300"}`}>({delta > 0 ? "+" : ""}{delta})</span>}
                      </span>
                    </div>
                    <div className="h-1 overflow-hidden rounded-full bg-border/60">
                      <div className={`h-full transition-all ${barTone}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {unmatched.length > 0 && (
          <>
            <SectionHeader
              label="Cannot place"
              count={unmatched.length}
              icon={<AlertCircle className="h-3 w-3 text-amber-400" />}
            />
            <div className="space-y-1">
              {unmatched.map(u => (
                <div key={u.task_id} className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-500/[0.04] px-3 py-2 text-xs">
                  <span className="font-medium text-foreground">#{u.task_code}</span>
                  <span className="text-muted-foreground">{REASON_TEXT[u.reason] ?? humanize(u.reason)}</span>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="mt-4 flex justify-end gap-2 border-t border-border/50 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onConfirm([...excluded])} disabled={submitting || wouldAssign === 0}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCw className="mr-2 h-4 w-4" />}
            Run {wouldAssign} assignment{wouldAssign === 1 ? "" : "s"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-xl font-bold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

function SectionHeader({ label, count, icon }: { label: string; count: number; icon?: React.ReactNode }) {
  return (
    <div className="mt-5 mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {icon}
      {label}
      <span className="rounded-full bg-muted/60 px-1.5 py-0.5 text-xs tabular-nums">{count}</span>
    </div>
  );
}