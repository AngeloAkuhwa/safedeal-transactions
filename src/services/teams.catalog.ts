// Managed catalogue of teams per department. Used by AddUserDrawer's Team
// picker so operators pick from a curated list instead of typing free-text.
// The stored value on `internal_users.team` remains free text, so historical
// rows and bespoke teams (via the "Other…" escape hatch) continue to work.

import type { DepartmentKey } from "./departments.catalog";
import { DEPARTMENTS } from "./departments.catalog";

export const TEAMS_BY_DEPARTMENT: Record<DepartmentKey, string[]> = {
  trust_and_safety:      ["High-Value Cases", "Fraud Ops", "Account Integrity"],
  disputes:              ["Tier 1 Disputes", "Tier 2 Disputes", "Escalations"],
  finance:               ["Payouts", "Reconciliation", "Refunds"],
  compliance:            ["Regulatory", "Policy", "Audit"],
  identity_verification: ["KYC Review", "Appeals"],
  support:               ["Buyer Support", "Seller Support", "Partner Success"],
  engineering:           ["Platform", "Reliability", "Data"],
  executive:             ["Leadership"],
  other:                 [],
};

/** Resolve a stored department (label OR key) back to its DepartmentKey. */
function keyForDepartment(input: string | null | undefined): DepartmentKey | null {
  if (!input) return null;
  const asKey = TEAMS_BY_DEPARTMENT[input as DepartmentKey];
  if (asKey !== undefined) return input as DepartmentKey;
  const byLabel = DEPARTMENTS.find((d) => d.label === input);
  return byLabel ? byLabel.key : null;
}

export function getTeamsForDepartment(input: string | null | undefined): string[] {
  const key = keyForDepartment(input);
  if (!key) return [];
  return TEAMS_BY_DEPARTMENT[key];
}