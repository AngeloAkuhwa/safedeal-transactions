import { useCallback, useMemo, useState } from "react";
import { useEffect } from "react";
import type { InternalRoleKey } from "@/services/permission-catalog";

export type StagedOp = "grant" | "revoke";

/**
 * Module-level snapshot of the current staged-change count. Consumed by
 * cross-component guards (e.g. `EnvironmentSwitcher.beforeChange`) that
 * can't hold a reference to the owning hook instance. Kept intentionally
 * simple: a single writer (RoleMatrix) mirrors `totalChanges` here.
 */
let _stagedCount = 0;
export function getStagedPermissionChangeCount(): number { return _stagedCount; }

export interface StagedChange {
  role: InternalRoleKey;
  permissionKey: string;
  op: StagedOp;
  reason?: string;
}

export function useStagedPermissionChanges() {
  // Map<roleKey, Map<permissionKey, op>>
  const [staged, setStaged] = useState<Map<InternalRoleKey, Map<string, StagedOp>>>(new Map());

  const stage = useCallback((role: InternalRoleKey, permissionKey: string, currentlyGranted: boolean) => {
    setStaged((prev) => {
      const next = new Map(prev);
      const inner = new Map(next.get(role) ?? []);
      const desiredOp: StagedOp = currentlyGranted ? "revoke" : "grant";
      // If staging matches current state, treat as un-stage.
      const existing = inner.get(permissionKey);
      if (existing === desiredOp) {
        inner.delete(permissionKey);
      } else if (existing && existing !== desiredOp) {
        inner.delete(permissionKey);
      } else {
        inner.set(permissionKey, desiredOp);
      }
      if (inner.size === 0) next.delete(role);
      else next.set(role, inner);
      return next;
    });
  }, []);

  const stageMany = useCallback((role: InternalRoleKey, changes: Array<{ permissionKey: string; op: StagedOp }>) => {
    setStaged((prev) => {
      const next = new Map(prev);
      const inner = new Map(next.get(role) ?? []);
      for (const c of changes) inner.set(c.permissionKey, c.op);
      if (inner.size === 0) next.delete(role);
      else next.set(role, inner);
      return next;
    });
  }, []);

  const discardRole = useCallback((role: InternalRoleKey) => {
    setStaged((prev) => {
      const next = new Map(prev);
      next.delete(role);
      return next;
    });
  }, []);

  const discardAll = useCallback(() => setStaged(new Map()), []);

  const flat: StagedChange[] = useMemo(() => {
    const out: StagedChange[] = [];
    for (const [role, inner] of staged) {
      for (const [permissionKey, op] of inner) out.push({ role, permissionKey, op });
    }
    return out;
  }, [staged]);

  const totalChanges = flat.length;
  const affectedRoles = staged.size;

  useEffect(() => {
    _stagedCount = totalChanges;
    return () => { _stagedCount = 0; };
  }, [totalChanges]);

  const getStaged = useCallback((role: InternalRoleKey, permissionKey: string): StagedOp | undefined => {
    return staged.get(role)?.get(permissionKey);
  }, [staged]);

  return { staged, flat, totalChanges, affectedRoles, stage, stageMany, discardRole, discardAll, getStaged };
}