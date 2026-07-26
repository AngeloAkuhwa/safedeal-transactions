import { useState } from "react";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InternalRoleKey } from "@/services/permission-catalog";
import { ROLE_LABEL } from "@/services/permission-catalog";
import { permissionRepo } from "@/services/permission-repository";
import type { RoleGrantMap } from "@/services/permission-workspace.service";
import type { StagedChange } from "@/hooks/useStagedPermissionChanges";
import { toast } from "sonner";

interface Props {
  changes: StagedChange[];
  roleMap: RoleGrantMap;
  onDiscard: () => void;
  onSubmitted: () => void;
}

export function StagedChangesFooter({ changes, roleMap, onDiscard, onSubmitted }: Props) {
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [expanded, setExpanded] = useState(false);

  if (changes.length === 0) return null;

  const byRole = new Map<InternalRoleKey, StagedChange[]>();
  for (const c of changes) {
    const bag = byRole.get(c.role) ?? [];
    bag.push(c);
    byRole.set(c.role, bag);
  }

  const submit = async () => {
    setBusy(true);
    try {
      for (const [role, list] of byRole) {
        const before = Array.from(roleMap.map.get(role) ?? []).sort();
        const after = new Set(before);
        for (const c of list) {
          if (c.op === "grant") after.add(c.permissionKey);
          else after.delete(c.permissionKey);
        }
        await permissionRepo.submitChangeSet({
          target_scope: "role",
          target_key: role,
          before: { permission_keys: before },
          after: { permission_keys: Array.from(after).sort() },
          reason: reason.trim() || `Bulk edit: ${list.length} change(s) on ${ROLE_LABEL[role]}`,
        });
      }
      toast.success(`Submitted ${byRole.size} change set(s) for approval`);
      onSubmitted();
    } catch (e) {
      toast.error((e as Error).message || "Failed to submit changes");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sticky bottom-4 z-40 mx-auto max-w-[1400px]">
      <div className="rounded-2xl border border-primary/40 bg-card/95 p-4 shadow-2xl backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px]">
            <div className="text-sm font-semibold">
              {changes.length} change{changes.length === 1 ? "" : "s"} staged across {byRole.size} role{byRole.size === 1 ? "" : "s"}
            </div>
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="mt-0.5 text-xs text-muted-foreground hover:text-foreground"
            >
              {expanded ? "Hide" : "Review"} details
            </button>
          </div>
          <input
            className="h-9 min-w-[220px] flex-1 rounded-md border border-border bg-background/60 px-3 text-xs outline-none focus:border-primary"
            placeholder="Reason (optional, shown in audit trail)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <button
            type="button"
            disabled={busy}
            onClick={onDiscard}
            className="inline-flex h-9 items-center gap-1 rounded-md border border-border bg-background/60 px-3 text-xs font-medium hover:bg-muted disabled:opacity-50"
          >
            <XCircle className="h-3.5 w-3.5" /> Discard
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={submit}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Submit for approval
          </button>
        </div>

        {expanded && (
          <div className="mt-3 max-h-56 overflow-auto rounded-md border border-border/60 bg-background/30 p-2">
            {[...byRole.entries()].map(([role, list]) => (
              <div key={role} className="mb-2 last:mb-0">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {ROLE_LABEL[role]} · {list.length}
                </div>
                <ul className="mt-1 space-y-0.5">
                  {list.map((c) => (
                    <li key={`${c.role}:${c.permissionKey}`} className="flex items-center gap-2 text-xs">
                      <span
                        className={cn(
                          "inline-flex h-5 min-w-[52px] items-center justify-center rounded-full px-2 text-[10px] font-semibold",
                          c.op === "grant"
                            ? "bg-emerald-500/20 text-emerald-300"
                            : "bg-rose-500/20 text-rose-300",
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