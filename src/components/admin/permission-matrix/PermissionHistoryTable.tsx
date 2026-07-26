import { formatDistanceToNow } from "date-fns";
import { HISTORY_ACTION_LABEL, type HistoryRow } from "@/services/permission-workspace.service";
import { EmptyState } from "./EmptyState";

export function PermissionHistoryTable({ rows, onRowClick }: { rows: HistoryRow[]; onRowClick?: (r: HistoryRow) => void }) {
  if (!rows.length) return <EmptyState title="No recorded changes" description="Role assignments and override activity will appear here." />;
  return (
    <div className="rounded-2xl border border-border/50 bg-card/60 p-2 backdrop-blur-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-separate border-spacing-y-1 text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2 text-left font-medium">When</th>
              <th className="px-4 py-2 text-left font-medium">Action</th>
              <th className="px-4 py-2 text-left font-medium">Target</th>
              <th className="px-4 py-2 text-left font-medium">Actor</th>
              <th className="px-4 py-2 text-left font-medium">Summary</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className="cursor-pointer transition hover:bg-muted/30 [&>td]:bg-background/30 [&>td:first-child]:rounded-l-lg [&>td:last-child]:rounded-r-lg"
                onClick={() => onRowClick?.(r)}
              >
                <td className="px-4 py-3 align-middle text-xs text-muted-foreground whitespace-nowrap">{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</td>
                <td className="px-4 py-3 align-middle">
                  <span className="inline-flex rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                    {HISTORY_ACTION_LABEL[r.action_type] ?? r.action_type}
                  </span>
                </td>
                <td className="px-4 py-3 align-middle text-xs">{r.target_user_name ?? <span className="text-muted-foreground italic">—</span>}</td>
                <td className="px-4 py-3 align-middle text-xs">{r.actor_name ?? <span className="text-muted-foreground italic">System</span>}</td>
                <td className="px-4 py-3 align-middle text-xs text-muted-foreground">{r.summary ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
