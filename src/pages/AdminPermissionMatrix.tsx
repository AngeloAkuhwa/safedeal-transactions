import { Check } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import {
  INTERNAL_ROLES,
  PERMISSION_MODULES,
  ROLE_LABEL,
  type InternalRoleKey,
} from "@/services/permission-catalog";

// Static role→permission mapping mirroring the seed in the internal_roles/permissions tables.
// This surface is read-only; editing lives inside Users & Access › Review Permissions.
const ROLE_PERMISSIONS: Record<InternalRoleKey, Set<string>> = {
  super_admin: new Set(
    PERMISSION_MODULES.flatMap((m) => m.permissions.map((p) => p.key)),
  ),
  senior_admin: new Set([
    "dashboard.view", "dashboard.export",
    "transactions.view", "transactions.update", "transactions.export", "transactions.escalate",
    "escrow.view", "escrow.update", "escrow.export",
    "disputes.view", "disputes.assign", "disputes.reassign", "disputes.escalate", "disputes.export",
    "identity_verification.view", "identity_verification.escalate",
    "task_orchestration.view", "task_orchestration.assign", "task_orchestration.reassign",
    "agent_performance.view", "agent_performance.export",
    "flagged_users.view", "flagged_users.update", "flagged_users.suspend", "flagged_users.export",
    "users_and_access.view", "users_and_access.update", "users_and_access.suspend", "users_and_access.export",
    "audit_logs.view", "audit_logs.export",
    "reports.view", "reports.export",
  ]),
  dispute_manager: new Set([
    "dashboard.view",
    "disputes.view", "disputes.assign", "disputes.reassign", "disputes.resolve", "disputes.escalate", "disputes.approve", "disputes.reject", "disputes.export",
    "transactions.view", "task_orchestration.view", "task_orchestration.assign", "task_orchestration.reassign",
    "agent_performance.view", "audit_logs.view",
  ]),
  dispute_agent: new Set([
    "dashboard.view", "disputes.view", "disputes.update", "disputes.resolve", "transactions.view",
  ]),
  support_agent: new Set([
    "dashboard.view", "transactions.view", "disputes.view",
  ]),
  identity_officer: new Set([
    "dashboard.view",
    "identity_verification.view", "identity_verification.approve", "identity_verification.reject", "identity_verification.escalate", "identity_verification.export",
  ]),
  finance_operator: new Set([
    "dashboard.view", "escrow.view", "escrow.update",
    "financial_controls.view", "financial_controls.create",
    "reports.view",
  ]),
  finance_approver: new Set([
    "dashboard.view", "escrow.view", "escrow.approve",
    "financial_controls.view", "financial_controls.approve", "financial_controls.reject", "financial_controls.configure",
    "reports.view", "reports.export",
  ]),
  compliance_officer: new Set([
    "dashboard.view", "audit_logs.view", "audit_logs.export",
    "flagged_users.view", "flagged_users.update", "flagged_users.suspend",
    "identity_verification.view", "reports.view", "reports.export",
  ]),
  auditor: new Set([
    "dashboard.view", "transactions.view", "escrow.view", "disputes.view",
    "audit_logs.view", "audit_logs.export", "reports.view", "reports.export",
  ]),
};

export default function AdminPermissionMatrix() {
  return (
    <AdminLayout
      title="Permission Matrix"
      subtitle="Read-only view of default permissions granted to each internal role."
    >
      <div className="space-y-6">
        {PERMISSION_MODULES.map((module) => (
          <section key={module.key} className="rounded-xl border border-border bg-card">
            <header className="border-b border-border px-5 py-3">
              <h3 className="text-sm font-semibold text-foreground">{module.label}</h3>
              <p className="text-xs text-muted-foreground">{module.permissions.length} permissions</p>
            </header>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="sticky left-0 z-10 min-w-[220px] bg-muted/40 px-4 py-2 text-left font-medium">Permission</th>
                    {INTERNAL_ROLES.map((r) => (
                      <th key={r.key} className="px-3 py-2 text-center font-medium">
                        <div className="whitespace-nowrap">{ROLE_LABEL[r.key]}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {module.permissions.map((perm) => (
                    <tr key={perm.key} className="border-b border-border/60 last:border-0">
                      <td className="sticky left-0 z-10 min-w-[220px] bg-card px-4 py-2 text-foreground/90">
                        {perm.label}
                        <div className="text-[11px] font-mono text-muted-foreground">{perm.key}</div>
                      </td>
                      {INTERNAL_ROLES.map((r) => {
                        const has = ROLE_PERMISSIONS[r.key].has(perm.key);
                        return (
                          <td key={r.key} className="px-3 py-2 text-center">
                            {has ? (
                              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300">
                                <Check className="h-3.5 w-3.5" />
                              </span>
                            ) : (
                              <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </AdminLayout>
  );
}