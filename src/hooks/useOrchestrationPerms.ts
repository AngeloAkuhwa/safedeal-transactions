// Derives per-action UI flags for the Task Orchestration workspace from the
// current admin permission set. Keep in sync with the permMap in
// `supabase/functions/admin-task-orchestration-action/index.ts` and the
// role grants seeded in the DB migration.
import { useMemo } from "react";
import { useAdminPermissions } from "@/context/AdminPermissionsContext";

export interface OrchestrationPerms {
  canView: boolean;
  canViewAll: boolean;
  canViewAssigned: boolean;
  canAssign: boolean;
  canAssignSelf: boolean;
  canBulkAssign: boolean;
  canReassign: boolean;
  canRebalance: boolean;
  canEscalate: boolean;
  canManageRules: boolean;
  canExport: boolean;
  canViewAgentLoad: boolean;
  canOverrideCapacity: boolean;
  canViewHistory: boolean;
  /** Current admin user id (auth uuid). For scoped realtime filters. */
  userId: string | null;
  /** Legacy convenience flag: true when the caller can do broad operational actions. */
  isSenior: boolean;
}

export function useOrchestrationPerms(): OrchestrationPerms {
  const p = useAdminPermissions();
  return useMemo<OrchestrationPerms>(() => {
    const has = (k: string) => p.isSuper || p.has(k);
    const canAssign = has("task_orchestration.assign");
    const canBulkAssign = has("task_orchestration.bulk_assign");
    const canReassign = has("task_orchestration.reassign");
    const canRebalance = has("task_orchestration.rebalance");
    const canEscalate = has("task_orchestration.escalate");
    const canManageRules = has("task_orchestration.manage_rules");
    return {
      canView:             has("task_orchestration.view"),
      canViewAll:          has("task_orchestration.view_all"),
      canViewAssigned:     has("task_orchestration.view_assigned") || has("task_orchestration.view_all"),
      canAssign,
      canAssignSelf:       has("task_orchestration.assign_self"),
      canBulkAssign,
      canReassign,
      canRebalance,
      canEscalate,
      canManageRules,
      canExport:           has("task_orchestration.export"),
      canViewAgentLoad:    has("task_orchestration.view_agent_load"),
      canOverrideCapacity: has("task_orchestration.override_capacity"),
      canViewHistory:      has("task_orchestration.view_history"),
      userId:              p.userId,
      isSenior:            canAssign || canBulkAssign || canReassign || canRebalance || canEscalate || canManageRules,
    };
  }, [p]);
}