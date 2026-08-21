import { INTERNAL_ROLES, ROLE_LABEL } from "@/services/permission-catalog";

/**
 * Pure helpers for rendering the signed-in admin's identity in the sidebar
 * footer. Kept free of hooks/network so they can be unit tested and reused.
 */

/** Ordered highest-privilege first. Mirrors the catalogue declaration order. */
const ROLE_PRIORITY: string[] = INTERNAL_ROLES.map((r) => r.key);

function emailLocalPart(email: string | null | undefined): string | null {
  if (!email) return null;
  const local = email.split("@")[0]?.trim();
  return local ? local : null;
}

/** Display name: full name → email local-part → "Admin". */
export function adminDisplayName(
  fullName: string | null | undefined,
  email: string | null | undefined,
): string {
  const name = fullName?.trim();
  if (name) return name;
  return emailLocalPart(email) ?? "Admin";
}

/** Up to two uppercase initials from the resolved display name. */
export function adminInitials(
  fullName: string | null | undefined,
  email: string | null | undefined,
): string {
  const display = adminDisplayName(fullName, email);
  const words = display.split(/[\s._-]+/).filter(Boolean);
  const letters = words.slice(0, 2).map((w) => w[0]).join("");
  return (letters || display[0] || "A").toUpperCase();
}

/**
 * Role label: super admins always read "Super Admin"; otherwise the
 * highest-privilege internal role the user holds, per catalogue ordering.
 */
export function adminRoleLabel(roles: string[] | null | undefined, isSuper: boolean): string {
  if (isSuper) return "Super Admin";
  const held = new Set(roles ?? []);
  for (const key of ROLE_PRIORITY) {
    if (held.has(key)) return ROLE_LABEL[key as keyof typeof ROLE_LABEL] ?? key;
  }
  return "Team member";
}