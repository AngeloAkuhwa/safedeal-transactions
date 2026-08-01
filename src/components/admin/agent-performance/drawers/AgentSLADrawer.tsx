import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { EmptyState } from "../states/EmptyState";
import { ErrorState } from "../states/ErrorState";
import { INNER_CARD_CLASS, hoursLabel, slaTone } from "../helpers";
import {
  fetchAgentCases, agentName,
  type AgentCaseRow, type AgentPerformanceRow,
} from "@/services/agent-performance.service";
import { ShieldCheck } from "lucide-react";

type SlaCase = AgentCaseRow & {
  targetHours: number | null;
  actualHours: number | null;
  hoursPastDue: number | null;
  bucket: "on_time" | "overdue" | "breached";
};

const HOUR = 3_600_000;
const round1 = (n: number) => Math.round(n * 10) / 10;

function classify(c: AgentCaseRow): SlaCase {
  const start = c.assigned_at ?? c.created_at;
  const startMs = start ? new Date(start).getTime() : null;
  const dueMs = c.due_at ? new Date(c.due_at).getTime() : null;
  const endMs = c.resolved_at ? new Date(c.resolved_at).getTime() : Date.now();

  const targetHours = startMs != null && dueMs != null ? round1((dueMs - startMs) / HOUR) : null;
  const actualHours = startMs != null ? round1((endMs - startMs) / HOUR) : null;
  const pastDueMs = dueMs != null ? endMs - dueMs : null;
  const hoursPastDue = pastDueMs != null && pastDueMs > 0 ? round1(pastDueMs / HOUR) : null;

  const bucket: SlaCase["bucket"] =
    String(c.sla_status) === "breached" || (!!c.resolved_at && hoursPastDue != null)
      ? "breached"
      : hoursPastDue != null || c.is_overdue
        ? "overdue"
        : "on_time";

  return { ...c, targetHours, actualHours, hoursPastDue, bucket };
}

const BUCKET_BADGE: Record<SlaCase["bucket"], { label: string; className: string }> = {
  on_time: { label: "On time", className: "bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/30" },
  overdue: { label: "Overdue", className: "bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-500/30" },
  breached: { label: "Breached", className: "bg-rose-500/15 text-rose-300 ring-1 ring-inset ring-rose-500/30" },
};

/**
 * SLA review for a single agent: compliance headline, on-time / overdue /
 * breached split, and per-case target vs actual with hours past due.
 */
export function AgentSLADrawer({
  agent, open, onOpenChange,
}: {
  agent: AgentPerformanceRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<AgentCaseRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bucket, setBucket] = useState<"all" | SlaCase["bucket"]>("all");

  const load = async () => {
    if (!agent) return;
    setLoading(true);
    setError(null);
    try {
      setRows((await fetchAgentCases(agent.user_id, filters)).cases);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load SLA data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && agent) { setBucket("all"); void load(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, agent?.user_id]);

  const cases = useMemo(() => rows.map(classify), [rows]);
  const counts = useMemo(() => ({
    on_time: cases.filter((c) => c.bucket === "on_time").length,
    overdue: cases.filter((c) => c.bucket === "overdue").length,
    breached: cases.filter((c) => c.bucket === "breached").length,
  }), [cases]);
  const compliance = cases.length
    ? round1((counts.on_time / cases.length) * 100)
    : (agent?.sla_compliance ?? 100);

  const visible = bucket === "all" ? cases : cases.filter((c) => c.bucket === bucket);

  const chips: { key: "all" | SlaCase["bucket"]; label: string; count: number }[] = [
    { key: "all", label: "All", count: cases.length },
    { key: "on_time", label: "On time", count: counts.on_time },
    { key: "overdue", label: "Overdue", count: counts.overdue },
    { key: "breached", label: "Breached", count: counts.breached },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader className="text-left">
          <SheetTitle>SLA review</SheetTitle>
          <SheetDescription>
            {agent ? agentName(agent) : ""} · target versus actual across the agent&rsquo;s cases
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4 pb-8">
          <div className={INNER_CARD_CLASS}>
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">SLA compliance</div>
                <div className={cn("text-3xl font-semibold tabular-nums", slaTone(compliance))}>{compliance}%</div>
              </div>
              <dl className="grid grid-cols-3 gap-3 text-right text-xs">
                <div>
                  <dt className="text-muted-foreground">On time</dt>
                  <dd className="text-sm font-semibold text-emerald-300 tabular-nums">{counts.on_time}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Overdue</dt>
                  <dd className="text-sm font-semibold text-amber-300 tabular-nums">{counts.overdue}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Breached</dt>
                  <dd className="text-sm font-semibold text-rose-300 tabular-nums">{counts.breached}</dd>
                </div>
              </dl>
            </div>
          </div>

          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter SLA cases">
            {chips.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setBucket(c.key)}
                aria-pressed={bucket === c.key}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  bucket === c.key
                    ? "border-primary/40 bg-primary/15 text-primary"
                    : "border-border/60 bg-background/60 text-muted-foreground hover:text-foreground",
                )}
              >
                {c.label} <span className="tabular-nums">({c.count})</span>
              </button>
            ))}
          </div>

          {loading && Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-muted/40" />
          ))}
          {!loading && error && <ErrorState message={error} onRetry={load} />}
          {!loading && !error && visible.length === 0 && (
            <EmptyState
              icon={ShieldCheck}
              title="Nothing to review"
              hint="No cases match this SLA filter for the agent."
            />
          )}

          {!loading && !error && visible.map((c) => {
            const badge = BUCKET_BADGE[c.bucket];
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => navigate(`/admin/task-orchestration?task=${c.id}`)}
                className={cn(
                  "w-full rounded-xl border border-border/60 bg-background/60 p-4 text-left backdrop-blur-sm transition hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  c.bucket === "breached" && "ring-1 ring-inset ring-rose-500/30",
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
                    <Badge className={cn("border-0 text-[10px]", badge.className)}>{badge.label}</Badge>
                    {Number(c.escalation_level ?? 0) > 0 && (
                      <span className="text-[10px] uppercase text-amber-300">Esc. L{c.escalation_level}</span>
                    )}
                  </div>
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-border/50 pt-3 text-xs">
                  <div>
                    <dt className="text-muted-foreground">SLA target</dt>
                    <dd className="font-medium text-foreground tabular-nums">{hoursLabel(c.targetHours)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Actual</dt>
                    <dd className="font-medium text-foreground tabular-nums">{hoursLabel(c.actualHours)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Past due</dt>
                    <dd className={cn("font-medium tabular-nums", c.hoursPastDue ? "text-rose-300" : "text-muted-foreground")}>
                      {c.hoursPastDue ? hoursLabel(c.hoursPastDue) : "—"}
                    </dd>
                  </div>
                </dl>
              </button>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
