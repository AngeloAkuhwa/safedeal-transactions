import { Shield } from "lucide-react";
import type { RoleGrantMap } from "@/services/permission-workspace.service";
import type { PermissionEnvironment } from "@/services/permission-repository";
import { useRoleMatrixFilters } from "@/hooks/useRoleMatrixFilters";
import { useStagedPermissionChanges } from "@/hooks/useStagedPermissionChanges";
import { useUnsavedNavigationGuard } from "@/hooks/useUnsavedNavigationGuard";
import { RoleMatrixToolbar } from "./RoleMatrixToolbar";
import { AllRolesMatrix } from "./AllRolesMatrix";
import { CompareRolesMatrix } from "./CompareRolesMatrix";
import { StagedChangesFooter } from "./StagedChangesFooter";

export function RoleMatrix({
  roleMap,
  canWrite,
  environment,
  onSubmitted,
}: {
  roleMap: RoleGrantMap;
  canWrite: boolean;
  environment: PermissionEnvironment;
  onSubmitted?: () => void;
}) {
  const { state: filters, set, toggleModule, expandAll, collapseAll, reset, isModuleExpanded, activeFilterCount } = useRoleMatrixFilters();
  const staged = useStagedPermissionChanges();

  // Unsaved-changes guard: intercepts in-app link clicks and hard closes/reloads
  // while staged edits exist.
  useUnsavedNavigationGuard(
    staged.totalChanges > 0,
    `You have ${staged.totalChanges} staged permission change${staged.totalChanges === 1 ? "" : "s"}. Leave without submitting?`,
  );

  // Guard the mode switcher too (in-tab navigation doesn't trigger anchor clicks).
  const handleModeChange = (mode: "all" | "compare") => {
    if (staged.totalChanges > 0 && mode !== filters.mode) {
      const ok = window.confirm(
        `You have ${staged.totalChanges} staged permission change${staged.totalChanges === 1 ? "" : "s"}. Switch modes and discard them?`,
      );
      if (!ok) return;
      staged.discardAll();
    }
    set("mode", mode);
  };

  return (
    <div className="space-y-4">
      <RoleMatrixToolbar
        filters={filters}
        set={set}
        reset={reset}
        expandAll={expandAll}
        collapseAll={collapseAll}
        activeFilterCount={activeFilterCount}
        onModeChange={handleModeChange}
      />

      {!canWrite && (
        <div className="inline-flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
          <Shield className="h-3 w-3" /> You have read-only access to the Permission Matrix.
        </div>
      )}

      {filters.mode === "all" ? (
        <AllRolesMatrix
          roleMap={roleMap}
          filters={filters}
          canWrite={canWrite}
          isModuleExpanded={isModuleExpanded}
          toggleModule={toggleModule}
          getStaged={staged.getStaged}
          onStage={staged.stage}
          onStageMany={staged.stageMany}
        />
      ) : (
        <CompareRolesMatrix
          roleMap={roleMap}
          filters={filters}
          canWrite={canWrite}
          environment={environment}
          onSetCompareRoles={(roles) => set("compareRoles", roles)}
          onStageMany={staged.stageMany}
        />
      )}

      {canWrite && (
        <StagedChangesFooter
          changes={staged.flat}
          roleMap={roleMap}
          environment={environment}
          onDiscard={staged.discardAll}
          onSubmitted={() => { staged.discardAll(); onSubmitted?.(); }}
        />
      )}
    </div>
  );
}