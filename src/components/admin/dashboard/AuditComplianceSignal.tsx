import { ScrollText, ShieldAlert, UserX, KeyRound, FileCheck2 } from "lucide-react";
import type { AuditComplianceSignal as AuditSignal } from "@/services/admin-dashboard.service";
import { useAdminNav } from "../useAdminNav";
import { formatRelative } from "./relative";

const COMPLIANCE_BADGE: Record<AuditSignal["compliance_status"], string> = {
  green: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  amber: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  red: "bg-red-500/15 text-red-300 border-red-500/30",
};

const COMPLIANCE_LABEL: Record<AuditSignal["compliance_status"], string> = {
  green: "Healthy",
  amber: "Attention",
  red: "At risk",
};

interface Props { signal: AuditSignal }

export function AuditComplianceSignalCard({ signal }: Props) {
  const { go } = useAdminNav();
  const rows = [
    {
      icon: ScrollText,
      label: "Last audit log entry",
      value: signal.last_audit_entry
        ? `${signal.last_audit_entry.actor} • ${signal.last_audit_entry.summary}`
        : "No entries",
      meta: signal.last_audit_entry ? formatRelative(signal.last_audit_entry.at_iso) : "—",
      onClick: () => go("/admin/audit-logs", "Audit Logs"),
    },
    {
      icon: ShieldAlert,
      label: "High-severity admin actions (24h)",
      value: `${signal.high_severity_actions_24h}`,
      meta: "View log",
      onClick: () => go("/admin/audit-logs", "Audit Logs"),
    },
    {
      icon: UserX,
      label: "Impersonation sessions (24h)",
      value: `${signal.impersonation_sessions_24h}`,
      meta: "Audited",
      onClick: () => go("/admin/audit-logs", "Audit Logs"),
    },
    {
      icon: KeyRound,
      label: "Failed admin logins (24h)",
      value: `${signal.failed_admin_logins_24h}`,
      meta: signal.failed_admin_logins_24h > 0 ? "Investigate" : "All clear",
      onClick: () => go("/admin/access-control", "Access Control"),
    },
  ];

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Audit & Compliance Signal</h3>
        <span
          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${COMPLIANCE_BADGE[signal.compliance_status]}`}
        >
          <FileCheck2 className="h-3 w-3" />
          Compliance: {COMPLIANCE_LABEL[signal.compliance_status]}
        </span>
      </div>
      <ul className="divide-y divide-border">
        {rows.map((r) => {
          const Icon = r.icon;
          return (
            <li key={r.label}>
              <button
                type="button"
                onClick={r.onClick}
                className="flex w-full items-center justify-between gap-3 py-2.5 text-left transition-colors hover:bg-muted/40 min-h-11"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="truncate text-xs text-muted-foreground">{r.label}</div>
                    <div className="truncate text-sm text-foreground">{r.value}</div>
                  </div>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">{r.meta}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 text-xs text-muted-foreground">
        Compliance last checked {formatRelative(signal.compliance_last_check_iso)}
      </div>
    </div>
  );
}