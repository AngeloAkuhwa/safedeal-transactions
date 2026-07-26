import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminLayout } from "@/components/admin/AdminLayout";
import {
  TaskOrchestrationHeader,
  OrchestrationSummaryCards,
  AssignmentControlPanel,
  UnassignedTaskQueue,
  AgentRoster,
  LiveTaskProgression,
  ProductivityInsights,
  AssignmentRulesPanel,
  AssignTaskDrawer,
  EscalateTaskDialog,
  AgentDetailsDrawer,
  TaskDetailsDrawer,
  AutoAssignPreviewDrawer,
  RebalancePreviewDrawer,
  LoadingSkeleton,
  ErrorState,
} from "@/components/admin/task-orchestration";
import type { QueueFilters } from "@/components/admin/task-orchestration";
import {
  fetchOrchestrationOverview,
  runOrchestrationAction,
  type OrchestrationOverview,
  type UnassignedTask,
  type AgentRosterEntry,
  type LiveTask,
  type AssignmentRulesConfig,
} from "@/services/task-orchestration.service";
import { useOrchestrationPerms } from "@/hooks/useOrchestrationPerms";
import { supabase } from "@/integrations/supabase/client";

export default function AdminTaskOrchestration() {
  const perms = useOrchestrationPerms();
  const { isSenior } = perms;

  const [data, setData] = useState<OrchestrationOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [queueFilters, setQueueFilters] = useState<QueueFilters>({
    search: "", priority: "all", type: "all", ageBucket: "all",
  });
  const [detailTask, setDetailTask] = useState<UnassignedTask | null>(null);
  const [assignTarget, setAssignTarget] = useState<UnassignedTask | null>(null);
  const [assignBulk, setAssignBulk] = useState(false);
  const [escalateOpen, setEscalateOpen] = useState(false);
  const [agentDetail, setAgentDetail] = useState<AgentRosterEntry | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [savingRules, setSavingRules] = useState(false);
  const [testingRules, setTestingRules] = useState(false);
  const [mode, setMode] = useState("round_robin");
  const [autoPreview, setAutoPreview] = useState<{ pending: number; seats: number; wouldAssign: number } | null>(null);
  const [rebalancePreview, setRebalancePreview] = useState<{ moves: number } | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const overview = await fetchOrchestrationOverview();
      setData(overview);
      setMode(overview.rules?.mode ?? overview.rules?.config?.mode ?? "round_robin");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    let pending = false;
    const debounced = () => {
      if (pending) return;
      pending = true;
      setTimeout(() => { pending = false; void load(); }, 800);
    };
    const ch = supabase.channel("task-orchestration-live")
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "orchestration_tasks" }, debounced)
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "task_status_history" }, debounced)
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "task_assignment_history" }, debounced)
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [load]);

  const toggleId = (id: string) => setSelectedIds(s => {
    const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n;
  });
  const toggleAll = (checked: boolean) => {
    if (!data) return;
    setSelectedIds(new Set(checked ? data.unassigned_queue.map(t => t.id) : []));
  };

  const runAction = async (label: string, fn: () => Promise<unknown>) => {
    try {
      setBusy(label);
      await fn();
      toast.success(`${label.replace(/_/g, " ")} complete`);
      setSelectedIds(new Set());
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally { setBusy(null); }
  };

  const handleAssignRow = (t: UnassignedTask) => { setAssignBulk(false); setAssignTarget(t); };
  const handleAssignSelected = () => {
    if (!selectedIds.size || !data) return;
    const first = data.unassigned_queue.find(t => selectedIds.has(t.id));
    setAssignBulk(true); setAssignTarget(first ?? null);
  };
  const handleConfirmAssign = async (agentId: string, reason: string) => {
    const ids = assignBulk ? Array.from(selectedIds) : (assignTarget ? [assignTarget.id] : []);
    if (!ids.length || !agentId) return;
    await runAction("assign", () => runOrchestrationAction({
      action: "assign_selected", task_ids: ids, agent_id: agentId, mode, reason,
    }));
    setAssignTarget(null); setAssignBulk(false);
  };

  const handleAutoAssign = async () => {
    try {
      const res = await runOrchestrationAction<{ pending: number; would_assign: number; plan: unknown[] }>({
        action: "preview_auto_assign", mode,
      });
      setAutoPreview({ pending: res.pending, seats: res.plan.length, wouldAssign: res.would_assign });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Preview failed");
    }
  };
  const confirmAutoAssign = async () => {
    setAutoPreview(null);
    await runAction("auto_assign", () => runOrchestrationAction({ action: "auto_assign", mode }));
  };
  const handleAssignToMe = () => {
    if (!selectedIds.size) return;
    return runAction("assign_to_me",
      () => runOrchestrationAction({ action: "assign_to_me", task_ids: Array.from(selectedIds) }));
  };
  const handleRebalance = async () => {
    try {
      const res = await runOrchestrationAction<{ moves: number }>({ action: "preview_rebalance" });
      setRebalancePreview({ moves: res.moves });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Preview failed");
    }
  };
  const confirmRebalance = async () => {
    setRebalancePreview(null);
    await runAction("rebalance", () => runOrchestrationAction({ action: "rebalance" }));
  };
  const handleEscalate = () => setEscalateOpen(true);
  const handleConfirmEscalate = (reason: string) => runAction("escalate", async () => {
    await runOrchestrationAction({ action: "escalate", task_ids: Array.from(selectedIds), reason });
    setEscalateOpen(false);
  });
  const handleBulkExport = () => {
    if (!data) return;
    const rows = data.unassigned_queue.map(t => ({
      code: t.task_code, type: t.type, priority: t.priority, amount: t.amount, currency: t.currency,
      created_at: t.created_at, dispute_id: t.dispute_id,
    }));
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `task-queue-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveRules = async (next: AssignmentRulesConfig) => {
    try {
      setSavingRules(true);
      await runOrchestrationAction({ action: "save_rules", rules: { ...next, mode } });
      toast.success("Assignment rules saved");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally { setSavingRules(false); }
  };
  const handleTestRules = async () => {
    try {
      setTestingRules(true);
      const res = await runOrchestrationAction<{ would_assign: number; pending: number; seats: number }>(
        { action: "test_rules" });
      toast.success(`Would assign ${res.would_assign} of ${res.pending} pending (${res.seats} open seats)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test failed");
    } finally { setTestingRules(false); }
  };

  const exportReport = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `task-orchestration-report-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AdminLayout
      title="Task Orchestration"
      subtitle="Senior admin workforce control · Real-time assignment operations"
      hideDefaultHeaders
      headerSlot={() => (
        <TaskOrchestrationHeader
          autoAssignActive={!!data?.rules?.active}
          onExport={exportReport}
        />
      )}
    >
      <div className="mx-auto max-w-[1600px] space-y-6 p-4 lg:p-8">
        {loading && !data && <LoadingSkeleton />}
        {error && !loading && <ErrorState message={error} onRetry={load} />}

        {data && (
          <>
            <OrchestrationSummaryCards kpis={data.kpis} />

            <AssignmentControlPanel
              mode={mode}
              onModeChange={setMode}
              onAssignSelected={handleAssignSelected}
              onAutoAssign={handleAutoAssign}
              onAssignToMe={handleAssignToMe}
              onRebalance={handleRebalance}
              onEscalate={handleEscalate}
              onBulkExport={handleBulkExport}
              isSenior={isSenior}
              perms={perms}
              selectedCount={selectedIds.size}
              busy={busy}
            />

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <UnassignedTaskQueue
                  tasks={data.unassigned_queue}
                  selectedIds={selectedIds}
                  onToggle={toggleId}
                  onToggleAll={toggleAll}
                  onAssignRow={handleAssignRow}
                  onOpenDetail={setDetailTask}
                  filters={queueFilters}
                  onFiltersChange={patch => setQueueFilters(f => ({ ...f, ...patch }))}
                  roster={data.roster}
                />
              </div>
              <AgentRoster roster={data.roster} onSelect={setAgentDetail} />
            </div>

            <LiveTaskProgression
              tasks={data.live_progression}
              roster={data.roster}
              onView={(t: LiveTask) => toast.message(`Task #${t.task_code} · ${t.status}`)}
            />

            <ProductivityInsights insights={data.insights} />

            <AssignmentRulesPanel
              config={data.rules?.config ?? {}}
              onSave={handleSaveRules}
              onTest={handleTestRules}
              saving={savingRules}
              testing={testingRules}
              lastSavedAt={data.rules?.updated_at ?? null}
              canManage={perms.canManageRules}
            />
          </>
        )}
      </div>

      <AssignTaskDrawer
        open={!!assignTarget}
        onOpenChange={o => { if (!o) { setAssignTarget(null); setAssignBulk(false); } }}
        task={assignTarget}
        roster={data?.roster ?? []}
        onConfirm={handleConfirmAssign}
        submitting={busy === "assign"}
      />
      <EscalateTaskDialog
        open={escalateOpen}
        onOpenChange={setEscalateOpen}
        count={selectedIds.size}
        onConfirm={handleConfirmEscalate}
        submitting={busy === "escalate"}
      />
      <AgentDetailsDrawer
        open={!!agentDetail}
        onOpenChange={o => { if (!o) setAgentDetail(null); }}
        agent={agentDetail}
      />
      <TaskDetailsDrawer
        open={!!detailTask}
        onOpenChange={o => { if (!o) setDetailTask(null); }}
        task={detailTask}
        roster={data?.roster ?? []}
        onAssign={t => { setDetailTask(null); handleAssignRow(t); }}
        onEscalate={t => { setSelectedIds(new Set([t.id])); setDetailTask(null); setEscalateOpen(true); }}
        onAfterMutate={load}
      />
      <AutoAssignPreviewDrawer
        open={!!autoPreview}
        onOpenChange={o => { if (!o) setAutoPreview(null); }}
        pending={autoPreview?.pending ?? 0}
        seats={autoPreview?.seats ?? 0}
        wouldAssign={autoPreview?.wouldAssign ?? 0}
        onConfirm={confirmAutoAssign}
        submitting={busy === "auto_assign"}
      />
      <RebalancePreviewDrawer
        open={!!rebalancePreview}
        onOpenChange={o => { if (!o) setRebalancePreview(null); }}
        roster={data?.roster ?? []}
        onConfirm={confirmRebalance}
        submitting={busy === "rebalance"}
      />
    </AdminLayout>
  );
}