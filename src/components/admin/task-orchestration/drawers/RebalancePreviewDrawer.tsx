import { useEffect, useMemo, useState } from "react";
import { Loader2, ArrowLeftRight, AlertTriangle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { humanize, priorityBadgeClass, shortNameOf, slaBadgeClass, slaLabel } from "../helpers";
import { cn } from "@/lib/utils";
import type { AgentRosterEntry, RebalanceMove } from "@/services/task-orchestration.service";

const SKIP_REASON: Record<string, string> = {
  final_decision_locked: "Task is in Final Decision — cannot move",
  approval_or_escalated: "Pending approval or escalated — cannot move",
  locked_by_action: "Currently locked by another action",
  continuity_required: "Continuity required — same-agent hand-off protected",
  no_eligible_target: "No eligible target with matching skills / capacity",
};

export function RebalancePreviewDrawer({
  open, onOpenChange, roster, plan = [], skipped = [], onConfirm, submitting,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  roster: AgentRosterEntry[];
  plan?: RebalanceMove[];
  skipped?: Array<{ task_id: string; task_code: string; reason: string }>;
  onConfirm: (payload: { excludeMoveIds: string[]; reason: string }) => void;
  submitting: boolean;
}) {
  const rosterById = useMemo(() => new Map(roster.map(r => [r.user_id, r])), [roster]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("");
  useEffect(() => { if (open) { setExcluded(new Set()); setReason(""); } }, [open, plan]);

  const toggle = (id: string) => setExcluded(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const willMove = plan.length - excluded.size;
  const reasonOk = reason.trim().length >= 8;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Rebalance preview</SheetTitle>
          <SheetDescription>
            {plan.length} proposed movement{plan.length === 1 ? "" : "s"}. Uncheck any you want to skip. A short reason (≥ 8 chars) is required.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <Kpi label="Proposed" value={plan.length} tone="text-foreground" />
          <Kpi label="Will move" value={willMove} tone="text-emerald-300" />
          <Kpi label="Skipped (safe)" value={skipped.length} tone="text-amber-300" />
        </div>

        <div className="mt-5 mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <ArrowLeftRight className="h-3 w-3" /> Movements
        </div>
        <div className="space-y-1.5">
          {plan.length === 0 && (
            <div className="rounded-xl border border-dashed border-border/60 bg-background/40 p-6 text-center text-xs text-muted-foreground">
              No safe movements found. Load is already balanced or targets don't meet the skill requirements.
            </div>
          )}
          {plan.map(m => {
            const from = rosterById.get(m.from);
            const to = rosterById.get(m.to);
            const off = excluded.has(m.task_id);
            return (
              <label
                key={m.task_id}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-xl border border-border/60 bg-card/40 p-3 text-sm transition hover:border-primary/40",
                  off && "opacity-50",
                )}
              >
                <Checkbox className="mt-0.5" checked={!off} onCheckedChange={() => toggle(m.task_id)} />
                <div className="flex-1 min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">#{m.task_code}</span>
                    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold", priorityBadgeClass(m.priority as any))}>
                      {humanize(m.priority)}
                    </span>
                    {m.sla_delta && (
                      <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold", slaBadgeClass(m.sla_delta))}>
                        SLA {slaLabel(m.sla_delta)}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">· {humanize(m.reason)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="truncate">{from ? shortNameOf(from) : m.from.slice(0,8)}</span>
                    <ArrowRight className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate font-medium text-foreground">{to ? shortNameOf(to) : m.to.slice(0,8)}</span>
                    {to && (
                      <span className="ml-1 text-xs">({to.active} → {to.active + 1} / {to.max_active})</span>
                    )}
                  </div>
                </div>
              </label>
            );
          })}
        </div>

        {skipped.length > 0 && (
          <>
            <div className="mt-5 mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <AlertTriangle className="h-3 w-3 text-amber-400" /> Protected — cannot move
              <span className="rounded-full bg-muted/60 px-1.5 py-0.5 text-xs tabular-nums">{skipped.length}</span>
            </div>
            <div className="space-y-1">
              {skipped.map(s => (
                <div key={s.task_id} className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-500/[0.04] px-3 py-2 text-xs">
                  <span className="font-medium text-foreground">#{s.task_code}</span>
                  <span className="text-muted-foreground">{SKIP_REASON[s.reason] ?? humanize(s.reason)}</span>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="mt-5">
          <Label className="mb-1 block text-xs">Reason for rebalance (required, ≥ 8 chars)</Label>
          <Textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="e.g. rebalance after two agents went offline"
            rows={2}
          />
        </div>

        <div className="mt-4 flex justify-end gap-2 border-t border-border/50 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => onConfirm({ excludeMoveIds: [...excluded], reason })}
            disabled={submitting || willMove === 0 || !reasonOk}
          >
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowLeftRight className="mr-2 h-4 w-4" />}
            Apply {willMove} move{willMove === 1 ? "" : "s"}
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