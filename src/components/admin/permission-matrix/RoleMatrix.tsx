import { Shield } from "lucide-react";
import type { RoleGrantMap } from "@/services/permission-workspace.service";
import { useRoleMatrixFilters } from "@/hooks/useRoleMatrixFilters";
import { useStagedPermissionChanges } from "@/hooks/useStagedPermissionChanges";
import { RoleMatrixToolbar } from "./RoleMatrixToolbar";
import { AllRolesMatrix } from "./AllRolesMatrix";
import { CompareRolesMatrix } from "./CompareRolesMatrix";
import { StagedChangesFooter } from "./StagedChangesFooter";

export function RoleMatrix({
  roleMap,
  canWrite,
  onSubmitted,
}: {
  roleMap: RoleGrantMap;
  canWrite: boolean;
  onSubmitted?: () => void;
}) {
  const { state: filters, set, toggleModule, expandAll, collapseAll, reset, isModuleExpanded, activeFilterCount } = useRoleMatrixFilters();
  const staged = useStagedPermissionChanges();

  return (
    <div className="space-y-4">
      <RoleMatrixToolbar
        filters={filters}
        set={set}
        reset={reset}
        expandAll={expandAll}
        collapseAll={collapseAll}
        activeFilterCount={activeFilterCount}
        environmentSupported={false}
        onModeChange={(mode) => set("mode", mode)}
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
          onSetCompareRoles={(roles) => set("compareRoles", roles)}
          onStageMany={staged.stageMany}
        />
      )}

      {canWrite && (
        <StagedChangesFooter
          changes={staged.flat}
          roleMap={roleMap}
          onDiscard={staged.discardAll}
          onSubmitted={() => { staged.discardAll(); onSubmitted?.(); }}
        />
      )}
    </div>
  );
}