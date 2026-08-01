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
import { AgentDetailsDrawer } from "@/components/admin/agent-performance/drawers/AgentDetailsDrawer";
import { AgentCasesDrawer } from "@/components/admin/agent-performance/drawers/AgentCasesDrawer";
import { AgentSLADrawer } from "@/components/admin/agent-performance/drawers/AgentSLADrawer";
import { ExportPerformanceDialog } from "@/components/admin/agent-performance/drawers/ExportPerformanceDialog";
import { LoadingSkeleton } from "@/components/admin/agent-performance/states/LoadingSkeleton";
import { ErrorState } from "@/components/admin/agent-performance/states/ErrorState";
import { CARD_CLASS } from "@/components/admin/agent-performance/helpers";
import { toast } from "sonner";
import {
  DEFAULT_AGENT_FILTERS, downloadCsv, exportAgentPerformance, fetchAgentPerformance,
  type AgentPerformanceFilters as Filters, type AgentPerformanceOverview, type AgentPerformanceRow,
} from "@/services/agent-performance.service";

const TAB_LABEL: Record<AgentTab, string> = {
  workload: "Workload",
  performance: "Performance",
  sla: "SLA Compliance",
  rankings: "Rankings",
};

export default function AdminAgentPerformance() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState<Filters>(() => ({
    ...DEFAULT_AGENT_FILTERS,
    scope: searchParams.get("scope") === "all_time" ? "all_time" : "range",
  }));
  const [activeCard, setActiveCard] = useState<string | null>(null);
  const [tab, setTab] = useState<AgentTab>("workload");
  const [data, setData] = useState<AgentPerformanceOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [detailAgent, setDetailAgent] = useState<AgentPerformanceRow | null>(null);
  const [casesAgent, setCasesAgent] = useState<AgentPerformanceRow | null>(null);
  const [slaAgent, setSlaAgent] = useState<AgentPerformanceRow | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchAgentPerformance(filters));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load agent performance");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { void load(); }, [load]);

  // Keep the scope in the URL so a shared link reproduces the exact view.
  useEffect(() => {
    const current = searchParams.get("scope") ?? "range";
    if (current === filters.scope) return;
    const next = new URLSearchParams(searchParams);
    if (filters.scope === "all_time") next.set("scope", "all_time");
    else next.delete("scope");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.scope]);

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
  const openSla = (a: AgentPerformanceRow) => setSlaAgent(a);

  const runExport = async ({ maskPii, reason }: { maskPii: boolean; reason: string }) => {
    setExporting(true);
    try {
      const res = await exportAgentPerformance(filters, { tab, maskPii, reason });
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
        return <PerformanceDashboard agents={agents} trend={data.trend} onViewDetail={setDetailAgent} />;
      case "sla":
        return <SLAComplianceTable agents={agents} onReviewSla={openSla} />;
      case "rankings":
        return <RankingsTable agents={agents} onViewDetail={setDetailAgent} />;
    }
  }, [data, tab, agents, canRebalance, canViewCases, canReviewSla, filtersDirty]);

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
            <AgentPerformanceSummary
              summary={data.summary}
              rangeLabel={data.range.label}
              selected={activeCard}
              onOpenRoster={() => {
                setActiveCard("active"); setTab("workload");
                patchFilters({ overdue_only: false, availability: "all", case_status: "all", case_sla: "all" });
              }}
              onOpenOverdue={() => {
                setActiveCard("overdue"); setTab("sla");
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

            <p className="pb-4 text-center text-[11px] text-muted-foreground">
              Generated {new Date(data.generated_at).toLocaleString()} · Metrics derive from orchestration tasks and dispute outcomes.
            </p>
          </>
        )}
      </div>

      <AgentDetailsDrawer
        agent={detailAgent}
        open={!!detailAgent}
        onOpenChange={(v) => !v && setDetailAgent(null)}
        onViewCases={(a) => { setDetailAgent(null); openCases(a); }}
        onReviewSla={(a) => { setDetailAgent(null); openSla(a); }}
        onRebalance={openRebalance}
        canRebalance={canRebalance}
      />

      <AgentCasesDrawer
        agent={casesAgent}
        open={!!casesAgent}
        onOpenChange={(v) => !v && setCasesAgent(null)}
        filters={filters}
      />

      <AgentSLADrawer
        agent={slaAgent}
        open={!!slaAgent}
        onOpenChange={(v) => !v && setSlaAgent(null)}
        filters={filters}
      />

      <ExportPerformanceDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        tabLabel={TAB_LABEL[tab]}
        rowCount={agents.length}
        onConfirm={runExport}
        busy={exporting}
      />
    </AdminLayout>
  );
}