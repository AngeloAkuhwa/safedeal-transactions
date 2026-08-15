import { useMemo, useState } from "react";
import { Filter, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  CARD_CLASS, humanize, initialsOf, relative, shortNameOf,
  slaBadgeClass, slaLabel, statusChip,
} from "./helpers";
import type { AgentRosterEntry, LiveTask } from "@/services/task-orchestration.service";

const SLA_FILTERS = [
  { value: "all",      label: "All SLAs" },
  { value: "on_track", label: "On Track" },
  { value: "at_risk",  label: "At Risk" },
  { value: "overdue",  label: "Overdue" },
];
const STATUS_FILTERS = [
  { value: "all",              label: "All statuses" },
  { value: "in_progress",      label: "In Progress" },
  { value: "waiting_external", label: "Waiting on External" },
  { value: "pending_approval", label: "Pending Approval" },
  { value: "escalated",        label: "Escalated" },
];

export function LiveTaskProgression({
  tasks, roster, onView, onReassign, canReassign,
}: {
  tasks: LiveTask[];
  roster: AgentRosterEntry[];
  onView: (t: LiveTask) => void;
  onReassign?: (t: LiveTask) => void;
  canReassign?: boolean;
}) {
  const rosterById = useMemo(() => new Map(roster.map(r => [r.user_id, r])), [roster]);
  const [sla, setSla] = useState("all");
  const [status, setStatus] = useState("all");

  const filtered = useMemo(() => tasks.filter(t => {
    if (sla !== "all") {
      if (sla === "overdue" && !(t.sla_status === "overdue" || t.sla_status === "breached")) return false;
      if (sla === "at_risk"  && t.sla_status !== "at_risk") return false;
      if (sla === "on_track" && t.sla_status !== "on_track" && t.sla_status !== "in_sla") return false;
    }
    if (status !== "all") {
      const s = (t.status ?? "").toLowerCase();
      if (status === "in_progress"      && s !== "in_progress") return false;
      if (status === "escalated"        && s !== "escalated") return false;
      if (status === "pending_approval" && s !== "pending_approval") return false;
      if (status === "waiting_external" && !s.startsWith("waiting_on_")) return false;
    }
    return true;
  }), [tasks, sla, status]);

  const activeCount = (sla !== "all" ? 1 : 0) + (status !== "all" ? 1 : 0);

  return (
    <section className={CARD_CLASS}>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Live Task Progression</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Active work across the floor</p>
        </div>
        <div className="flex items-center gap-3">
          <Popover>
            <PopoverTrigger asChild>
              <button className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition min-h-11",
                activeCount > 0
                  ? "border-primary/40 bg-primary/[0.06] text-foreground"
                  : "border-border/60 bg-background/60 text-muted-foreground hover:text-foreground",
              )}>
                <Filter className="h-3 w-3" /> Filter
                {activeCount > 0 && (
                  <span className="ml-0.5 rounded-full bg-primary/20 px-1.5 text-[9px] font-semibold tabular-nums text-primary">
                    {activeCount}
                  </span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 p-2">
              <FilterGroup title="SLA"    value={sla}    options={SLA_FILTERS}    onChange={setSla} />
              <div className="my-2 h-px bg-border/60" />
              <FilterGroup title="Status" value={status} options={STATUS_FILTERS} onChange={setStatus} />
              {activeCount > 0 && (
                <Button
                  variant="ghost" size="sm"
                  className="mt-2 w-full text-[11px]"
                  onClick={() => { setSla("all"); setStatus("all"); }}
                >
                  Clear filters
                </Button>
              )}
            </PopoverContent>
          </Popover>
          <span className="text-xs font-medium text-primary tabular-nums">
            {filtered.length}{filtered.length !== tasks.length ? ` of ${tasks.length}` : ""}
          </span>
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border/60 bg-background/40">
        <table className="w-full border-collapse text-left text-sm sd-stack">
          <thead className="sticky top-0 bg-background/80 backdrop-blur">
            <tr className="border-b border-border/60 text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3 font-semibold">Task ID</th>
              <th className="px-2 py-3 font-semibold">Agent</th>
              <th className="px-2 py-3 font-semibold">Case Ref</th>
              <th className="px-2 py-3 font-semibold">Stage</th>
              <th className="px-2 py-3 font-semibold">Started</th>
              <th className="px-2 py-3 font-semibold">Last Updated</th>
              <th className="px-2 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 text-right font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                {tasks.length === 0 ? "No active tasks." : "No tasks match the current filters."}
              </td></tr>
            )}
            {filtered.map(t => {
              const agent = t.assigned_agent_id ? rosterById.get(t.assigned_agent_id) : null;
              const chip = statusChip(t.status ?? "");
              return (
                <tr key={t.id} className="border-b border-border/40 transition-colors hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium text-foreground">#{t.task_code}</td>
                  <td className="px-2 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                        {agent?.avatar_url
                          ? <img src={agent.avatar_url} className="h-full w-full rounded-full object-cover" alt="" />
                          : initialsOf(agent)}
                      </div>
                      <span className="text-xs text-muted-foreground">{shortNameOf(agent)}</span>
                    </div>
                  </td>
                  <td className="px-2 py-3 text-xs text-muted-foreground">{t.dispute_id ? `#${t.dispute_id.slice(0,8)}` : "—"}</td>
                  <td className="px-2 py-3 text-xs text-muted-foreground">{humanize(t.stage)}</td>
                  <td className="px-2 py-3 text-xs text-muted-foreground">{relative(t.started_at)}</td>
                  <td className="px-2 py-3 text-xs text-muted-foreground">{relative(t.updated_at)}</td>
                  <td className="px-2 py-3">
                    <div className="flex flex-wrap items-center gap-1">
                      <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold", slaBadgeClass(t.sla_status))}>
                        {slaLabel(t.sla_status)}
                      </span>
                      {chip && (
                        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold", chip.className)}>
                          {chip.label}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-3">
                      {canReassign && onReassign && t.assigned_agent_id && (
                        <button
                          onClick={() => onReassign(t)}
                          className="text-xs font-medium text-amber-300 transition-colors hover:text-amber-200"
                        >
                          Reassign
                        </button>
                      )}
                      <button onClick={() => onView(t)} className="text-xs font-medium text-primary transition-colors hover:text-foreground">
                        View
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FilterGroup({ title, value, options, onChange }: {
  title: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <div className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</div>
      <div className="space-y-0.5">
        {options.map(o => (
          <button
            key={o.value} type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs transition min-h-11",
              value === o.value ? "bg-primary/[0.08] text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            {o.label}
            {value === o.value && <Check className="h-3 w-3 text-primary" />}
          </button>
        ))}
      </div>
    </div>
  );
}