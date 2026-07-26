import { formatDistanceToNow } from "date-fns";
import { Link } from "react-router-dom";
import type { ApprovalRow } from "@/services/permission-workspace.service";
import { EmptyState } from "./EmptyState";
import { ArrowUpRight } from "lucide-react";

export function PendingApprovalTable({ rows }: { rows: ApprovalRow[] }) {
  if (!rows.length) return <EmptyState title="No pending approvals" description="Privileged role and permission changes queued for approval will show up here." />;
  return (
    <div className="rounded-2xl border border-border/50 bg-card/60 p-2 backdrop-blur-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-separate border-spacing-y-1 text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
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
              <tr
                key={r.id}
                className="transition hover:bg-muted/30 [&>td]:bg-background/30 [&>td:first-child]:rounded-l-lg [&>td:last-child]:rounded-r-lg"
              >
                <td className="px-4 py-3 align-middle text-sm font-medium">{r.target_user_name}</td>
                <td className="px-4 py-3 align-middle">
                  <span className="inline-flex items-center rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                    {r.change_type}
                  </span>
                </td>
                <td className="px-4 py-3 align-middle text-xs text-muted-foreground">{r.requested_by_name}</td>
                <td className="px-4 py-3 align-middle text-xs text-muted-foreground">{r.reason ?? <span className="italic">—</span>}</td>
                <td className="px-4 py-3 align-middle text-xs text-muted-foreground">{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</td>
                <td className="px-4 py-3 align-middle text-right">
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
