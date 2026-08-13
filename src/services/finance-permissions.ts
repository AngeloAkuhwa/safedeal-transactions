// Single source of truth for the money-movement permission gates enforced by
// the finance edge functions. Mirrors the DB seed in `permissions` /
// `role_permissions` and the `requirePermission(...)` call in each function.

export const FINANCE_ENDPOINT_PERMISSIONS: Record<string, string> = {
  "release-payout": "payouts.release",
  "retry-payout": "payouts.release",
  "refund-transaction": "refunds.issue",
  "resolve-release-review": "release_review.resolve",
  "flag-for-release-review": "release_review.flag",
};

/** Keys that authorise real money movement. Never grant to read-only roles. */
export const MONEY_MOVEMENT_PERMISSIONS: string[] = [
  "payouts.release",
  "refunds.issue",
  "release_review.resolve",
  "release_review.flag",
];

/** Internal roles allowed to hold the money-movement keys. */
export const MONEY_MOVEMENT_ROLES: string[] = [
  "super_admin",
  "finance_operator",
  "finance_approver",
];

/** Roles that must NEVER hold a money-movement key. */
export const MONEY_MOVEMENT_FORBIDDEN_ROLES: string[] = [
  "auditor",
  "support_agent",
  "identity_officer",
  "dispute_agent",
  "dispute_manager",
  "compliance_officer",
  "senior_admin",
];

/** Offline mirror of the edge `requirePermission` decision. */
export function financeGateAllows(input: {
  isSuperAdmin?: boolean;
  isConsumerAdmin?: boolean;
  effectivePermissions: string[];
  required: string;
}): boolean {
  if (input.isSuperAdmin || input.isConsumerAdmin) return true;
  return input.effectivePermissions.includes(input.required);
}
