// Seed set of permission dependencies + conflicts used by Compare Roles.
// Kept in code (not DB) for this pass to avoid a migration; move to a
// `permission_dependencies` table once the ruleset stabilises.

// A permission on the LEFT logically requires the one on the RIGHT.
// Missing a requirement is surfaced in Compare Roles as "missing dependency".
export const PERMISSION_DEPENDENCIES: Array<[string, string]> = [
  // view is required for any write action on the same module
  ["payouts.approve", "payouts.view"],
  ["payouts.create", "payouts.view"],
  ["payouts.reject", "payouts.view"],
  ["refunds.approve", "refunds.view"],
  ["refunds.create", "refunds.view"],
  ["refunds.reject", "refunds.view"],
  ["escrow.approve", "escrow.view"],
  ["escrow.update", "escrow.view"],
  ["disputes.resolve", "disputes.view"],
  ["disputes.assign", "disputes.view"],
  ["disputes.escalate", "disputes.view"],
  ["users.suspend", "users.view"],
  ["users.reactivate", "users.view"],
  ["users_and_access.suspend", "users_and_access.view"],
  ["users_and_access.reactivate", "users_and_access.view"],
  ["users_and_access.manage_permissions", "users_and_access.view"],
  ["permissions.manage_permissions", "permissions.view"],
  ["financial_controls.approve", "financial_controls.view"],
  ["financial_controls.configure", "financial_controls.view"],
  ["platform_configuration.configure", "platform_configuration.view"],
  ["investigations.update", "investigations.view"],
  ["investigations.resolve", "investigations.view"],
  ["identity_verification.approve", "identity_verification.view"],
  ["identity_verification.reject", "identity_verification.view"],
  ["flagged_users.remove_flag", "flagged_users.view"],
  ["flagged_users.suspend", "flagged_users.view"],
];

// Pairs of permissions that must NOT co-exist on a single role
// (segregation of duties for financial responsibilities).
export const PERMISSION_CONFLICTS: Array<[string, string]> = [
  ["payouts.create", "payouts.approve"],
  ["refunds.create", "refunds.approve"],
  ["financial_controls.approve", "disputes.resolve_all"],
  ["escrow.update", "escrow.approve"],
];

export function computeMissingDependencies(granted: Set<string>): Array<{ have: string; needs: string }> {
  const out: Array<{ have: string; needs: string }> = [];
  for (const [have, needs] of PERMISSION_DEPENDENCIES) {
    if (granted.has(have) && !granted.has(needs)) out.push({ have, needs });
  }
  return out;
}

export function computeConflicts(granted: Set<string>): Array<{ a: string; b: string }> {
  const out: Array<{ a: string; b: string }> = [];
  for (const [a, b] of PERMISSION_CONFLICTS) {
    if (granted.has(a) && granted.has(b)) out.push({ a, b });
  }
  return out;
}

export function computeRoleDiff(
  roles: string[],
  grants: Map<string, Set<string>>,
): { shared: string[]; uniqueByRole: Map<string, string[]>; differing: string[] } {
  const sets = roles.map((r) => grants.get(r) ?? new Set<string>());
  const union = new Set<string>();
  for (const s of sets) for (const p of s) union.add(p);
  const shared: string[] = [];
  const differing: string[] = [];
  for (const p of union) {
    const holders = sets.filter((s) => s.has(p)).length;
    if (holders === sets.length) shared.push(p);
    else differing.push(p);
  }
  const uniqueByRole = new Map<string, string[]>();
  roles.forEach((role, idx) => {
    const mine = sets[idx];
    const unique: string[] = [];
    for (const p of mine) {
      const heldElsewhere = sets.some((s, i) => i !== idx && s.has(p));
      if (!heldElsewhere) unique.push(p);
    }
    uniqueByRole.set(role, unique.sort());
  });
  return { shared: shared.sort(), uniqueByRole, differing: differing.sort() };
}