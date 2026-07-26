import { useEffect, useMemo, useState } from "react";
import { Loader2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { shortNameOf } from "../helpers";
import type { AgentRosterEntry } from "@/services/task-orchestration.service";

export interface AutoAssignPlanRow {
  task_id: string;
  task_code: string;
  agent_id: string;
  reason: string;
}

export function AutoAssignPreviewDrawer({
  open, onOpenChange, pending, plan, roster, mode, onConfirm, submitting,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pending: number;
  plan: AutoAssignPlanRow[];
  roster: AgentRosterEntry[];
  mode: string;
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
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Auto-assign preview</SheetTitle>
          <SheetDescription>
            Mode: <span className="font-medium text-foreground">{mode}</span> · Dry-run against current queue. Uncheck any proposal to exclude it.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <Kpi label="Pending" value={pending} tone="text-foreground" />
          <Kpi label="Will assign" value={wouldAssign} tone="text-emerald-300" />
          <Kpi label="Remain unassigned" value={wouldRemain} tone="text-amber-300" />
        </div>

        <div className="mt-4 max-h-[55vh] space-y-1.5 overflow-y-auto pr-1">
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
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/40 p-3 text-sm transition ${off ? "opacity-50" : ""}`}>
                <div className="flex items-center gap-3">
                  <Checkbox checked={!off} onCheckedChange={() => toggle(p.task_id)} />
                  <div>
                    <div className="font-medium text-foreground">#{p.task_code}</div>
                    <div className="text-[11px] text-muted-foreground">{p.reason}</div>
                  </div>
                </div>
                <div className="text-right text-xs">
                  <div className="text-muted-foreground">→</div>
                  <div className="font-medium text-foreground">{agent ? shortNameOf(agent) : p.agent_id.slice(0,8)}</div>
                  {agent && <div className="text-[10px] text-muted-foreground">{agent.active}/{agent.max_active} active</div>}
                </div>
              </label>
            );
          })}
        </div>

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
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-xl font-bold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}