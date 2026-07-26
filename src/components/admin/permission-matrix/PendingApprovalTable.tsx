import { formatDistanceToNow } from "date-fns";
import { Link } from "react-router-dom";
import type { ApprovalRow } from "@/services/permission-workspace.service";
import { EmptyState } from "./EmptyState";
import { ArrowUpRight } from "lucide-react";

export function PendingApprovalTable({ rows }: { rows: ApprovalRow[] }) {
  if (!rows.length) return <EmptyState title="No pending approvals" description="Privileged role and permission changes queued for approval will show up here." />;
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-xs uppercase text-muted-foreground">
              <th className="px-4 py-2 text-left font-medium">Target user</th>
              <th className="px-4 py-2 text-left font-medium">Change type</th>
              <th className="px-4 py-2 text-left font-medium">Requested by</th>
              <th className="px-4 py-2 text-left font-medium">Reason</th>
              <th className="px-4 py-2 text-left font-medium">Age</th>
              <th className="px-4 py-2 text-right font-medium">Review</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                <td className="px-4 py-2 text-sm font-medium">{r.target_user_name}</td>
                <td className="px-4 py-2">
                  <span className="inline-flex items-center rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                    {r.change_type}
                  </span>
                </td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{r.requested_by_name}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{r.reason ?? <span className="italic">—</span>}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</td>
                <td className="px-4 py-2 text-right">
                  <Link
                    to="/admin/access-approvals"
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                  >
                    Review <ArrowUpRight className="h-3 w-3" />
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
