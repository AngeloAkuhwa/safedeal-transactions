import { findPermissionEntry, getPermissionRisk, isPrivilegedPermission } from "@/services/permission-catalog";
import { ShieldAlert, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DiffRow {
  permissionKey: string;
  op: "grant" | "revoke";
  impactedUsers?: number | null;
  dependencies?: string[];
  conflicts?: string[];
}

export function PermissionDiffTable({ rows, className }: { rows: DiffRow[]; className?: string }) {
  if (!rows.length) return <div className="rounded border border-border/60 bg-background/40 p-3 text-xs text-muted-foreground">No changes.</div>;
  return (
    <div className={cn("overflow-x-auto rounded-lg border border-border/60 bg-background/40", className)}>
      <table className="w-full min-w-[720px] text-xs sd-stack">
        <thead>
          <tr className="text-xs uppercase tracking-wider text-muted-foreground">
            <th className="px-3 py-2 text-left font-medium">Permission</th>
            <th className="px-3 py-2 text-left font-medium">Module</th>
            <th className="px-3 py-2 text-left font-medium">Risk</th>
            <th className="px-3 py-2 text-left font-medium">Change</th>
            <th className="px-3 py-2 text-right font-medium">Users</th>
            <th className="px-3 py-2 text-left font-medium">Deps / Conflicts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const entry = findPermissionEntry(r.permissionKey);
            const risk = getPermissionRisk(r.permissionKey);
            const privileged = isPrivilegedPermission(r.permissionKey);
            const riskTone =
              risk === "critical" ? "bg-red-500/15 text-red-300"
              : risk === "high" ? "bg-amber-500/15 text-amber-300"
              : risk === "medium" ? "bg-sky-500/15 text-sky-300"
              : "bg-muted text-muted-foreground";
            return (
              <tr key={`${r.permissionKey}-${r.op}`} className="border-t border-border/40 hover:bg-muted/20">
                <td className="px-3 py-2 font-mono text-xs">
                  <div className="flex items-center gap-1.5">
                    {privileged && <ShieldAlert className="h-3 w-3 text-amber-300" />}
                    <span className="truncate">{r.permissionKey}</span>
                  </div>
                  {entry?.label && <div className="text-xs text-muted-foreground">{entry.label}</div>}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{entry?.moduleLabel ?? r.permissionKey.split(".")[0]}</td>
                <td className="px-3 py-2">
                  <span className={cn("rounded px-1.5 py-0.5 text-xs uppercase font-medium", riskTone)}>{risk}</span>
                </td>
                <td className="px-3 py-2">
                  <span className={cn("inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium",
                    r.op === "grant" ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300")}>
                    {r.op === "grant" ? "Off" : "On"} <ArrowRight className="h-3 w-3" /> {r.op === "grant" ? "On" : "Off"}
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-mono text-muted-foreground">{r.impactedUsers ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {r.dependencies?.length ? <div>needs: <span className="font-mono">{r.dependencies.join(", ")}</span></div> : null}
                  {r.conflicts?.length ? <div className="text-rose-300">conflicts: <span className="font-mono">{r.conflicts.join(", ")}</span></div> : null}
                  {!r.dependencies?.length && !r.conflicts?.length && <span>—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}