import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Shield, ShieldAlert, History, ArrowUpRight } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { AdminMobileHeader } from "@/components/admin/AdminMobileHeader";
import { useAdminPermissions } from "@/context/AdminPermissionsContext";
import {
  fetchChangeHistory,
  fetchOverrides,
  fetchPendingApprovals,
  fetchRoleGrantMap,
  fetchWorkspaceSummary,
  type ApprovalRow,
  type HistoryRow,
  type OverrideRow,
} from "@/services/permission-workspace.service";
import type { InternalRoleKey } from "@/services/permission-catalog";
import { hydratePermissionCatalog } from "@/services/permission-catalog";
import { hydratePermissionDependencies, hydratePermissionConflicts } from "@/services/permission-dependencies";
import { permissionRepo } from "@/services/permission-repository";
import { PermissionSummaryCards } from "@/components/admin/permission-matrix/PermissionSummaryCards";
import { HowPermissionsWorkPanel } from "@/components/admin/permission-matrix/HowPermissionsWorkPanel";
import { AccessStateDefinitionsPanel } from "@/components/admin/permission-matrix/AccessStateDefinitionsPanel";
import {
  PermissionWorkspaceTabs,
  TAB_DEFS,
  type WorkspaceTab,
} from "@/components/admin/permission-matrix/PermissionWorkspaceTabs";
import { PermissionFilters, type FiltersState } from "@/components/admin/permission-matrix/PermissionFilters";
import { RoleMatrix } from "@/components/admin/permission-matrix/RoleMatrix";
import { RoleDetailPanel } from "@/components/admin/permission-matrix/RoleDetailPanel";
import { FeatureRegistryTable } from "@/components/admin/permission-matrix/FeatureRegistryTable";
import { UserOverrideTable } from "@/components/admin/permission-matrix/UserOverrideTable";
import { PermissionTemplateTable } from "@/components/admin/permission-matrix/PermissionTemplateTable";
import { PendingApprovalTable } from "@/components/admin/permission-matrix/PendingApprovalTable";
import { PermissionHistoryTable } from "@/components/admin/permission-matrix/PermissionHistoryTable";
import { FeatureDetailsDrawer } from "@/components/admin/permission-matrix/FeatureDetailsDrawer";
import { PermissionDetailsDrawer } from "@/components/admin/permission-matrix/PermissionDetailsDrawer";
import { ReviewChangesDrawer } from "@/components/admin/permission-matrix/ReviewChangesDrawer";
import { ErrorState, LoadingSkeleton } from "@/components/admin/permission-matrix/EmptyState";

const VALID_TABS = new Set<WorkspaceTab>(TAB_DEFS.map((t) => t.key));

function useIsMobile() {
  const [m, setM] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1024px)");
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return m;
}

const TITLE = "Feature Registry & Permission Matrix";
const SUBTITLE = "Configure platform features, role permissions, individual overrides and privileged access controls.";

export default function AdminPermissionMatrix() {
  const navigate = useNavigate();
  const perms = useAdminPermissions();
  const canManage = perms.has("permissions.manage_permissions");
  const isMobile = useIsMobile();

  const [params, setParams] = useSearchParams();
  const rawTab = params.get("tab") as WorkspaceTab | null;
  const activeTab: WorkspaceTab = rawTab && VALID_TABS.has(rawTab)
    ? rawTab
    : (isMobile ? "role-detail" : "role-matrix");

  const setTab = (t: WorkspaceTab, extra?: Record<string, string>) => {
    const next = new URLSearchParams(params);
    next.set("tab", t);
    if (extra) for (const [k, v] of Object.entries(extra)) next.set(k, v);
    setParams(next, { replace: true });
  };

  const [filters, setFilters] = useState<FiltersState>({
    role: params.get("role") ?? "all",
    module: params.get("module") ?? "all",
    risk: params.get("risk") ?? "all",
    search: "",
  });

  useEffect(() => {
    if (params.get("risk") && params.get("risk") !== filters.risk) {
      setFilters((f) => ({ ...f, risk: params.get("risk")! }));
    }
  }, [params]);

  const rolesQuery = useQuery({
    queryKey: ["perm-workspace", "role-map"],
    queryFn: () => fetchRoleGrantMap(true),
    staleTime: 60_000,
  });
  // Hydrate module catalog + risk levels from DB (permissions table).
  useQuery({
    queryKey: ["perm-workspace", "feature-catalog"],
    queryFn: async () => {
      const rows = await permissionRepo.listFeatures();
      hydratePermissionCatalog(rows.map((r) => ({
        key: r.key, module: r.module, action: r.action, label: r.label,
        risk_level: r.risk_level, module_label: r.module_label,
      })));
      return rows;
    },
    staleTime: 5 * 60_000,
  });
  // Hydrate permission dependency graph from DB (permission_dependencies).
  useQuery({
    queryKey: ["perm-workspace", "dependency-catalog"],
    queryFn: async () => {
      try {
        const rows = await permissionRepo.listPermissionDependencies();
        hydratePermissionDependencies(rows);
        return rows;
      } catch {
        // Fallback to compiled defaults if the table is unreachable.
        return [];
      }
    },
    staleTime: 5 * 60_000,
  });
  // Hydrate SoD conflict rules from DB (permission_conflicts).
  useQuery({
    queryKey: ["perm-workspace", "conflict-catalog"],
    queryFn: async () => {
      try {
        const rows = await permissionRepo.listPermissionConflicts();
        hydratePermissionConflicts(rows);
        return rows;
      } catch {
        return [];
      }
    },
    staleTime: 5 * 60_000,
  });
  const summaryQuery = useQuery({
    queryKey: ["perm-workspace", "summary"],
    queryFn: fetchWorkspaceSummary,
    staleTime: 30_000,
  });
  const overridesQuery = useQuery({
    queryKey: ["perm-workspace", "overrides"],
    queryFn: fetchOverrides,
    staleTime: 30_000,
  });
  const approvalsQuery = useQuery({
    queryKey: ["perm-workspace", "approvals"],
    queryFn: fetchPendingApprovals,
    staleTime: 20_000,
  });
  const historyQuery = useQuery({
    queryKey: ["perm-workspace", "history", params.get("since") ?? "all"],
    queryFn: () => fetchChangeHistory(
      100,
      params.get("since") === "24h" ? 24 : undefined,
    ),
    staleTime: 30_000,
  });

  const overrideCountByPerm = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of overridesQuery.data ?? []) {
      map.set(o.permission_key, (map.get(o.permission_key) ?? 0) + 1);
    }
    return map;
  }, [overridesQuery.data]);

  const [featureKey, setFeatureKey] = useState<string | null>(null);
  const [featureOpen, setFeatureOpen] = useState(false);
  const [override, setOverride] = useState<OverrideRow | null>(null);
  const [approval, setApproval] = useState<ApprovalRow | null>(null);
  const [history, setHistory] = useState<HistoryRow | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  const openFeature = (k: string) => { setFeatureKey(k); setFeatureOpen(true); };
  const openOverride = (o: OverrideRow) => setOverride(o);
  const openApproval = (a: ApprovalRow) => { setApproval(a); setHistory(null); setReviewOpen(true); };
  const openHistory = (h: HistoryRow) => { setHistory(h); setApproval(null); setReviewOpen(true); };

  const handleOpenFromCard = (target: Parameters<React.ComponentProps<typeof PermissionSummaryCards>["onOpen"]>[0], filter?: string) => {
    if (target === "feature-registry" && filter === "privileged") {
      setFilters((f) => ({ ...f, risk: "privileged" }));
    }
    if (target === "change-history") {
      setTab(target, { since: "24h" });
    } else {
      setTab(target);
    }
  };

  const securityLevel: { label: string; tone: string } = canManage
    ? { label: "High", tone: "bg-amber-500/15 text-amber-300 border-amber-500/30" }
    : perms.has("permissions.view")
      ? { label: "Read-only", tone: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" }
      : { label: "Restricted", tone: "bg-destructive/15 text-destructive border-destructive/30" };

  const tabCounts: Partial<Record<WorkspaceTab, number>> = {
    "user-overrides": overridesQuery.data?.length,
    "pending-approvals": approvalsQuery.data?.length,
    "change-history": historyQuery.data?.length,
  };

  const activeTabResolved: WorkspaceTab = activeTab === "role-matrix" && isMobile ? "role-detail" : activeTab;

  const StickySubHeader = (
    <div className="sticky top-0 z-30 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold ${securityLevel.tone}`}>
            <Shield className="h-3 w-3" /> Security level: {securityLevel.label}
          </span>
          {(summaryQuery.data?.pending_total ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs font-semibold text-amber-300">
              <ShieldAlert className="h-3 w-3" /> {summaryQuery.data?.pending_total} pending
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTab("change-history")}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            <History className="h-3.5 w-3.5" /> History
          </button>
          <button
            type="button"
            disabled={!canManage}
            onClick={() => navigate("/admin/access-control")}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-[0_1px_0_hsl(var(--primary-foreground)/0.2)_inset] hover:bg-primary/90 disabled:opacity-50"
            title={canManage ? "Edit role assignments in Users & Access" : "You do not have permission to edit"}
          >
            Manage in Users &amp; Access <ArrowUpRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );

  const filterBar = (
    <PermissionFilters
      value={filters}
      onChange={setFilters}
      showModule={activeTabResolved !== "user-overrides" && activeTabResolved !== "pending-approvals" && activeTabResolved !== "change-history"}
      showRisk={activeTabResolved === "feature-registry"}
      showRole={activeTabResolved === "role-matrix" || activeTabResolved === "feature-registry"}
    />
  );

  return (
    <AdminLayout
      title={TITLE}
      subtitle={SUBTITLE}
      hideDefaultHeaders
      mobileHeaderSlot={({ onOpenMenu }) => (
        <AdminMobileHeader onOpenMenu={onOpenMenu} title={TITLE} subtitle={SUBTITLE} />
      )}
      headerSlot={
        <>
          <AdminHeader title={TITLE} subtitle={SUBTITLE} />
          {StickySubHeader}
        </>
      }
    >
      <div className="relative w-full max-w-full space-y-6 overflow-x-hidden bg-[radial-gradient(ellipse_at_top_left,hsl(var(--primary)/0.06),transparent_60%)]">
        <HowPermissionsWorkPanel />

        <AccessStateDefinitionsPanel />

        <PermissionSummaryCards
          summary={summaryQuery.data ?? null}
          loading={summaryQuery.isLoading}
          onOpen={handleOpenFromCard}
        />

        <PermissionWorkspaceTabs
          active={activeTabResolved}
          onChange={setTab}
          counts={tabCounts}
        />

        {activeTabResolved === "feature-registry" && filterBar}

        {/* Role Matrix */}
        {activeTabResolved === "role-matrix" && (
          <>
            {rolesQuery.isLoading && <LoadingSkeleton rows={8} />}
            {rolesQuery.error && <ErrorState message={(rolesQuery.error as Error).message} onRetry={() => rolesQuery.refetch()} />}
            {rolesQuery.data && (
              <RoleMatrix
                roleMap={rolesQuery.data}
                canWrite={canManage}
                onSubmitted={() => { rolesQuery.refetch(); approvalsQuery.refetch(); historyQuery.refetch(); }}
              />
            )}
          </>
        )}

        {/* Role Detail */}
        {activeTabResolved === "role-detail" && (
          <>
            {rolesQuery.isLoading && <LoadingSkeleton rows={8} />}
            {rolesQuery.data && (
              <RoleDetailPanel
                roleMap={rolesQuery.data}
                role={((params.get("role") as InternalRoleKey) || undefined)}
                onRoleChange={(r) => setParams((p) => { p.set("role", r); return p; }, { replace: true })}
              />
            )}
          </>
        )}

        {/* Feature Registry */}
        {activeTabResolved === "feature-registry" && (
          <>
            {rolesQuery.isLoading && <LoadingSkeleton rows={8} />}
            {rolesQuery.data && (
              <FeatureRegistryTable
                roleMap={rolesQuery.data}
                filters={filters}
                overrideCountByPerm={overrideCountByPerm}
                onRowClick={openFeature}
              />
            )}
          </>
        )}

        {/* User Overrides */}
        {activeTabResolved === "user-overrides" && (
          <>
            {overridesQuery.isLoading && <LoadingSkeleton rows={6} />}
            {overridesQuery.error && <ErrorState message={(overridesQuery.error as Error).message} onRetry={() => overridesQuery.refetch()} />}
            {overridesQuery.data && <UserOverrideTable rows={overridesQuery.data} onRowClick={openOverride} />}
          </>
        )}

        {/* Templates */}
        {activeTabResolved === "permission-templates" && (
          <PermissionTemplateTable canEdit={canManage} />
        )}

        {/* Pending Approvals */}
        {activeTabResolved === "pending-approvals" && (
          <>
            {approvalsQuery.isLoading && <LoadingSkeleton rows={5} />}
            {approvalsQuery.error && <ErrorState message={(approvalsQuery.error as Error).message} onRetry={() => approvalsQuery.refetch()} />}
            {approvalsQuery.data && <PendingApprovalTable rows={approvalsQuery.data} />}
          </>
        )}

        {/* Change History */}
        {activeTabResolved === "change-history" && (
          <>
            {historyQuery.isLoading && <LoadingSkeleton rows={6} />}
            {historyQuery.error && <ErrorState message={(historyQuery.error as Error).message} onRetry={() => historyQuery.refetch()} />}
            {historyQuery.data && <PermissionHistoryTable rows={historyQuery.data} onRowClick={openHistory} />}
          </>
        )}
      </div>

      {rolesQuery.data && (
        <FeatureDetailsDrawer
          permissionKey={featureKey}
          open={featureOpen}
          onOpenChange={setFeatureOpen}
          roleMap={rolesQuery.data}
          overrideCount={featureKey ? (overrideCountByPerm.get(featureKey) ?? 0) : 0}
        />
      )}
      <PermissionDetailsDrawer
        override={override}
        open={!!override}
        onOpenChange={(v) => { if (!v) setOverride(null); }}
      />
      <ReviewChangesDrawer
        approval={approval}
        history={history}
        open={reviewOpen}
        onOpenChange={(v) => { setReviewOpen(v); if (!v) { setApproval(null); setHistory(null); } }}
      />
    </AdminLayout>
  );
}
