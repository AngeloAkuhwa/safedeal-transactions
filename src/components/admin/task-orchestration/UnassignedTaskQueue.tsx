import { useMemo } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CARD_CLASS, currencyFmt, humanize, priorityBadgeClass, relativeShort, shortNameOf,
  slaBadgeClass, slaLabel,
} from "./helpers";
import { TaskQueueFilters, type QueueFilters } from "./TaskQueueFilters";
import type { AgentRosterEntry, UnassignedTask, QueuePage } from "@/services/task-orchestration.service";

export function UnassignedTaskQueue({
  tasks, page, selectedIds, onToggle, onToggleAll, onSelectAllMatching,
  onAssignRow, onOpenDetail, filters, onFiltersChange, roster,
  selectingAllMatching,
}: {
  tasks: UnassignedTask[];
  page?: QueuePage;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (checked: boolean) => void;
  onSelectAllMatching?: (matchingIds: string[]) => void;
  onAssignRow: (task: UnassignedTask) => void;
  onOpenDetail: (task: UnassignedTask) => void;
  filters: QueueFilters;
  onFiltersChange: (patch: Partial<QueueFilters>) => void;
  roster: AgentRosterEntry[];
  selectingAllMatching?: boolean;
}) {
  const rosterById = useMemo(() => new Map(roster.map(r => [r.user_id, r])), [roster]);
  const types = useMemo(() => Array.from(new Set(tasks.map(t => t.type))).sort(), [tasks]);
  const stages = useMemo(() => Array.from(new Set(tasks.map(t => t.stage).filter(Boolean) as string[])).sort(), [tasks]);
  const queues = useMemo(() => Array.from(new Set(tasks.map(t => t.queue).filter(Boolean) as string[])).sort(), [tasks]);
  const requiredRoles = useMemo(() => Array.from(new Set(tasks.map(t => t.required_role).filter(Boolean) as string[])).sort(), [tasks]);

  const total = page?.total ?? tasks.length;
  const perPage = page?.per_page ?? filters.perPage ?? 25;
  const pageNum = page?.page ?? filters.page ?? 1;
  const startIdx = total === 0 ? 0 : (pageNum - 1) * perPage + 1;
  const endIdx = Math.min(pageNum * perPage, total);
  const pageAllChecked = tasks.length > 0 && tasks.every(t => selectedIds.has(t.id));
  const matchingIds = page?.matching_ids ?? tasks.map(t => t.id);
  const canSelectMatching = matchingIds.length > tasks.length;

  const sort = (col: string) => {
    if (filters.sortBy === col) {
      onFiltersChange({ sortDir: filters.sortDir === "asc" ? "desc" : "asc" });
    } else {
      onFiltersChange({ sortBy: col, sortDir: "desc" });
    }
  };

  return (
    <section className={CARD_CLASS}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Unassigned Task Queue</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Showing <span className="font-medium text-foreground">{startIdx}–{endIdx}</span> of{" "}
            <span className="font-medium text-foreground">{total}</span>
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <label className="flex items-center gap-1.5 text-muted-foreground">
            Rows
            <select
              value={perPage}
              onChange={e => onFiltersChange({ perPage: Number(e.target.value), page: 1 })}
              className="rounded border border-border/60 bg-background/60 px-1.5 py-0.5 min-h-11"
            >
              {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="mb-4">
        <TaskQueueFilters
          filters={filters}
          onChange={onFiltersChange}
          types={types}
          stages={stages}
          queues={queues}
          requiredRoles={requiredRoles}
        />
      </div>

      {/* Selection bar */}
      {selectedIds.size > 0 && (
        <div className="mb-3 flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
          <span>
            <span className="font-semibold text-foreground">{selectedIds.size}</span> selected
            {selectingAllMatching ? " (all matching)" : " on this page"}
          </span>
          {canSelectMatching && !selectingAllMatching && onSelectAllMatching && (
            <button
              className="text-primary hover:underline"
              onClick={() => onSelectAllMatching(matchingIds)}
            >
              Select all {matchingIds.length} matching results
            </button>
          )}
          <button className="text-muted-foreground hover:text-foreground" onClick={() => onToggleAll(false)}>
            Clear selection
          </button>
        </div>
      )}

      {/* Desktop table */}
      <div className="hidden overflow-x-auto rounded-xl border border-border/60 bg-background/40 md:block">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="sticky top-0 bg-background/80 backdrop-blur">
            <tr className="border-b border-border/60 text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3 font-semibold">
                <Checkbox checked={pageAllChecked} onCheckedChange={c => onToggleAll(!!c)} />
              </th>
              <Th label="Task ID" col="task_code" filters={filters} onSort={sort} />
              <th className="px-2 py-3 font-semibold">Case Ref</th>
              <th className="px-2 py-3 font-semibold">Type</th>
              <Th label="Priority" col="priority" filters={filters} onSort={sort} />
              <th className="px-2 py-3 font-semibold">Stage</th>
              <th className="px-2 py-3 font-semibold">SLA</th>
              <Th label="Age" col="created_at" filters={filters} onSort={sort} />
              <Th label="Amount" col="amount" filters={filters} onSort={sort} />
              <th className="px-2 py-3 font-semibold">Queue</th>
              <th className="px-2 py-3 font-semibold">Suggested</th>
              <th className="px-4 py-3 text-right font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {tasks.length === 0 && (
              <tr><td colSpan={12} className="py-10 text-center text-sm text-muted-foreground">No unassigned tasks match these filters.</td></tr>
            )}
            {tasks.map(t => {
              const suggested = t.suggested_agent_id ? rosterById.get(t.suggested_agent_id) : null;
              return (
                <tr key={t.id} className="border-b border-border/40 transition-colors hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Checkbox checked={selectedIds.has(t.id)} onCheckedChange={() => onToggle(t.id)} />
                  </td>
                  <td className="px-2 py-3">
                    <button onClick={() => onOpenDetail(t)} className="text-left font-medium text-foreground transition hover:text-primary">
                      #{t.task_code}
                    </button>
                  </td>
                  <td className="px-2 py-3 text-[11px] text-muted-foreground">
                    {t.dispute_id ? `D-${t.dispute_id.slice(0, 8)}` : t.transaction_id ? `T-${t.transaction_id.slice(0, 8)}` : "—"}
                  </td>
                  <td className="px-2 py-3 text-xs text-muted-foreground">{humanize(t.type)}</td>
                  <td className="px-2 py-3">
                    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold", priorityBadgeClass(t.priority))}>
                      {humanize(t.priority)}
                    </span>
                  </td>
                  <td className="px-2 py-3 text-xs text-muted-foreground">{t.stage ? humanize(t.stage) : "—"}</td>
                  <td className="px-2 py-3">
                    {t.sla_status ? (
                      <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold", slaBadgeClass(t.sla_status))}>
                        {slaLabel(t.sla_status)}
                      </span>
                    ) : "—"}
                    {t.sla_due_at && <div className="mt-0.5 text-[10px] text-muted-foreground">Due {relativeShort(t.sla_due_at)}</div>}
                  </td>
                  <td className="px-2 py-3 text-xs text-muted-foreground">{relativeShort(t.created_at)}</td>
                  <td className="px-2 py-3 font-medium tabular-nums">{currencyFmt(t.amount, t.currency)}</td>
                  <td className="px-2 py-3 text-[11px] text-muted-foreground">{t.queue ? humanize(t.queue) : "Default"}</td>
                  <td className="px-2 py-3 text-[11px] text-muted-foreground">{suggested ? shortNameOf(suggested) : "Auto"}</td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" onClick={() => onAssignRow(t)} className="h-11 px-3 text-xs">Assign</Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {tasks.length === 0 && (
          <div className="rounded-xl border border-dashed border-border/60 bg-background/40 p-6 text-center text-sm text-muted-foreground">
            No unassigned tasks.
          </div>
        )}
        {tasks.map(t => {
          const suggested = t.suggested_agent_id ? rosterById.get(t.suggested_agent_id) : null;
          return (
            <div key={t.id} className="rounded-xl border border-border/60 bg-background/40 p-4">
              <div className="mb-2 flex items-start justify-between gap-3">
                <button onClick={() => onOpenDetail(t)} className="text-left">
                  <div className="font-medium text-foreground">#{t.task_code}</div>
                  {t.dispute_id && <div className="text-[11px] text-muted-foreground">Dispute D-{t.dispute_id.slice(0, 8)}</div>}
                </button>
                <Checkbox checked={selectedIds.has(t.id)} onCheckedChange={() => onToggle(t.id)} />
              </div>
              <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span className={cn("inline-flex rounded-full px-2 py-0.5 font-semibold", priorityBadgeClass(t.priority))}>{humanize(t.priority)}</span>
                <span>{humanize(t.type)}</span>
                {t.stage && <span>· {humanize(t.stage)}</span>}
                <span>· {relativeShort(t.created_at)}</span>
                <span>· <span className="font-medium text-foreground">{currencyFmt(t.amount, t.currency)}</span></span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Suggested: {suggested ? shortNameOf(suggested) : "Auto"}</span>
                <Button size="sm" onClick={() => onAssignRow(t)} className="h-11 px-3 text-xs">Assign</Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {total > perPage && (
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>Page {pageNum} of {Math.max(1, Math.ceil(total / perPage))}</span>
          <div className="flex items-center gap-2">
            <button
              disabled={pageNum <= 1}
              onClick={() => onFiltersChange({ page: pageNum - 1 })}
              className="rounded border border-border/60 bg-background/60 px-2 py-1 disabled:opacity-40 min-h-11"
            >
              <ChevronLeft className="h-3 w-3" />
            </button>
            <button
              disabled={pageNum * perPage >= total}
              onClick={() => onFiltersChange({ page: pageNum + 1 })}
              className="rounded border border-border/60 bg-background/60 px-2 py-1 disabled:opacity-40 min-h-11"
            >
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function Th({ label, col, filters, onSort }: { label: string; col: string; filters: QueueFilters; onSort: (c: string) => void }) {
  const active = filters.sortBy === col;
  return (
    <th className="px-2 py-3 font-semibold">
      <button onClick={() => onSort(col)} className={cn("inline-flex items-center gap-1 hover:text-foreground", active && "text-foreground")}>
        {label}
        <ArrowUpDown className={cn("h-3 w-3", active ? "opacity-100" : "opacity-40")} />
      </button>
    </th>
  );
}