import { Link } from "react-router-dom";
import { ROLE_LABEL } from "@/services/permission-catalog";
import type { OverrideRow } from "@/services/permission-workspace.service";
import { PermissionRiskBadge } from "./PermissionRiskBadge";
import { EmptyState } from "./EmptyState";
import { ArrowUpRight } from "lucide-react";

export function UserOverrideTable({ rows, onRowClick }: { rows: OverrideRow[]; onRowClick?: (r: OverrideRow) => void }) {
  if (!rows.length) return <EmptyState title="No overrides recorded" description="User-specific grants and revokes will show up here." />;
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2 text-left font-medium">User</th>
              <th className="px-4 py-2 text-left font-medium">Role</th>
              <th className="px-4 py-2 text-left font-medium">Permission</th>
              <th className="px-4 py-2 text-left font-medium">Mode</th>
              <th className="px-4 py-2 text-left font-medium">Reason</th>
              <th className="px-4 py-2 text-right font-medium">Manage</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.user_id + r.permission_key + i} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                <td className="px-4 py-2">
                  <div className="text-sm font-medium text-foreground">{r.user_name}</div>
                  <div className="text-[11px] text-muted-foreground">{r.user_email}</div>
                </td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{r.user_role ? ROLE_LABEL[r.user_role] : "—"}</td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <div>
                      <div className="text-sm">{r.permission_label.split("—")[1]?.trim() ?? r.permission_label}</div>
                      <div className="text-[11px] font-mono text-muted-foreground">{r.permission_key}</div>
                    </div>
                    {r.privileged && <PermissionRiskBadge privileged size="xs" />}
                  </div>
                </td>
                <td className="px-4 py-2">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${r.mode === "grant" ? "bg-emerald-500/15 text-emerald-300" : "bg-destructive/15 text-destructive"}`}>
                    {r.mode === "grant" ? "+ Grant" : "− Revoke"}
                  </span>
                </td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{r.reason ?? <span className="italic">—</span>}</td>
                <td className="px-4 py-2 text-right">
                  <Link
                    to={`/admin/access-control?user=${r.user_id}`}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                    onClick={() => onRowClick?.(r)}
                  >
                    Open <ArrowUpRight className="h-3 w-3" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
