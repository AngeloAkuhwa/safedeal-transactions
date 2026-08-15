import { useMemo, useState } from "react";
import { ClipboardList, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InternalRoleKey } from "@/services/permission-catalog";
import { ROLE_LABEL } from "@/services/permission-catalog";
import { type PermissionEnvironment, DEFAULT_ENVIRONMENT } from "@/services/permission-repository";
import type { RoleGrantMap } from "@/services/permission-workspace.service";
import type { StagedChange } from "@/hooks/useStagedPermissionChanges";
import { evaluateApproval } from "@/services/permission-approval-rules";

interface Props {
  changes: StagedChange[];
  roleMap: RoleGrantMap;
  environment?: PermissionEnvironment;
  onDiscard: () => void;
  onReview: () => void;
}

export function StagedChangesFooter({ changes, environment = DEFAULT_ENVIRONMENT, onDiscard, onReview }: Props) {
  const [expanded, setExpanded] = useState(false);

  // Hooks must run on every render, including the empty-changes render below.
  const byRole = useMemo(() => {
    const map = new Map<InternalRoleKey, StagedChange[]>();
    for (const c of changes) {
      const bag = map.get(c.role) ?? [];
      bag.push(c);
      map.set(c.role, bag);
    }
    return map;
  }, [changes]);

  const requiresApproval = useMemo(() => {
    for (const [role, list] of byRole) {
      const adds = list.filter((c) => c.op === "grant").map((c) => c.permissionKey);
      const removes = list.filter((c) => c.op === "revoke").map((c) => c.permissionKey);
      if (evaluateApproval({ targetScope: "role", targetKey: role, addedKeys: adds, removedKeys: removes }).requires) return true;
    }
    return false;
  }, [byRole]);

  if (changes.length === 0) return null;

  return (
    <div className="sticky bottom-4 z-40 mx-auto max-w-[1400px]">
      <div className="rounded-2xl border border-primary/40 bg-card/95 p-4 shadow-2xl backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px]">
            <div className="flex items-center gap-2 text-sm font-semibold">
              {changes.length} change{changes.length === 1 ? "" : "s"} staged across {byRole.size} role{byRole.size === 1 ? "" : "s"}
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">{environment}</span>
              {requiresApproval && (
                <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-300">Approval required</span>
              )}
            </div>
            <button type="button" onClick={() => setExpanded((e) => !e)} className="mt-0.5 inline-flex min-h-11 items-center text-xs text-muted-foreground hover:text-foreground">
              {expanded ? "Hide details" : "Show details"}
            </button>
          </div>
          <button
            type="button"
            onClick={onDiscard}
            className="inline-flex h-11 items-center gap-1 rounded-md border border-border bg-background/60 px-3 text-xs font-medium hover:bg-muted"
          >
            <XCircle className="h-3.5 w-3.5" /> Discard
          </button>
          <button
            type="button"
            onClick={onReview}
            className="inline-flex h-11 items-center gap-1.5 rounded-md bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <ClipboardList className="h-3.5 w-3.5" />
            Review changes
          </button>
        </div>

        {expanded && (
          <div className="mt-3 max-h-56 overflow-auto rounded-md border border-border/60 bg-background/30 p-2">
            {[...byRole.entries()].map(([role, list]) => (
              <div key={role} className="mb-2 last:mb-0">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {ROLE_LABEL[role]} · {list.length}
                </div>
                <ul className="mt-1 space-y-0.5">
                  {list.map((c) => (
                    <li key={`${c.role}:${c.permissionKey}`} className="flex items-center gap-2 text-xs">
                      <span
                        className={cn(
                          "inline-flex h-5 min-w-[52px] items-center justify-center rounded-full px-2 text-xs font-semibold",
                          c.op === "grant" ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300",
                        )}
                      >
                        {c.op === "grant" ? "Grant" : "Revoke"}
                      </span>
                      <code className="text-muted-foreground">{c.permissionKey}</code>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
