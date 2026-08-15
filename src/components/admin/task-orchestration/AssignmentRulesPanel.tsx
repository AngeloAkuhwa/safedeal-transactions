import { useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCcw, Gauge, ShieldCheck, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CARD_CLASS, relative } from "./helpers";
import type { AssignmentRulesConfig } from "@/services/task-orchestration.service";

const FALLBACK_TARGETS = [
  { value: "senior_agent_pool", label: "Senior Agent Pool" },
  { value: "escalation_queue", label: "Escalation Queue" },
  { value: "super_admin", label: "Super Admin" },
  { value: "next_available", label: "Next Available (Any)" },
];

function RuleToggle({ label, desc, value, onChange, disabled }: { label: string; desc: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/40 p-4 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-foreground">{label}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{desc}</div>
        </div>
        <Switch checked={value} onCheckedChange={onChange} disabled={disabled} />
      </div>
    </div>
  );
}
function RuleNumber({ label, hint, value, unit, onChange, disabled }: { label: string; hint: string; value: number; unit: string; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/40 p-4 backdrop-blur-sm">
      <Label className="mb-2 block text-sm font-medium text-foreground">{label}</Label>
      <div className="flex items-center gap-3">
        <Input type="number" value={value} onChange={e => onChange(Number(e.target.value) || 0)} className="h-11 flex-1 bg-background/60" disabled={disabled} />
        <span className="text-xs text-muted-foreground">{unit}</span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

export function AssignmentRulesPanel({
  config, onReview, onTest, saving, testing, lastSavedAt, canManage,
  onRunAutoEscalate, onRunAutoReassign, runningEnforcement,
}: {
  config: AssignmentRulesConfig;
  onReview: (next: AssignmentRulesConfig) => void;
  onTest: () => void;
  saving: boolean;
  testing: boolean;
  lastSavedAt: string | null;
  canManage: boolean;
  onRunAutoEscalate?: () => void;
  onRunAutoReassign?: () => void;
  runningEnforcement?: string | null;
}) {
  const [draft, setDraft] = useState<AssignmentRulesConfig>(config);
  useEffect(() => setDraft(config), [config]);
  const set = <K extends keyof AssignmentRulesConfig>(k: K, v: AssignmentRulesConfig[K]) => setDraft(d => ({ ...d, [k]: v }));
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(config), [draft, config]);

  const toggles = [
    { key: "round_robin", label: "Round Robin Assignment", desc: "Distribute tasks evenly across all agents" },
    { key: "online_only", label: "Assign Only to Online Agents", desc: "Skip offline or unavailable agents" },
    { key: "skip_at_capacity", label: "Skip Agents at Capacity", desc: "Don't assign to agents who hit max active tasks" },
  ] as const;
  const toggles2 = [
    { key: "priority_to_senior_pool", label: "Priority Cases to Senior Pool", desc: "Route critical/high priority to senior agents only" },
    { key: "auto_escalate_stale", label: "Auto-Escalate Stale Tasks", desc: "Move unassigned tasks to escalation queue after timeout" },
    { key: "auto_reassign_on_offline", label: "Auto-Reassign on Agent Offline", desc: "Redistribute tasks when agent goes offline" },
  ] as const;

  return (
    <section className={CARD_CLASS}>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Assignment Rules &amp; Automation Controls</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Configure automated task distribution and assignment logic</p>
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-300">
          <Gauge className="h-3 w-3" /> Advanced Configuration
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="lg:col-span-2 rounded-xl border border-border/60 bg-background/40 p-4 backdrop-blur-sm">
          <Label className="mb-2 block text-sm font-medium text-foreground">Queue scope</Label>
          <div className="flex items-center gap-3">
            <Input value={(draft as any).queue_scope ?? "global"}
              onChange={e => set("queue_scope" as any, e.target.value as any)}
              placeholder="global" disabled={!canManage} className="h-11 max-w-[240px] bg-background/60" />
            <span className="text-xs text-muted-foreground">Applies these rules to a specific queue key. Defaults to <code>global</code>.</span>
          </div>
        </div>
        <div className="space-y-3">
          {toggles.map(t => (
            <RuleToggle key={t.key} label={t.label} desc={t.desc}
              value={!!draft[t.key]} onChange={v => set(t.key as any, v as any)} disabled={!canManage} />
          ))}
          <RuleNumber label="Maximum Active Disputes per Agent" hint='Agents will be marked "At Capacity" when reaching this limit'
            value={draft.max_active_per_agent ?? 5} unit="tasks"
            onChange={v => set("max_active_per_agent", v)} disabled={!canManage} />
          <RuleNumber label="Maximum Overdue Cases Before Skip" hint="Skip agents with this many overdue tasks in auto-assignment"
            value={draft.max_overdue_before_skip ?? 2} unit="cases"
            onChange={v => set("max_overdue_before_skip", v)} disabled={!canManage} />
        </div>
        <div className="space-y-3">
          {toggles2.map(t => (
            <RuleToggle key={t.key} label={t.label} desc={t.desc}
              value={!!draft[t.key]} onChange={v => set(t.key as any, v as any)} disabled={!canManage} />
          ))}
          {draft.auto_escalate_stale && (
            <div className="grid grid-cols-2 gap-3">
              <RuleNumber label="Stale after" hint="Escalate tasks unassigned this long"
                value={draft.stale_after_minutes ?? 30} unit="minutes"
                onChange={v => set("stale_after_minutes", v)} disabled={!canManage} />
              <div className="rounded-xl border border-border/60 bg-background/40 p-4 backdrop-blur-sm">
                <Label className="mb-2 block text-sm font-medium text-foreground">Escalation queue</Label>
                <Input value={draft.stale_escalation_queue ?? ""}
                  onChange={e => set("stale_escalation_queue", e.target.value)}
                  placeholder="senior_pool" disabled={!canManage} className="h-11 bg-background/60" />
                <p className="mt-2 text-xs text-muted-foreground">Target queue for stale-task escalation</p>
              </div>
            </div>
          )}
          {draft.auto_reassign_on_offline && (
            <RuleNumber label="Reassign after agent offline for"
              hint="Reassign tasks when the assignee has been offline this long"
              value={draft.offline_reassign_after_minutes ?? 15} unit="minutes"
              onChange={v => set("offline_reassign_after_minutes", v)} disabled={!canManage} />
          )}
          <div className="rounded-xl border border-border/60 bg-background/40 p-4 backdrop-blur-sm">
            <Label className="mb-2 block text-sm font-medium text-foreground">Fallback Assignment Target</Label>
            <Select value={draft.fallback_target ?? "senior_agent_pool"} onValueChange={v => set("fallback_target", v)} disabled={!canManage}>
              <SelectTrigger className="h-11 bg-background/60"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FALLBACK_TARGETS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="mt-2 text-xs text-muted-foreground">Where to assign when no eligible agents are available</p>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/40 p-4 backdrop-blur-sm">
            <Label className="mb-2 block text-sm font-medium text-foreground">Senior pool queue</Label>
            <Input value={draft.senior_pool_queue ?? ""}
              onChange={e => set("senior_pool_queue", e.target.value)}
              placeholder="senior_pool" disabled={!canManage} className="h-11 bg-background/60" />
            <p className="mt-2 text-xs text-muted-foreground">Queue key used by Priority Cases &amp; escalation routing</p>
          </div>
          <RuleToggle label="Super Admin Self-Assignment" desc="Allow super admin to override and assign to self"
            value={!!draft.super_admin_self_assign} onChange={v => set("super_admin_self_assign", v)} disabled={!canManage} />
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border/50 pt-5">
        <div className="flex items-center gap-2">
          <Button onClick={() => onReview(draft)} disabled={saving || !canManage || !dirty}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
            Review and Save Rules
          </Button>
          <Button variant="outline" onClick={onTest} disabled={testing || !canManage}>
            {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
            Test Configuration
          </Button>
          {onRunAutoEscalate && (
            <Button variant="ghost" size="sm" onClick={onRunAutoEscalate}
              disabled={!canManage || !draft.auto_escalate_stale || runningEnforcement === "escalate"}
              title={!draft.auto_escalate_stale ? "Enable Auto-Escalate Stale first" : ""}>
              {runningEnforcement === "escalate" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
              Run stale-escalation now
            </Button>
          )}
          {onRunAutoReassign && (
            <Button variant="ghost" size="sm" onClick={onRunAutoReassign}
              disabled={!canManage || !draft.auto_reassign_on_offline || runningEnforcement === "reassign"}
              title={!draft.auto_reassign_on_offline ? "Enable Auto-Reassign on Offline first" : ""}>
              {runningEnforcement === "reassign" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
              Run offline-reassign now
            </Button>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {dirty ? "Unsaved changes" : lastSavedAt ? `Last saved: ${relative(lastSavedAt)}` : "Not saved yet"}
        </div>
      </div>
    </section>
  );
}