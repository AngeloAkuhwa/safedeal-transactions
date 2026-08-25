import { Link } from "react-router";
import { relativeTime, type AccessAuditEntry } from "@/services/admin-access-control.service";
import { ADMIN_TONE } from "@/components/admin/palette";

const SEVERITY_TINT: Record<string, string> = {
  info: `${ADMIN_TONE.info.panel} text-blue-300`,
  warning: `${ADMIN_TONE.warning.panel} ${ADMIN_TONE.warning.text}`,
  critical: "bg-red-500/10 text-red-300 border-red-500/40",
};

interface Props {
  entries: AccessAuditEntry[] | undefined;
}

function humanize(action: string): string {
  return action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatValue(v: unknown): string {
  if (v == null) return "—";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/**
 * Expanded access-history view with Prev/New values, reason, approval status,
 * approver and a deep-link to the underlying audit event.
 */
export function AccessHistoryTimeline({ entries }: Props) {
  const items = entries ?? [];
  if (items.length === 0) {
    return <div className="text-xs text-muted-foreground">No changes recorded.</div>;
  }
  return (
    <div className="space-y-2">
      {items.map((a) => {
        const meta = (a.metadata ?? {}) as Record<string, unknown>;
        const prev = meta.before ?? meta.prev_value ?? meta.previous;
        const next = meta.after  ?? meta.new_value  ?? meta.next;
        const reason = typeof meta.reason === "string" ? meta.reason : null;
        const approval = typeof meta.approval_status === "string" ? meta.approval_status : null;
        const approver = typeof meta.approver_name === "string" ? meta.approver_name : null;
        return (
          <div
            key={a.id}
            className={`rounded-lg border px-3 py-2 text-xs ${SEVERITY_TINT[a.severity] ?? SEVERITY_TINT.info}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="font-semibold text-foreground">{humanize(a.action)}</div>
              <Link
                to={`/admin/audit-logs?event=${a.id}&action=${encodeURIComponent(a.action)}`}
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                View in audit logs
              </Link>
            </div>
            {a.detail && <div className="mt-0.5">{a.detail}</div>}

            {(prev !== undefined || next !== undefined) && (
              <div className="mt-1.5 grid grid-cols-2 gap-2 rounded-md border border-border/50 bg-background/40 p-2">
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Previous</div>
                  <div className="text-foreground/80">{formatValue(prev)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">New</div>
                  <div className="text-foreground/80">{formatValue(next)}</div>
                </div>
              </div>
            )}

            {(reason || approval || approver) && (
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                {reason && <span><span className="text-foreground/60">Reason:</span> {reason}</span>}
                {approval && <span><span className="text-foreground/60">Approval:</span> {approval}</span>}
                {approver && <span><span className="text-foreground/60">Approver:</span> {approver}</span>}
              </div>
            )}

            <div className="mt-1 text-xs text-muted-foreground">
              {a.actor_name} · {relativeTime(a.created_at)}
            </div>
          </div>
        );
      })}
    </div>
  );
}