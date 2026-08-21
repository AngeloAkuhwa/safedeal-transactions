/**
 * Canonical rank order for internal (back-office) roles.
 *
 * This module is the SINGLE source of truth for "who may grant what".
 * The DB trigger `public.enforce_internal_role_rules()` mirrors these exact
 * levels via `public.internal_role_rank(text)`: keep the two in sync.
 *
 * Higher number = more authority.
 *   super_admin                                            > 100
 *   senior_admin                                           >  80
 *   dispute_manager, finance_approver, compliance_officer  >  60
 *   dispute_agent, finance_operator, identity_officer,
 *   support_agent, auditor                                 >  40
 */
export const INTERNAL_ROLE_RANK: Record<string, number> = {
  super_admin: 100,
  senior_admin: 80,
  dispute_manager: 60,
  finance_approver: 60,
  compliance_officer: 60,
  dispute_agent: 40,
  finance_operator: 40,
  identity_officer: 40,
  support_agent: 40,
  auditor: 40,
};

/** Roles only a super_admin may ever grant. */
export const SUPER_ONLY_ROLES = ["super_admin", "senior_admin"] as const;

export const INTERNAL_ROLE_KEYS = Object.keys(INTERNAL_ROLE_RANK);

export function isInternalRoleKey(key: unknown): key is string {
  return typeof key === "string" && Object.prototype.hasOwnProperty.call(INTERNAL_ROLE_RANK, key);
}

export function rankOf(role: string): number {
  return INTERNAL_ROLE_RANK[role] ?? 0;
}

export function isSuperOnlyRole(role: string): boolean {
  return (SUPER_ONLY_ROLES as readonly string[]).includes(role);
}

export type RankGuardResult =
  | { ok: true; actorRank: number; actorRoles: string[] }
  | { ok: false; status: 400; error: "invalid_role"; invalid: string[] }
  | {
      ok: false;
      status: 403;
      error: "insufficient_rank";
      actorRank: number;
      actorRoles: string[];
      blocked: string[];
    };

/**
 * Pure rank check. The actor may grant a role only when:
 *   - the role is a known internal role key, AND
 *   - the role is NOT super_admin/senior_admin (those are super_admin-only), AND
 *   - the actor's highest rank is STRICTLY above the requested role's rank.
 * A super_admin may grant anything.
 */
export function checkRoleGrant(actorRoles: string[], requestedRoles: string[]): RankGuardResult {
  const invalid = requestedRoles.filter((r) => !isInternalRoleKey(r));
  if (invalid.length) return { ok: false, status: 400, error: "invalid_role", invalid };

  const knownActorRoles = actorRoles.filter(isInternalRoleKey);
  const actorRank = knownActorRoles.reduce((max, r) => Math.max(max, rankOf(r)), 0);
  const actorIsSuper = knownActorRoles.includes("super_admin");
  if (actorIsSuper) return { ok: true, actorRank, actorRoles: knownActorRoles };

  const blocked = requestedRoles.filter(
    (r) => isSuperOnlyRole(r) || rankOf(r) >= actorRank,
  );
  if (blocked.length) {
    return { ok: false, status: 403, error: "insufficient_rank", actorRank, actorRoles: knownActorRoles, blocked };
  }
  return { ok: true, actorRank, actorRoles: knownActorRoles };
}

/** Reads the actor's internal roles and applies `checkRoleGrant`. */
export async function assertCanGrantRoles(
  admin: { from: (t: string) => any },
  actorUserId: string,
  requestedRoles: string[],
): Promise<RankGuardResult> {
  const { data } = await admin
    .from("internal_user_roles")
    .select("role_key")
    .eq("user_id", actorUserId);
  const actorRoles = ((data ?? []) as { role_key: string }[]).map((r) => r.role_key);
  return checkRoleGrant(actorRoles, requestedRoles);
}
