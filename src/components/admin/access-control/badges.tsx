import type {
  AccessLevel,
  InternalRoleKey,
  InternalUserStatus,
} from "@/services/admin-access-control.service";
import {
  ACCESS_LABEL,
  ROLE_LABEL,
  STATUS_LABEL,
  accessDotClass,
} from "@/services/admin-access-control.service";
import { ADMIN_TONE, ADMIN_CATEGORY } from "@/components/admin/palette";

/**
 * Roles are categories, not judgements, so most map onto the categorical
 * scale; the handful that intentionally reuse a tone hue (dispute roles on
 * success-emerald, finance on caution-amber/orange) borrow the tone triad
 * the palette already defines. dispute_agent keeps its deliberately fainter
 * variant (wash 10, border 20): it is one step junior to dispute_manager
 * and the pair reads as a pale/strong pair on the roster.
 */
const ROLE_STYLES: Record<InternalRoleKey, string> = {
  super_admin:        ADMIN_TONE.special.badge,
  senior_admin:       ADMIN_TONE.info.badge,
  dispute_manager:    ADMIN_TONE.success.badge,
  dispute_agent:      "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  support_agent:      ADMIN_CATEGORY.cyan,
  identity_officer:   ADMIN_CATEGORY.sky,
  finance_operator:   ADMIN_TONE.warning.badge,
  finance_approver:   ADMIN_TONE.elevated.badge,
  compliance_officer: ADMIN_CATEGORY.fuchsia,
  auditor:            ADMIN_TONE.neutral.badge,
};

/**
 * deactivated keeps its muted slate-400 text: it is the one status meant to
 * recede rather than read, and the neutral tone's slate-300 would promote it.
 */
const STATUS_STYLES: Record<InternalUserStatus, string> = {
  active: ADMIN_TONE.success.badge,
  suspended: ADMIN_TONE.danger.badge,
  pending_approval: ADMIN_TONE.warning.badge,
  invited: ADMIN_CATEGORY.indigo,
  locked: ADMIN_TONE.elevated.badge,
  deactivated: "bg-slate-500/15 text-slate-400 border-slate-500/30",
};

export function RoleBadge({ role }: { role: InternalRoleKey }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${ROLE_STYLES[role] ?? "bg-muted text-foreground/80 border-border"}`}>
      {ROLE_LABEL[role]}
    </span>
  );
}

export function StatusBadge({ status }: { status: InternalUserStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function AccessLevelPill({ level }: { level: AccessLevel }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-2 w-2 rounded-full ${accessDotClass(level)}`} />
      <span className="text-sm font-medium text-foreground/90">{ACCESS_LABEL[level]}</span>
    </div>
  );
}

// Aliases to match the reusable component names requested in the brief.
export { AccessLevelPill as AccessLevelBadge };
export { StatusBadge as UserStatusBadge };

export function InitialsAvatar({
  name,
  ring,
  size = "md",
}: {
  name: string;
  ring?: "critical" | "elevated" | "high" | "none";
  size?: "sm" | "md";
}) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const ringClass =
    ring === "critical"
      ? "ring-2 ring-red-500/60"
      : ring === "elevated"
        ? "ring-2 ring-orange-500/50"
        : ring === "high"
          ? "ring-2 ring-amber-400/50"
          : "ring-1 ring-border";
  const dim = size === "sm" ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm";
  return (
    <div
      className={`${dim} ${ringClass} inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-emerald-500 font-semibold text-white`}
    >
      {initials}
    </div>
  );
}