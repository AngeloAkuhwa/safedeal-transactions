import type {
  AccessLevel,
  InternalRole,
  InternalUserStatus,
} from "@/services/admin-access-control.service";
import {
  ACCESS_LABEL,
  ROLE_LABEL,
  STATUS_LABEL,
  accessDotClass,
} from "@/services/admin-access-control.service";

const ROLE_STYLES: Record<InternalRole, string> = {
  super_admin: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  admin: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  senior_agent: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  agent: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  junior_agent: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  read_only: "bg-slate-500/15 text-slate-300 border-slate-500/30",
};

const STATUS_STYLES: Record<InternalUserStatus, string> = {
  active: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  suspended: "bg-red-500/15 text-red-300 border-red-500/30",
  pending: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  invited: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
};

export function RoleBadge({ role }: { role: InternalRole }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${ROLE_STYLES[role]}`}>
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