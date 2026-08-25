import { useEffect, useMemo, useState } from "react";
import { Loader2, ArrowLeftRight, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { nameOf, shortNameOf } from "../helpers";
import { ADMIN_TONE } from "@/components/admin/palette";
import type { AgentRosterEntry, LiveTask } from "@/services/task-orchestration.service";

export function ReassignTaskDrawer({
  open, onOpenChange, task, roster, canOverride, onConfirm, submitting,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  task: LiveTask | null;
  roster: AgentRosterEntry[];
  canOverride: boolean;
  onConfirm: (params: { agentId: string; reason: string; note: string; override: boolean }) => void;
  submitting: boolean;
}) {
  const currentAgent = useMemo(
    () => (task?.assigned_agent_id ? roster.find(r => r.user_id === task.assigned_agent_id) ?? null : null),
    [task, roster],
  );
  const [agentId, setAgentId] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [override, setOverride] = useState(false);

  useEffect(() => {
    if (open) { setAgentId(""); setReason(""); setNote(""); setOverride(false); }
  }, [open, task]);

  const eligible = roster.filter(a => a.availability !== "offline" && a.user_id !== task?.assigned_agent_id);
  const target = eligible.find(a => a.user_id === agentId);
  const capacityHit = target && target.max_active > 0 && target.active >= target.max_active;

  const reasonOk = reason.trim().length >= (override ? 8 : 4);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Reassign task</SheetTitle>
          <SheetDescription>
            Move #{task?.task_code} to a different agent. Both current and new agent will be notified.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {/* Impact preview */}
          <div className="grid grid-cols-2 gap-2">
            <ImpactBox title="Current" agent={currentAgent} delta={-1} />
            <ImpactBox title="New" agent={target ?? null} delta={+1} />
          </div>

          <div>
            <Label className="mb-1 block text-xs">New agent</Label>
            <Select value={agentId} onValueChange={setAgentId}>
              <SelectTrigger className="bg-background/60"><SelectValue placeholder="Choose agent" /></SelectTrigger>
              <SelectContent>
                {eligible.map(a => (
                  <SelectItem key={a.user_id} value={a.user_id}>
                    {nameOf(a)}: {a.active}/{a.max_active} active
                  </SelectItem>
                ))}
                {eligible.length === 0 && <SelectItem value="__none" disabled>No eligible agents</SelectItem>}
              </SelectContent>
            </Select>
          </div>

          {capacityHit && (
            <div className={`flex items-start gap-2 rounded-xl border ${ADMIN_TONE.warning.panel} p-3 text-xs text-amber-100`}>
              <TriangleAlert className="mt-0.5 h-4 w-4" />
              <div>
                Selected agent is at capacity ({target?.active}/{target?.max_active}).
                {canOverride ? (
                  <label className="mt-2 flex items-center gap-2">
                    <Checkbox checked={override} onCheckedChange={v => setOverride(!!v)} />
                    <span>Override capacity: reason must be ≥ 8 characters.</span>
                  </label>
                ) : (
                  <div className="mt-1">You do not hold <code>task_orchestration.override_capacity</code>.</div>
                )}
              </div>
            </div>
          )}

          <div>
            <Label className="mb-1 block text-xs">Reason (required)</Label>
            <Textarea value={reason} onChange={e => setReason(e.target.value)}
              placeholder="Why is this being reassigned?" rows={2} />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Handoff note (optional)</Label>
            <Textarea value={note} onChange={e => setNote(e.target.value)}
              placeholder="Context for the new agent…" rows={2} />
          </div>

          <div className="flex justify-end gap-2 border-t border-border/50 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              onClick={() => onConfirm({ agentId, reason, note, override: !!(capacityHit && override) })}
              disabled={submitting || !agentId || agentId === "__none" || !reasonOk || (capacityHit && !override)}
            >
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowLeftRight className="mr-2 h-4 w-4" />}
              Reassign
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ImpactBox({ title, agent, delta }: { title: string; agent: AgentRosterEntry | null; delta: number }) {
  const next = agent ? Math.max(0, agent.active + delta) : 0;
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{title}</div>
      <div className="mt-1 text-sm font-medium text-foreground">
        {agent ? shortNameOf(agent) : <span className="text-muted-foreground">—</span>}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {agent ? `${agent.active} → ${next} / ${agent.max_active}` : "no target selected"}
      </div>
    </div>
  );
}