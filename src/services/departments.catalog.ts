// Managed catalogue of departments used by the Add User + User Details drawers.
// Kept small and stable so the picker never has to hit the DB.

export type DepartmentKey =
  | "trust_and_safety"
  | "disputes"
  | "finance"
  | "compliance"
  | "identity_verification"
  | "support"
  | "engineering"
  | "executive"
  | "other";

export interface DepartmentDefinition {
  key: DepartmentKey;
  label: string;
  description: string;
}

export const DEPARTMENTS: DepartmentDefinition[] = [
  { key: "trust_and_safety",     label: "Trust & Safety",        description: "Fraud, flagged users, platform trust." },
  { key: "disputes",             label: "Disputes",              description: "Dispute investigation and resolution." },
  { key: "finance",              label: "Finance",               description: "Escrow, payouts, refunds." },
  { key: "compliance",           label: "Compliance",            description: "Regulatory, audit and policy oversight." },
  { key: "identity_verification",label: "Identity Verification", description: "KYC review and verification decisions." },
  { key: "support",              label: "Support",               description: "Customer and partner support." },
  { key: "engineering",          label: "Engineering",           description: "Platform engineering and reliability." },
  { key: "executive",            label: "Executive",             description: "Leadership and executive oversight." },
  { key: "other",                label: "Other",                 description: "Anything not covered above." },
];

export const DEPARTMENT_LABEL: Record<DepartmentKey, string> =
  Object.fromEntries(DEPARTMENTS.map((d) => [d.key, d.label])) as Record<DepartmentKey, string>;

/** Accepts either the stored label or a key; returns the label if we know it. */
export function resolveDepartmentLabel(input: string | null | undefined): string {
  if (!input) return "—";
  const asKey = DEPARTMENT_LABEL[input as DepartmentKey];
  if (asKey) return asKey;
  return input;
}

export function isDepartmentLabel(input: string | null | undefined): boolean {
  if (!input) return false;
  return DEPARTMENTS.some((d) => d.label === input);
}