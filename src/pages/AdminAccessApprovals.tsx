import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowLeft, FileClock } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  listAccessChangeRequests,
  relativeTime,
} from "@/services/admin-access-control.service";

export default function AdminAccessApprovals() {
  const q = useQuery({
    queryKey: ["admin-access-approvals"],
    queryFn: () => listAccessChangeRequests("pending"),
    staleTime: 15_000,
  });

  const rows = q.data ?? [];

  return (
    <AdminLayout title="Access approvals" subtitle="Pending role changes and permission overrides">
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin/access-control"><ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back to Access & Roles</Link>
        </Button>
      </div>

      {q.isLoading ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Loading pending requests…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center">
          <FileClock className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
          <div className="text-sm font-semibold">No pending approvals</div>
          <div className="text-xs text-muted-foreground">All access change requests are up to date.</div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Type</th>
                <th className="px-4 py-2 text-left">Target user</th>
                <th className="px-4 py-2 text-left">Requested by</th>
                <th className="px-4 py-2 text-left">Summary</th>
                <th className="px-4 py-2 text-left">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const payload = r.payload as Record<string, unknown>;
                const summary = r.change_type === "role"
                  ? Array.isArray(payload.roles) ? (payload.roles as string[]).join(", ") : "—"
                  : `${payload.mode ?? ""} ${payload.permission_key ?? ""}`;
                return (
                  <tr key={r.id} className="border-t border-border/60">
                    <td className="px-4 py-2">
                      <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-300 text-[10px]">
                        {r.change_type === "role" ? "Role change" : "Permission"}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-foreground/90">{r.target_name ?? r.target_user_id}</td>
                    <td className="px-4 py-2 text-foreground/80">{r.requested_by_name ?? "—"}</td>
                    <td className="px-4 py-2 font-mono text-xs text-foreground/80">{summary}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{relativeTime(r.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}