import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { EmptyState } from "../states/EmptyState";
import { ErrorState } from "../states/ErrorState";
import {
  fetchAgentCases, agentName,
  type AgentCaseRow, type AgentPerformanceRow, type AgentPerformanceFilters,
} from "@/services/agent-performance.service";
import { FileSearch } from "lucide-react";

export function AgentCasesDrawer({
  agent, open, onOpenChange, slaOnly = false, filters,
}: {
  agent: AgentPerformanceRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  slaOnly?: boolean;
  /** Dashboard filters: inherited so the counts match the workload row. */
  filters?: AgentPerformanceFilters;
}) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<AgentCaseRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [hasMore, setHasMore] = useState(false);
  const [rangeLabel, setRangeLabel] = useState<string>("");
  const [scopeOverride, setScopeOverride] = useState<"range" | "all_time" | null>(null);
  const scope = scopeOverride ?? filters?.scope ?? "range";

  const load = async () => {
    if (!agent) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAgentCases(agent.user_id, { ...filters, scope }, page);
      setRows(res.cases);
      setTruncated(res.truncated);
      setTotal(res.total);
      setPageSize(res.page_size ?? 100);
      setHasMore(!!res.has_more);
      setRangeLabel(res.range.label);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load cases");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && agent) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, agent?.user_id, scope, filters?.range, filters?.date_from, filters?.date_to,
      filters?.case_priority, filters?.case_status, filters?.case_sla, page]);

  // Reset any local widening and paging whenever the drawer opens on a new agent.
  useEffect(() => { if (!open) { setScopeOverride(null); setPage(1); } }, [open]);
  useEffect(() => { setPage(1); }, [agent?.user_id, scope]);

  const visible = slaOnly ? rows.filter((r) => r.is_overdue || r.sla_status === "breached") : rows;
  const activeRows = visible.filter((r) => r.is_active);
  const resolvedRows = visible.filter((r) => !r.is_active);

  const openCase = (c: AgentCaseRow) => {
    if (c.source === "dispute") navigate(`/admin/disputes/${c.dispute_id ?? c.id}`);
    else navigate(`/admin/task-orchestration?task=${c.id}`);
  };

  const CaseCard = ({ c }: { c: AgentCaseRow }) => (
    <button
      type="button"
      onClick={() => openCase(c)}
      className={cn(
        "w-full rounded-xl border border-border/60 bg-background/60 p-4 text-left backdrop-blur-sm transition hover:border-primary/40",
        c.is_overdue && "ring-1 ring-inset ring-rose-500/30",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">
              {c.case_ref ?? c.task_code ?? c.id.slice(0, 8)}
            </span>
            <Badge variant="outline" className="text-xs capitalize">{c.source}</Badge>
          </div>
          <div className="truncate text-sm font-medium capitalize text-foreground">{c.title ?? c.type ?? "Case"}</div>
          <div className="mt-1 text-xs capitalize text-muted-foreground">
            {(c.stage ?? c.status ?? "").replace(/_/g, " ")}
            {" · "}
            {c.resolved_at
              ? `resolved ${new Date(c.resolved_at).toLocaleDateString()}`
              : c.due_at
                ? `due ${new Date(c.due_at).toLocaleString()}`
                : "no SLA configured"}
          </div>
          {c.decision_summary && (
            <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{c.decision_summary}</div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge variant={c.is_overdue ? "destructive" : "secondary"} className="text-xs capitalize">
            {c.is_overdue ? "Overdue" : ((c.outcome_type ?? c.sla_status ?? "On track") as string).replace(/_/g, " ")}
          </Badge>
          {c.priority && <span className="text-xs uppercase text-muted-foreground">{c.priority}</span>}
        </div>
      </div>
    </button>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader className="text-left">
          <SheetTitle>{slaOnly ? "SLA review" : "Assigned cases"}</SheetTitle>
          <SheetDescription>
             {agent ? agentName(agent) : ""} · {total || visible.length} {(total || visible.length) === 1 ? "case" : "cases"}
            {slaOnly ? " breaching or overdue" : " in the current workload"}
            {rangeLabel ? ` · ${rangeLabel}` : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-border/60 bg-background/60 p-0.5">
            {(["range", "all_time"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setScopeOverride(s)}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium transition min-h-11",
                  scope === s ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {s === "range" ? "In range" : "All time"}
              </button>
            ))}
          </div>
          {truncated && (
             <span className="text-xs text-amber-400">More results are available; narrow the filters to investigate the complete set.</span>
          )}
        </div>

        <div className="mt-6 space-y-3 pb-8">
          {loading && Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-muted/40" />
          ))}
          {!loading && error && <ErrorState message={error} onRetry={load} />}
          {!loading && !error && visible.length === 0 && (
            <EmptyState
              icon={FileSearch}
              title={slaOnly ? "No SLA breaches" : "No cases assigned"}
              hint={slaOnly ? "This agent has no overdue or breached cases." : "This agent currently has no tasks in the queue."}
            />
          )}
          {!loading && !error && activeRows.length > 0 && (
            <>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Active ({activeRows.length})
              </div>
              {activeRows.map((c) => <CaseCard key={`${c.source}-${c.id}`} c={c} />)}
            </>
          )}
          {!loading && !error && resolvedRows.length > 0 && (
            <>
              <div className="pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Resolved ({resolvedRows.length}){rangeLabel ? ` · ${rangeLabel}` : ""}
              </div>
              {resolvedRows.map((c) => <CaseCard key={`${c.source}-${c.id}`} c={c} />)}
            </>
          )}
          {!loading && !error && (total > pageSize || page > 1) && (
            <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
              <span>
                Showing {(page - 1) * pageSize + 1}–{(page - 1) * pageSize + rows.length} of {total}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  className="rounded-lg border border-border/70 bg-card/60 px-2 py-1 disabled:opacity-40 min-h-11"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={!hasMore}
                  onClick={() => setPage(page + 1)}
                  className="rounded-lg border border-border/70 bg-card/60 px-2 py-1 disabled:opacity-40 min-h-11"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}