import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AgentPerformanceHeader } from "@/components/admin/agent-performance/AgentPerformanceHeader";
import { AgentPerformanceSummary } from "@/components/admin/agent-performance/AgentPerformanceSummary";
import { ActiveFilterChips } from "@/components/admin/agent-performance/ActiveFilterChips";
import { workloadStatus } from "@/components/admin/agent-performance/workloadStatus";
import { AgentPerformanceTabs, type AgentTab } from "@/components/admin/agent-performance/AgentPerformanceTabs";
import { AgentPerformanceFilters } from "@/components/admin/agent-performance/AgentPerformanceFilters";
import { WorkloadTable } from "@/components/admin/agent-performance/WorkloadTable";
import { PerformanceDashboard } from "@/components/admin/agent-performance/PerformanceDashboard";
import { SLAComplianceTable } from "@/components/admin/agent-performance/SLAComplianceTable";
import { RankingsTable } from "@/components/admin/agent-performance/RankingsTable";
import { RankingsFilters } from "@/components/admin/agent-performance/RankingsFilters";
import { ScoreBreakdownDialog } from "@/components/admin/agent-performance/ScoreBreakdownDialog";
import { AgentDetailsDrawer } from "@/components/admin/agent-performance/drawers/AgentDetailsDrawer";
import { AgentCasesDrawer } from "@/components/admin/agent-performance/drawers/AgentCasesDrawer";
import { ExportPerformanceDialog } from "@/components/admin/agent-performance/drawers/ExportPerformanceDialog";
import { LoadingSkeleton } from "@/components/admin/agent-performance/states/LoadingSkeleton";
import { ErrorState } from "@/components/admin/agent-performance/states/ErrorState";
import { CARD_CLASS } from "@/components/admin/agent-performance/helpers";
import { toast } from "sonner";
import { ADMIN_TONE } from "@/components/admin/palette";
import {
  DEFAULT_AGENT_FILTERS, DEFAULT_SLA_QUERY, downloadCsv, exportAgentPerformance, fetchAgentPerformance,
  type AgentPerformanceFilters as Filters, type AgentPerformanceOverview, type AgentPerformanceRow,
  type SlaCaseRow, type SlaQuery,
} from "@/services/agent-performance.service";

const TAB_LABEL: Record<AgentTab, string> = {
  workload: "Workload",
  performance: "Performance",
  sla: "SLA Compliance",
  rankings: "Rankings",
};

const URL_FILTER_KEYS: (keyof Filters)[] = [
  "range", "scope", "date_from", "date_to", "team", "role", "availability", "sla",
  "overdue_only", "min_active", "min_overdue", "score_min", "score_max", "case_priority",
  "case_status", "case_sla", "case_stage", "workload_status", "search",
  "min_completed", "performance_level", "hide_insufficient",
];

function filtersFromParams(params: URLSearchParams): Filters {
  const next = { ...DEFAULT_AGENT_FILTERS };
  for (const key of URL_FILTER_KEYS) {
    const raw = params.get(key);
    if (raw == null) continue;
    if (["overdue_only", "hide_insufficient"].includes(key)) (next as Record<string, unknown>)[key] = raw === "true";
    else if (["min_active", "min_overdue", "score_min", "score_max", "min_completed"].includes(key)) (next as Record<string, unknown>)[key] = Number(raw);
    else (next as Record<string, unknown>)[key] = raw;
  }
  if (params.get("scope") === "all_time") next.scope = "all_time";
  return next;
}

export default function AdminAgentPerformance() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState<Filters>(() => filtersFromParams(searchParams));
  const [activeCard, setActiveCard] = useState<string | null>(null);
  const [tab, setTab] = useState<AgentTab>(
    (["workload", "performance", "sla", "rankings"] as const).includes(searchParams.get("tab") as AgentTab)
      ? (searchParams.get("tab") as AgentTab)
      : "workload",
  );
  const [slaState, setSlaState] = useState<string>(searchParams.get("sla_state") ?? "all");
  const [slaAgentId, setSlaAgentId] = useState<string>(searchParams.get("sla_agent") ?? "all");
  const [slaPriority, setSlaPriority] = useState<string>(searchParams.get("sla_priority") ?? "all");
  const [slaStage, setSlaStage] = useState<string>(searchParams.get("sla_stage") ?? "all");
  const [slaPage, setSlaPage] = useState<number>(Number(searchParams.get("sla_page") ?? 1) || 1);
  const [data, setData] = useState<AgentPerformanceOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [detailAgent, setDetailAgent] = useState<AgentPerformanceRow | null>(null);
  const [casesAgent, setCasesAgent] = useState<AgentPerformanceRow | null>(null);
  const [scoreAgent, setScoreAgent] = useState<AgentPerformanceRow | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const slaQuery: SlaQuery = useMemo(() => ({
    ...DEFAULT_SLA_QUERY,
    sla_states: slaState === "all" ? [] : slaState.split(","),
    sla_agent: slaAgentId,
    sla_priority: slaPriority,
    sla_stage: slaStage,
    sla_page: slaPage,
  }), [slaState, slaAgentId, slaPriority, slaStage, slaPage]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchAgentPerformance(filters, slaQuery));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load agent performance");
    } finally {
      setLoading(false);
    }
  }, [filters, slaQuery]);

  useEffect(() => { void load(); }, [load]);

  // Persist the complete investigation context so refresh/share reproduces it.
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    for (const key of URL_FILTER_KEYS) {
      const value = filters[key];
      const defaultValue = DEFAULT_AGENT_FILTERS[key];
      if (value == null || value === defaultValue || value === "") next.delete(key);
      else next.set(key, String(value));
    }
    if (tab !== "workload") next.set("tab", tab); else next.delete("tab");
    if (tab === "sla" && slaState !== "all") next.set("sla_state", slaState);
    else next.delete("sla_state");
    if (tab === "sla" && slaAgentId !== "all") next.set("sla_agent", slaAgentId);
    else next.delete("sla_agent");
    if (tab === "sla" && slaPriority !== "all") next.set("sla_priority", slaPriority);
    else next.delete("sla_priority");
    if (tab === "sla" && slaStage !== "all") next.set("sla_stage", slaStage);
    else next.delete("sla_stage");
    if (tab === "sla" && slaPage > 1) next.set("sla_page", String(slaPage));
    else next.delete("sla_page");
    if (next.toString() === searchParams.toString()) return;
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, tab, slaState, slaAgentId, slaPriority, slaStage, slaPage]);

  // Workload status is derived from capacity + availability on the client,
  // so this one filter is applied here rather than server-side.
  const agents = (data?.agents ?? []).filter(
    (a) => filters.workload_status === "all" || workloadStatus(a) === filters.workload_status,
  );
  const canExport = data?.permissions.can_export ?? false;
  const canRebalance = data?.permissions.can_rebalance ?? false;
  const canViewCases = data?.permissions.can_view_orchestration ?? false;
  const canReviewSla = (data?.permissions.can_view_orchestration ?? false) ||
    (data?.permissions.can_view_disputes ?? false);
  const filtersDirty = useMemo(
    () => JSON.stringify(filters) !== JSON.stringify(DEFAULT_AGENT_FILTERS),
    [filters],
  );
  const clearFilters = () => {
    setFilters({ ...DEFAULT_AGENT_FILTERS, scope: filters.scope });
    setActiveCard(null);
  };

  const patchFilters = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));

  const openRebalance = (a: AgentPerformanceRow) => {
    if (!canRebalance) {
      toast.error("You do not have permission to rebalance workloads.");
      return;
    }
    navigate(`/admin/task-orchestration?rebalance=1&agent=${a.user_id}`);
  };

  const openCases = (a: AgentPerformanceRow) => setCasesAgent(a);
  const openSla = (a: AgentPerformanceRow) => {
    setTab("sla");
    setSlaAgentId(a.user_id);
    setSlaState("at_risk,breached");
    setSlaPage(1);
    requestAnimationFrame(() => document.getElementById("sla-investigation")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  /** Case-level jumps out of the SLA tab into the orchestration workspace. */
  const openCase = (c: SlaCaseRow) => {
    // Dispute-only rows have no orchestration task to open.
    if (c.source === "dispute") {
      if (!(data?.permissions.can_view_disputes ?? false)) {
        toast.error("You do not have permission to open this dispute.");
        return;
      }
      navigate(`/admin/disputes/${c.dispute_id ?? c.id}`);
      return;
    }
    if (!canViewCases) {
      toast.error("You do not have permission to open this case.");
      return;
    }
    navigate(`/admin/task-orchestration?task=${c.id}`);
  };
  const escalateCase = (c: SlaCaseRow) => {
    if (c.source === "dispute") {
      toast.error("Dispute-only cases are escalated from the dispute workspace.");
      return;
    }
    if (!canViewCases) {
      toast.error("You do not have permission to escalate this case.");
      return;
    }
    navigate(`/admin/task-orchestration?task=${c.id}&action=escalate`);
  };

  const runExport = async (
    { maskPii, reason, report, agentId }:
    { maskPii: boolean; reason: string; report: string; agentId: string | null },
  ) => {
    setExporting(true);
    try {
      const res = await exportAgentPerformance(filters, {
        tab: report === "filtered_agent" ? tab : report,
        maskPii, reason, agentId,
      });
      downloadCsv(res.csv, res.filename);
      toast.success("Export ready", { description: res.filename });
      setExportOpen(false);
    } catch (e) {
      toast.error("Export failed", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setExporting(false);
    }
  };

  const body = useMemo(() => {
    if (!data) return null;
    switch (tab) {
      case "workload":
        return (
          <WorkloadTable
            agents={agents}
            actions={{
              onViewDetail: setDetailAgent,
              onViewCases: openCases,
              onReviewSla: openSla,
              onRebalance: openRebalance,
              canRebalance,
              canViewCases,
              canReviewSla,
            }}
            filtered={filtersDirty}
            onClearFilters={clearFilters}
          />
        );
      case "performance":
        return (
          <PerformanceDashboard
            agents={agents}
            trend={data.trend ?? []}
            metrics={data.performance}
            statusDistribution={data.status_distribution ?? {}}
            rangeLabel={data.range.label}
            allTime={filters.scope === "all_time"}
            onViewDetail={setDetailAgent}
          />
        );
      case "sla":
        return (
          <SLAComplianceTable
            agents={agents}
            cases={data.sla_cases ?? []}
            summary={data.sla_summary}
            rangeLabel={data.range.label}
            stateFilter={slaState}
            onStateFilterChange={(v) => { setSlaState(v); setSlaPage(1); }}
            agentFilter={slaAgentId}
            onAgentFilterChange={(v) => { setSlaAgentId(v); setSlaPage(1); }}
            priorityFilter={slaPriority}
            onPriorityFilterChange={(v) => { setSlaPriority(v); setSlaPage(1); }}
            stageFilter={slaStage}
            onStageFilterChange={(v) => { setSlaStage(v); setSlaPage(1); }}
            counts={data.sla_counts ?? {}}
            total={data.sla_total ?? (data.sla_cases ?? []).length}
            page={data.sla_page ?? slaPage}
            pageSize={data.sla_page_size ?? 50}
            hasMore={!!data.sla_has_more}
            onPageChange={setSlaPage}
            onReviewSla={openSla}
            onOpenCase={openCase}
            onEscalate={escalateCase}
            onRebalance={openRebalance}
            canRebalance={canRebalance}
            canEscalate={data.permissions.can_escalate}
          />
        );
      case "rankings":
        return (
          <div className="space-y-4">
            <RankingsFilters filters={filters} onChange={patchFilters} />
            <RankingsTable agents={agents} onViewDetail={setDetailAgent} onViewScore={setScoreAgent} />
          </div>
        );
    }
  }, [data, tab, agents, canRebalance, canViewCases, canReviewSla, filtersDirty, slaState, slaAgentId, slaPriority, slaStage, slaPage, filters]);

  return (
    <AdminLayout
      title="Agent performance"
      subtitle="Performance tracking · Workload management"
      headerSlot={
        <AgentPerformanceHeader
          liveAgents={data?.summary.live_agents ?? 0}
          onExport={() => setExportOpen(true)}
          canExport={canExport}
        />
      }
    >
      <div className="space-y-6">
        {loading && !data && <LoadingSkeleton />}
        {error && !loading && <ErrorState message={error} onRetry={() => void load()} />}

        {data && (
          <>
            {filters.scope === "all_time" && data.range.all_time !== true && (
              <p className={`rounded-lg border ${ADMIN_TONE.warning.panel} px-4 py-2 text-xs text-amber-300`}>
                Showing “{data.range.label}” data. The analytics service returned a windowed
                result for an all-time request. Reload in a moment; if it persists the backend
                is running an older version.
              </p>
            )}
            <AgentPerformanceSummary
              summary={data.summary}
              rangeLabel={data.range.label}
              selected={activeCard}
              onOpenRoster={() => {
                setActiveCard("active"); setTab("workload");
                patchFilters({ overdue_only: false, availability: "all", case_status: "all", case_sla: "all" });
              }}
              onOpenOverdue={() => {
                setActiveCard("overdue"); setTab("sla"); setSlaState("breached");
                patchFilters({ overdue_only: true, case_sla: "overdue" });
              }}
              onOpenResolved={() => {
                setActiveCard("resolved"); setTab("performance");
                patchFilters({ case_status: "resolved", case_sla: "all", overdue_only: false });
              }}
              onOpenPerformance={() => { setActiveCard("avg"); setTab("performance"); }}
              onOpenDisputes={() => {
                setActiveCard("open"); setTab("workload");
                patchFilters({ case_status: "open", overdue_only: false });
              }}
              onOpenTopAgent={() => {
                setActiveCard("top");
                const top = agents.find((a) => a.user_id === data.summary.top_agent?.user_id);
                if (top) setDetailAgent(top);
              }}
            />

            <section className={CARD_CLASS}>
              <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <AgentPerformanceTabs value={tab} onChange={setTab} />
                <AgentPerformanceFilters
                  filters={filters}
                  onChange={patchFilters}
                  teams={data.facets.teams}
                  roles={data.facets.roles}
                />
              </div>
              <div className="mb-4">
                <ActiveFilterChips
                  filters={filters}
                  roles={data.facets.roles}
                  onChange={patchFilters}
                  onClear={() => {
                    setActiveCard(null);
                    setFilters({ ...DEFAULT_AGENT_FILTERS, range: filters.range, scope: filters.scope });
                  }}
                />
              </div>
              <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>{body}</div>
            </section>

            <p className="pb-4 text-center text-xs text-muted-foreground">
              Generated {new Date(data.generated_at).toLocaleString()} · Metrics derive from orchestration tasks and dispute outcomes.
            </p>
          </>
        )}
      </div>

      <AgentDetailsDrawer
        agent={detailAgent}
        open={!!detailAgent}
        onOpenChange={(v) => !v && setDetailAgent(null)}
        filters={filters}
        onViewCases={(a) => { setDetailAgent(null); openCases(a); }}
        onViewOverdue={(a) => {
          setDetailAgent(null);
          setTab("sla");
          setSlaAgentId(a.user_id);
          setSlaState("breached");
          setSlaPage(1);
        }}
        onReviewSla={(a) => { setDetailAgent(null); openSla(a); }}
        onRebalance={openRebalance}
        onOpenOrchestration={(a) => navigate(`/admin/task-orchestration?tab=queue&assignee=${a.user_id}`)}
        onOpenUserRecord={(a) => navigate(`/admin/access-control?user=${a.user_id}`)}
        onOpenAuditHistory={(a) => navigate(`/admin/audit-logs?ref=${a.user_id}`)}
        canRebalance={canRebalance}
      />

      <ScoreBreakdownDialog
        agent={scoreAgent}
        open={!!scoreAgent}
        onOpenChange={(v) => !v && setScoreAgent(null)}
      />

      <AgentCasesDrawer
        agent={casesAgent}
        open={!!casesAgent}
        onOpenChange={(v) => !v && setCasesAgent(null)}
        filters={filters}
      />

      <ExportPerformanceDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        tabLabel={TAB_LABEL[tab]}
        rowCount={agents.length}
        onConfirm={runExport}
        busy={exporting}
        defaultReport={tab}
        rangeLabel={data?.range?.label ?? ""}
        agents={agents.map((a) => ({
          user_id: a.user_id,
          name: (a.full_name ?? `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim()) || a.user_id,
        }))}
      />
    </AdminLayout>
  );
}