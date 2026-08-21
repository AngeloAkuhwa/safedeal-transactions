import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { useNavigate, useSearchParams } from "react-router";
import {
  TaskOrchestrationHeader,
  OrchestrationSummaryCards,
  AssignmentControlPanel,
  UnassignedTaskQueue,
  AgentRoster,
  LiveTaskProgression,
  ProductivityInsights,
  AssignmentRulesPanel,
  ReviewRulesDrawer,
  TestConfigurationDialog,
  ExportScopePopover,
  AssignTaskDrawer,
  EscalateTaskDrawer,
  AgentDetailsDrawer,
  TaskDetailsDrawer,
  AutoAssignPreviewDrawer,
  RebalancePreviewDrawer,
  ReassignTaskDrawer,
  BulkAssignResultDialog,
  LoadingSkeleton,
  ErrorState,
} from "@/components/admin/task-orchestration";
import type { EscalatePayload } from "@/components/admin/task-orchestration";
import type { QueueFilters } from "@/components/admin/task-orchestration";
import { DEFAULT_QUEUE_FILTERS } from "@/components/admin/task-orchestration/TaskQueueFilters";
import {
  fetchOrchestrationOverview,
  runOrchestrationAction,
  exportOrchestrationCsv,
  exportOrchestrationReport,
  testRules,
  type OrchestrationOverview,
  type UnassignedTask,
  type AgentRosterEntry,
  type LiveTask,
  type AssignmentRulesConfig,
  type BulkAssignRowResult,
  type TestConfigResult,
} from "@/services/task-orchestration.service";
import type {
  AutoAssignPlanRow,
  AgentLoadRow,
  UnmatchedRow,
} from "@/components/admin/task-orchestration/drawers/AutoAssignPreviewDrawer";
import type { RebalanceMove } from "@/services/task-orchestration.service";
import { useOrchestrationPerms } from "@/hooks/useOrchestrationPerms";
import { supabase } from "@/integrations/supabase/client";

export default function AdminTaskOrchestration() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const perms = useOrchestrationPerms();
  const { isSenior } = perms;

  const [data, setData] = useState<OrchestrationOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectingAllMatching, setSelectingAllMatching] = useState(false);
  const [queueFilters, setQueueFilters] = useState<QueueFilters>(DEFAULT_QUEUE_FILTERS);
  const [detailTask, setDetailTask] = useState<UnassignedTask | null>(null);
  const [assignTarget, setAssignTarget] = useState<UnassignedTask | null>(null);
  const [assignBulk, setAssignBulk] = useState(false);
  const [escalateOpen, setEscalateOpen] = useState(false);
  const [agentDetail, setAgentDetail] = useState<AgentRosterEntry | null>(null);
  const [agentFocus, setAgentFocus] = useState<
    { focus: "performance"; context: { metricLabel?: string; range?: string; team?: string } } | null
  >(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [savingRules, setSavingRules] = useState(false);
  const [testingRules, setTestingRules] = useState(false);
  const [mode, setMode] = useState("round_robin");
  const [reviewDraft, setReviewDraft] = useState<AssignmentRulesConfig | null>(null);
  const [reviewImpact, setReviewImpact] = useState<{ pending: number; would_assign: number; unmatched: number } | null>(null);
  const [reviewRequiresApproval, setReviewRequiresApproval] = useState<boolean | undefined>(undefined);
  const [reviewError, setReviewError] = useState<string | null>(null);
  // Read-only review opened from Pending Approvals (?rules_change=<id>).
  const [pendingChangeSet, setPendingChangeSet] = useState<
    { id: string; before: AssignmentRulesConfig; after: AssignmentRulesConfig } | null
  >(null);
  const [testResult, setTestResult] = useState<TestConfigResult | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const [runningEnforcement, setRunningEnforcement] = useState<string | null>(null);
  const { canPii, canFinancial } = useMemo(() => {
    const has = (k: string) => (perms as any).has?.(k) ?? false;
    return {
      canPii: has("data.export.pii") || (perms as any).isSuper,
      canFinancial: has("data.export.financial") || (perms as any).isSuper,
    };
  }, [perms]);
  const [autoPreview, setAutoPreview] = useState<{
    pending: number;
    plan: AutoAssignPlanRow[];
    agent_loads: AgentLoadRow[];
    unmatched: UnmatchedRow[];
    scope: "queue" | "selection";
  } | null>(null);
  const [rebalancePreview, setRebalancePreview] = useState<{
    plan: RebalanceMove[];
    skipped: Array<{ task_id: string; task_code: string; reason: string }>;
  } | null>(null);
  const [reassignTarget, setReassignTarget] = useState<LiveTask | null>(null);
  const [bulkResults, setBulkResults] = useState<BulkAssignRowResult[] | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const overview = await fetchOrchestrationOverview({
        search: queueFilters.search,
        priority: queueFilters.priority,
        type: queueFilters.type,
        status: queueFilters.status,
        stage: queueFilters.stage,
        sla: queueFilters.sla,
        queue: queueFilters.queue,
        team: queueFilters.team,
        required_role: queueFilters.requiredRole,
        amount_min: queueFilters.amountMin ? Number(queueFilters.amountMin) : null,
        amount_max: queueFilters.amountMax ? Number(queueFilters.amountMax) : null,
        date_from: queueFilters.dateFrom || null,
        date_to: queueFilters.dateTo || null,
        age_bucket: queueFilters.ageBucket,
        sort_by: queueFilters.sortBy,
        sort_dir: queueFilters.sortDir,
        page: queueFilters.page,
        per_page: queueFilters.perPage,
      });
      setData(overview);
      setMode(overview.rules?.mode ?? overview.rules?.config?.mode ?? "round_robin");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [queueFilters]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    let pending = false;
    const debounced = () => {
      if (pending) return;
      pending = true;
      setTimeout(() => { pending = false; void load(); }, 800);
    };
    // Scope realtime: broad listeners only for viewers of all tasks; otherwise
    // subscribe to the caller's assigned rows only to avoid leaking rows they
    // cannot see (server RLS still filters, but this reduces bus chatter).
    const canViewAll = perms.canViewAll;
    const uid = perms.userId;
    const filter = canViewAll ? undefined : (uid ? `assigned_agent_id=eq.${uid}` : undefined);
    if (!canViewAll && !uid) return; // nothing scoped, nothing to subscribe to
    const ch = supabase.channel(`task-orchestration-live-${canViewAll ? "all" : uid}`)
      .on("postgres_changes" as any,
        { event: "*", schema: "public", table: "orchestration_tasks", ...(filter ? { filter } : {}) },
        debounced)
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "task_status_history" }, debounced)
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "task_assignment_history" }, debounced)
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [load, perms.canViewAll, perms.userId]);

  const toggleId = (id: string) => setSelectedIds(s => {
    const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n;
  });
  const toggleAll = (checked: boolean) => {
    if (!data) return;
    setSelectingAllMatching(false);
    setSelectedIds(new Set(checked ? data.unassigned_queue.map(t => t.id) : []));
  };
  const selectAllMatching = (ids: string[]) => {
    setSelectingAllMatching(true);
    setSelectedIds(new Set(ids));
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
    try {
      setBusy("assign");
      const res = await runOrchestrationAction<{ ok: boolean; count: number; total: number; results: BulkAssignRowResult[] }>({
        action: "assign_selected", task_ids: ids, agent_id: agentId, mode, reason,
      });
      if (assignBulk && res?.results?.length) {
        setBulkResults(res.results);
        const fail = res.results.filter(r => !r.ok).length;
        if (fail) toast.warning(`${res.count}/${res.total} assigned. ${fail} failed`);
        else toast.success(`${res.count}/${res.total} assigned`);
      } else {
        toast.success("Assigned");
      }
      setSelectedIds(new Set());
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Assign failed");
    } finally {
      setBusy(null); setAssignTarget(null); setAssignBulk(false);
    }
  };

  const handleAutoAssign = async () => {
    try {
      const selection = Array.from(selectedIds);
      const res = await runOrchestrationAction<{
        pending: number; would_assign: number; plan: AutoAssignPlanRow[];
        agent_loads?: AgentLoadRow[]; unmatched?: UnmatchedRow[];
      }>({
        action: "preview_auto_assign", mode,
        ...(selection.length ? { task_ids: selection } : {}),
      });
      setAutoPreview({
        pending: res.pending,
        plan: res.plan ?? [],
        agent_loads: res.agent_loads ?? [],
        unmatched: res.unmatched ?? [],
        scope: selection.length ? "selection" : "queue",
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Preview failed");
    }
  };
  const confirmAutoAssign = async (excludeTaskIds: string[]) => {
    const selectionScope = autoPreview?.scope === "selection";
    const selection = selectionScope ? Array.from(selectedIds) : null;
    setAutoPreview(null);
    await runAction("auto_assign",
      () => runOrchestrationAction({
        action: "auto_assign", mode,
        exclude_task_ids: excludeTaskIds,
        ...(selection && selection.length ? { task_ids: selection } : {}),
      }));
  };
  const handleAssignToMe = (reason: string) => {
    if (!selectedIds.size) return;
    return runAction("assign_to_me",
      () => runOrchestrationAction({ action: "assign_to_me", task_ids: Array.from(selectedIds), reason }));
  };
  const handleRebalance = async () => {
    try {
      const res = await runOrchestrationAction<{
        moves: number;
        plan: RebalanceMove[];
        skipped?: Array<{ task_id: string; task_code: string; reason: string }>;
      }>({ action: "preview_rebalance" });
      setRebalancePreview({ plan: res.plan ?? [], skipped: res.skipped ?? [] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Preview failed");
    }
  };
  const confirmRebalance = async ({ excludeMoveIds, reason }: { excludeMoveIds: string[]; reason: string }) => {
    setRebalancePreview(null);
    await runAction("rebalance", () => runOrchestrationAction({
      action: "rebalance",
      exclude_move_ids: excludeMoveIds,
      reason,
    }));
  };
  const handleEscalate = () => setEscalateOpen(true);
  const handleConfirmEscalate = (p: EscalatePayload) => runAction("escalate", async () => {
    await runOrchestrationAction({
      action: "escalate",
      task_ids: Array.from(selectedIds),
      reason: p.reason,
      target_queue: p.target_queue,
      target_team: p.target_team,
      escalate_priority: p.escalate_priority,
      internal_note: p.internal_note,
      requested_reviewer_id: p.requested_reviewer_id,
    });
    setEscalateOpen(false);
  });
  const handleBulkExport = async () => {
    try { await exportOrchestrationCsv("queue"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Export failed"); }
  };

  const handleExportReport = async (opts: { scope: any; includePii: boolean; includeFinancial: boolean }) => {
    try {
      await exportOrchestrationReport({
        scope: opts.scope,
        includePii: opts.includePii,
        includeFinancial: opts.includeFinancial,
      });
      toast.success("Export ready");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Export failed"); }
  };

  const handleConfirmReassign = async (params: { agentId: string; reason: string; note: string; override: boolean }) => {
    if (!reassignTarget) return;
    await runAction("reassign", () => runOrchestrationAction({
      action: "reassign",
      task_id: reassignTarget.id,
      agent_id: params.agentId,
      reason: params.reason,
      body_text: params.note || undefined,
      override_capacity: params.override,
      expected_version: (reassignTarget as any).version,
    }));
    setReassignTarget(null);
  };

  const openReview = async (draft: AssignmentRulesConfig) => {
    setReviewDraft({ ...draft, mode });
    setReviewImpact(null);
    setReviewError(null);
    // Heuristic: server sets the authoritative flag on save.
    const curr = (data?.rules?.config ?? {}) as AssignmentRulesConfig;
    setReviewRequiresApproval(
      (curr.mode ?? null) !== ((draft.mode ?? mode) ?? null) ||
      Number(draft.max_active_per_agent ?? Infinity) < Number(curr.max_active_per_agent ?? 0) ||
      (!!draft.super_admin_self_assign && !curr.super_admin_self_assign) ||
      (draft.fallback_target === "leave_unassigned" && curr.fallback_target !== "leave_unassigned"),
    );
    try {
      const preview = await runOrchestrationAction<{ pending: number; would_assign: number; unmatched?: any[] }>({
        action: "preview_auto_assign", mode,
      });
      setReviewImpact({
        pending: preview.pending,
        would_assign: preview.would_assign,
        unmatched: preview.unmatched?.length ?? 0,
      });
    } catch { /* impact is optional */ }
  };
  const handleConfirmSaveRules = async (reason: string) => {
    if (!reviewDraft) return;
    try {
      setSavingRules(true);
      setReviewError(null);
      const res = await runOrchestrationAction<{ ok: boolean; requires_approval?: boolean; status?: string; change_set_id?: string }>({
        action: "save_rules", rules: { ...reviewDraft, mode }, reason,
      });
      if (res?.status === "pending_approval") {
        toast.success("Submitted for approval", {
          description: `Change set ${res.change_set_id?.slice(0, 8) ?? ""} is waiting in Pending Approvals.`,
        });
      } else {
        toast.success("Assignment rules saved");
      }
      setReviewDraft(null);
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed";
      setReviewError(msg);
      toast.error(msg);
    } finally { setSavingRules(false); }
  };

  // Deep link from Pending Approvals: ?rules_change=<change_set_id>
  const rulesChangeId = searchParams.get("rules_change");
  useEffect(() => {
    let cancelled = false;
    if (!rulesChangeId) { setPendingChangeSet(null); return; }
    (async () => {
      const { data, error } = await supabase
        .from("permission_change_sets")
        .select("id, before, after, target_scope")
        .eq("id", rulesChangeId)
        .maybeSingle();
      if (cancelled || error || !data || data.target_scope !== "orchestration_rules") return;
      setPendingChangeSet({
        id: data.id,
        before: (data.before ?? {}) as AssignmentRulesConfig,
        after: (data.after ?? {}) as AssignmentRulesConfig,
      });
    })();
    return () => { cancelled = true; };
  }, [rulesChangeId]);

  const closeRulesChange = () => {
    setPendingChangeSet(null);
    const next = new URLSearchParams(searchParams);
    next.delete("rules_change");
    setSearchParams(next, { replace: true });
  };

  const clearParams = useCallback((keys: string[]) => {
    const next = new URLSearchParams(searchParams);
    let changed = false;
    for (const k of keys) if (next.has(k)) { next.delete(k); changed = true; }
    if (changed) setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // Deep link from Agent Performance (and notifications): ?task=<task_id>
  const deepTaskId = searchParams.get("task");
  const deepTaskAction = searchParams.get("action");
  useEffect(() => {
    let cancelled = false;
    if (!deepTaskId) return;
    (async () => {
      const local =
        data?.unassigned_queue.find(t => t.id === deepTaskId) ?? null;
      if (local) {
        if (!cancelled) {
          if (deepTaskAction === "escalate" && perms.canEscalate) {
            setSelectedIds(new Set([local.id]));
            setEscalateOpen(true);
            clearParams(["action"]);
          } else setDetailTask(local);
        }
        return;
      }
      const { data: row, error } = await supabase
        .from("orchestration_tasks")
        .select(
          "id, task_code, type, title, priority, amount, currency, created_at, dispute_id, transaction_id, stage, status, sla_status, sla_due_at, queue, required_role, required_permissions, suggested_agent_id, version",
        )
        .eq("id", deepTaskId)
        .maybeSingle();
      if (cancelled || error || !row) {
        if (!cancelled && !error) toast.error("That task is no longer available");
        return;
      }
      const task = row as unknown as UnassignedTask;
      if (deepTaskAction === "escalate" && perms.canEscalate) {
        setSelectedIds(new Set([task.id]));
        setEscalateOpen(true);
        clearParams(["action"]);
      } else setDetailTask(task);
    })();
    return () => { cancelled = true; };
  }, [deepTaskId, deepTaskAction, data, perms.canEscalate, clearParams]);

  // Deep link from Agent Performance: ?rebalance=1&agent=<user_id>
  const rebalanceFlag = searchParams.get("rebalance");
  const rebalanceAgentId = searchParams.get("agent");
  const rebalanceKickedRef = useRef(false);
  useEffect(() => {
    if (rebalanceFlag !== "1" || rebalanceKickedRef.current) return;
    if (!perms.canRebalance) {
      rebalanceKickedRef.current = true;
      toast.error("You do not have permission to rebalance workload");
      clearParams(["rebalance", "agent"]);
      return;
    }
    rebalanceKickedRef.current = true;
    void (async () => {
      try {
        const res = await runOrchestrationAction<{
          moves: number;
          plan: RebalanceMove[];
          skipped?: Array<{ task_id: string; task_code: string; reason: string }>;
        }>({ action: "preview_rebalance" });
        const all = res.plan ?? [];
        const scoped = rebalanceAgentId
          ? all.filter(m => m.from === rebalanceAgentId || m.to === rebalanceAgentId)
          : all;
        if (rebalanceAgentId && scoped.length === 0) {
          toast.info("No rebalance moves involve that agent right now");
        }
        setRebalancePreview({ plan: scoped, skipped: res.skipped ?? [] });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Rebalance preview failed");
      } finally {
        clearParams(["rebalance", "agent"]);
      }
    })();
  }, [rebalanceFlag, rebalanceAgentId, perms.canRebalance, clearParams]);

  const runEnforcement = async (which: "escalate" | "reassign") => {
    try {
      setRunningEnforcement(which);
      const action = which === "escalate" ? "auto_escalate_stale_tasks" : "auto_reassign_offline_agents";
      const res = await runOrchestrationAction<any>({ action });
      toast.success(
        which === "escalate"
          ? `Escalated ${res?.escalated ?? 0} of ${res?.candidates ?? 0} stale task${(res?.candidates ?? 0) === 1 ? "" : "s"}`
          : `Reassigned ${res?.moved ?? 0} task${(res?.moved ?? 0) === 1 ? "" : "s"} from offline agents`,
      );
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enforcement run failed");
    } finally { setRunningEnforcement(null); }
  };

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const openUnassigned = () => {
    setQueueFilters(f => ({ ...f, status: "unassigned", sla: undefined as any }));
    scrollTo("orchestration-queue");
  };
  const openOverdue = () => {
    setQueueFilters(f => ({ ...f, sla: "overdue" }));
    scrollTo("orchestration-queue");
  };
  const openAssignedToday = () => {
    setQueueFilters(f => ({ ...f, status: "assigned" }));
    scrollTo("orchestration-live");
  };
  const openAtCapacity = () => scrollTo("orchestration-roster");
  const openRoster = () => scrollTo("orchestration-roster");
  const handleTestRules = async () => {
    try {
      setTestingRules(true);
      setTestOpen(true);
      const res = await testRules({ mode });
      setTestResult(res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test failed");
      setTestOpen(false);
    } finally { setTestingRules(false); }
  };

  const exportReport = async () => {
    try { await exportOrchestrationCsv("live"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Export failed"); }
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
      <div className="relative mx-auto max-w-[1600px] space-y-6 p-4 lg:p-8 bg-[radial-gradient(ellipse_at_top_left,hsl(var(--primary)/0.06),transparent_60%)]">
        {loading && !data && <LoadingSkeleton />}
        {error && !loading && <ErrorState message={error} onRetry={load} />}

        {data && (
          <>
            <OrchestrationSummaryCards
              kpis={data.kpis}
              onOpenUnassigned={openUnassigned}
              onOpenOverdue={openOverdue}
              onOpenAtCapacity={openAtCapacity}
              onOpenRoster={openRoster}
              onOpenAssignedToday={openAssignedToday}
              teamLabel={queueFilters.team || "All"}
              rangeLabel="last 24h"
            />

            <AssignmentControlPanel
              mode={mode}
              onModeChange={setMode}
              onAssignSelected={handleAssignSelected}
              onAutoAssign={handleAutoAssign}
              onAssignToMe={handleAssignToMe}
              selfAssignEnabled={(data?.rules?.config as any)?.super_admin_self_assign !== false && !!(data?.rules?.config as any)?.super_admin_self_assign}
              onRebalance={handleRebalance}
              onEscalate={handleEscalate}
              onBulkExport={handleBulkExport}
              isSenior={isSenior}
              perms={perms}
              selectedCount={selectedIds.size}
              busy={busy}
            />

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2" id="orchestration-queue">
                <UnassignedTaskQueue
                  tasks={data.unassigned_queue}
                  page={data.unassigned_page}
                  selectedIds={selectedIds}
                  onToggle={toggleId}
                  onToggleAll={toggleAll}
                  onSelectAllMatching={selectAllMatching}
                  selectingAllMatching={selectingAllMatching}
                  onAssignRow={handleAssignRow}
                  onOpenDetail={setDetailTask}
                  filters={queueFilters}
                  onFiltersChange={patch => setQueueFilters(f => ({ ...f, ...patch }))}
                  roster={data.roster}
                />
              </div>
              <div id="orchestration-roster"><AgentRoster roster={data.roster} onSelect={setAgentDetail} /></div>
            </div>

            <div id="orchestration-live"><LiveTaskProgression
              tasks={data.live_progression}
              roster={data.roster}
              onView={(t: LiveTask) => toast.message(`Task #${t.task_code} · ${t.status}`)}
              canReassign={perms.canReassign}
              onReassign={(t) => setReassignTarget(t)}
            /></div>

            <ProductivityInsights
              insights={data.insights}
              team={queueFilters.queue ?? undefined}
              range="today"
              onSelectAgent={(a, ctx) => { setAgentFocus({ focus: "performance", context: ctx }); setAgentDetail(a); }}
            />

            <div className="flex justify-end">
              <ExportScopePopover
                onExport={handleExportReport}
                canPii={canPii}
                canFinancial={canFinancial}
                disabled={!perms.canExport}
              />
            </div>

            <AssignmentRulesPanel
              config={data.rules?.config ?? {}}
              onReview={openReview}
              onTest={handleTestRules}
              saving={savingRules}
              testing={testingRules}
              lastSavedAt={data.rules?.updated_at ?? null}
              canManage={perms.canManageRules}
              onRunAutoEscalate={() => runEnforcement("escalate")}
              onRunAutoReassign={() => runEnforcement("reassign")}
              runningEnforcement={runningEnforcement}
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
      <EscalateTaskDrawer
        open={escalateOpen}
        onOpenChange={setEscalateOpen}
        count={selectedIds.size}
        roster={data?.roster ?? []}
        currentOwners={
          data
            ? Array.from(new Set(
                data.unassigned_queue
                  .filter(t => selectedIds.has(t.id))
                  .map(t => (t as any).assigned_agent_id)
                  .filter(Boolean),
              )) as string[]
            : []
        }
        onConfirm={handleConfirmEscalate}
        submitting={busy === "escalate"}
      />
      <AgentDetailsDrawer
        open={!!agentDetail}
        onOpenChange={o => { if (!o) { setAgentDetail(null); setAgentFocus(null); } }}
        agent={agentDetail}
        focus={agentFocus?.focus ?? null}
        context={agentFocus?.context ?? null}
        onReassign={a => {
          setAgentDetail(null);
          navigate(`/admin/task-orchestration?tab=queue&assignee=${a.user_id}`);
        }}
      />
      <ReviewRulesDrawer
        open={!!reviewDraft}
        onOpenChange={(o) => { if (!o) { setReviewDraft(null); setReviewError(null); } }}
        current={data?.rules?.config ?? {}}
        draft={reviewDraft}
        history={data?.rule_versions ?? []}
        impact={reviewImpact}
        onConfirm={handleConfirmSaveRules}
        submitting={savingRules}
        requiresApproval={reviewRequiresApproval}
        serverError={reviewError}
      />
      <ReviewRulesDrawer
        open={!!pendingChangeSet}
        onOpenChange={(o) => { if (!o) closeRulesChange(); }}
        current={pendingChangeSet?.before ?? {}}
        draft={pendingChangeSet?.after ?? null}
        impact={null}
        onConfirm={() => { /* read-only */ }}
        submitting={false}
        requiresApproval
        readOnly
        changeSetId={pendingChangeSet?.id ?? null}
      />
      <TestConfigurationDialog
        open={testOpen}
        onOpenChange={(o) => { setTestOpen(o); if (!o) setTestResult(null); }}
        result={testResult}
        running={testingRules}
        roster={data?.roster ?? []}
        onBackToEdit={() => { setTestOpen(false); setTestResult(null); }}
        onSave={() => {
          setTestOpen(false);
          if (data?.rules?.config) openReview({ ...data.rules.config, mode });
        }}
      />
      <TaskDetailsDrawer
        open={!!detailTask}
        onOpenChange={o => { if (!o) { setDetailTask(null); clearParams(["task"]); } }}
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
        plan={autoPreview?.plan ?? []}
        agentLoads={autoPreview?.agent_loads ?? []}
        unmatched={autoPreview?.unmatched ?? []}
        roster={data?.roster ?? []}
        mode={mode}
        scope={autoPreview?.scope ?? "queue"}
        onConfirm={confirmAutoAssign}
        submitting={busy === "auto_assign"}
      />
      <RebalancePreviewDrawer
        open={!!rebalancePreview}
        onOpenChange={o => { if (!o) setRebalancePreview(null); }}
        roster={data?.roster ?? []}
        plan={rebalancePreview?.plan ?? []}
        skipped={rebalancePreview?.skipped ?? []}
        onConfirm={confirmRebalance}
        submitting={busy === "rebalance"}
      />
      <ReassignTaskDrawer
        open={!!reassignTarget}
        onOpenChange={o => { if (!o) setReassignTarget(null); }}
        task={reassignTarget}
        roster={data?.roster ?? []}
        canOverride={perms.canOverrideCapacity}
        onConfirm={handleConfirmReassign}
        submitting={busy === "reassign"}
      />
      <BulkAssignResultDialog
        open={!!bulkResults}
        onOpenChange={o => { if (!o) setBulkResults(null); }}
        results={bulkResults ?? []}
        taskCodeById={
          data
            ? Object.fromEntries(data.unassigned_queue.map(t => [t.id, t.task_code]))
            : {}
        }
      />
    </AdminLayout>
  );
}