import { useMemo } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CARD_CLASS, currencyFmt, humanize, priorityBadgeClass, relativeShort, shortNameOf,
} from "./helpers";
import { TaskQueueFilters, filterQueue, type QueueFilters } from "./TaskQueueFilters";
import type { AgentRosterEntry, UnassignedTask } from "@/services/task-orchestration.service";

export function UnassignedTaskQueue({
  tasks, selectedIds, onToggle, onToggleAll, onAssignRow, onOpenDetail,
  filters, onFiltersChange, roster,
}: {
  tasks: UnassignedTask[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (checked: boolean) => void;
  onAssignRow: (task: UnassignedTask) => void;
  onOpenDetail: (task: UnassignedTask) => void;
  filters: QueueFilters;
  onFiltersChange: (patch: Partial<QueueFilters>) => void;
  roster: AgentRosterEntry[];
}) {
  const rosterById = useMemo(() => new Map(roster.map(r => [r.user_id, r])), [roster]);
  const types = useMemo(() => Array.from(new Set(tasks.map(t => t.type))).sort(), [tasks]);
  const filtered = useMemo(() => filterQueue(tasks, filters), [tasks, filters]);
  const allChecked = filtered.length > 0 && filtered.every(t => selectedIds.has(t.id));

  return (
    <section className={CARD_CLASS}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Unassigned Task Queue</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{filtered.length} of {tasks.length} shown</p>
        </div>
        <span className="text-xs font-medium text-primary">View All ({tasks.length})</span>
      </div>

      <div className="mb-4">
        <TaskQueueFilters filters={filters} onChange={onFiltersChange} types={types} />
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto rounded-xl border border-border/60 bg-background/40 md:block">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="sticky top-0 bg-background/80 backdrop-blur">
            <tr className="border-b border-border/60 text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3 font-semibold">
                <Checkbox checked={allChecked} onCheckedChange={c => onToggleAll(!!c)} />
              </th>
              <th className="px-2 py-3 font-semibold">Task / Dispute</th>
              <th className="px-2 py-3 font-semibold">Type</th>
              <th className="px-2 py-3 font-semibold">Priority</th>
              <th className="px-2 py-3 font-semibold">Age</th>
              <th className="px-2 py-3 font-semibold">Amount</th>
              <th className="px-2 py-3 font-semibold">Suggested</th>
              <th className="px-4 py-3 text-right font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="py-10 text-center text-sm text-muted-foreground">No unassigned tasks match these filters.</td></tr>
            )}
            {filtered.map(t => {
              const suggested = t.suggested_agent_id ? rosterById.get(t.suggested_agent_id) : null;
              return (
                <tr key={t.id} className="border-b border-border/40 transition-colors hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Checkbox checked={selectedIds.has(t.id)} onCheckedChange={() => onToggle(t.id)} />
                  </td>
                  <td className="px-2 py-3">
                    <button onClick={() => onOpenDetail(t)} className="text-left transition hover:text-primary">
                      <div className="font-medium text-foreground">#{t.task_code}</div>
                      {t.dispute_id && <div className="text-[11px] text-muted-foreground">Dispute #{t.dispute_id.slice(0, 8)}</div>}
                    </button>
                  </td>
                  <td className="px-2 py-3 text-xs text-muted-foreground">{humanize(t.type)}</td>
                  <td className="px-2 py-3">
                    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold", priorityBadgeClass(t.priority))}>
                      {humanize(t.priority)}
                    </span>
                  </td>
                  <td className="px-2 py-3 text-xs text-muted-foreground">{relativeShort(t.created_at)}</td>
                  <td className="px-2 py-3 font-medium tabular-nums">{currencyFmt(t.amount, t.currency)}</td>
                  <td className="px-2 py-3 text-[11px] text-muted-foreground">{suggested ? shortNameOf(suggested) : "Auto"}</td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" onClick={() => onAssignRow(t)} className="h-7 px-3 text-xs">Assign</Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {filtered.length === 0 && (
          <div className="rounded-xl border border-dashed border-border/60 bg-background/40 p-6 text-center text-sm text-muted-foreground">
            No unassigned tasks.
          </div>
        )}
        {filtered.map(t => {
          const suggested = t.suggested_agent_id ? rosterById.get(t.suggested_agent_id) : null;
          return (
            <div key={t.id} className="rounded-xl border border-border/60 bg-background/40 p-4">
              <div className="mb-2 flex items-start justify-between gap-3">
                <button onClick={() => onOpenDetail(t)} className="text-left">
                  <div className="font-medium text-foreground">#{t.task_code}</div>
                  {t.dispute_id && <div className="text-[11px] text-muted-foreground">Dispute #{t.dispute_id.slice(0, 8)}</div>}
                </button>
                <Checkbox checked={selectedIds.has(t.id)} onCheckedChange={() => onToggle(t.id)} />
              </div>
              <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span className={cn("inline-flex rounded-full px-2 py-0.5 font-semibold", priorityBadgeClass(t.priority))}>{humanize(t.priority)}</span>
                <span>{humanize(t.type)}</span>
                <span>· {relativeShort(t.created_at)}</span>
                <span>· <span className="font-medium text-foreground">{currencyFmt(t.amount, t.currency)}</span></span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Suggested: {suggested ? shortNameOf(suggested) : "Auto"}</span>
                <Button size="sm" onClick={() => onAssignRow(t)} className="h-7 px-3 text-xs">Assign</Button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}