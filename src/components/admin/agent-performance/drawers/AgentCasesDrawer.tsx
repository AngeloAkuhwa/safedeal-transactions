import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { EmptyState } from "../states/EmptyState";
import { ErrorState } from "../states/ErrorState";
import { fetchAgentCases, agentName, type AgentCaseRow, type AgentPerformanceRow } from "@/services/agent-performance.service";
import { FileSearch } from "lucide-react";

export function AgentCasesDrawer({
  agent, open, onOpenChange, slaOnly = false,
}: {
  agent: AgentPerformanceRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  slaOnly?: boolean;
}) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<AgentCaseRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!agent) return;
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchAgentCases(agent.user_id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load cases");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && agent) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, agent?.user_id]);

  const visible = slaOnly ? rows.filter((r) => r.is_overdue || r.sla_status === "breached") : rows;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader className="text-left">
          <SheetTitle>{slaOnly ? "SLA review" : "Assigned cases"}</SheetTitle>
          <SheetDescription>
            {agent ? agentName(agent) : ""} · {visible.length} {visible.length === 1 ? "case" : "cases"}
            {slaOnly ? " breaching or overdue" : " in the current workload"}
          </SheetDescription>
        </SheetHeader>

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
          {!loading && !error && visible.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => navigate(`/admin/task-orchestration?task=${c.id}`)}
              className={cn(
                "w-full rounded-xl border border-border/60 bg-background/60 p-4 text-left backdrop-blur-sm transition hover:border-primary/40",
                c.is_overdue && "ring-1 ring-inset ring-rose-500/30",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-mono text-[11px] text-muted-foreground">{c.task_code ?? c.id.slice(0, 8)}</div>
                  <div className="truncate text-sm font-medium text-foreground">{c.title ?? c.type ?? "Task"}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {c.stage ?? c.status} · due {c.due_at ? new Date(c.due_at).toLocaleString() : "—"}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Badge variant={c.is_overdue ? "destructive" : "secondary"} className="text-[10px]">
                    {c.is_overdue ? "Overdue" : (c.sla_status ?? "On track")}
                  </Badge>
                  {c.priority && <span className="text-[10px] uppercase text-muted-foreground">{c.priority}</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}