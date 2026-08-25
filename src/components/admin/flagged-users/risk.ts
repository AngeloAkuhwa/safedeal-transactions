import { ADMIN_TONE, ADMIN_BADGE_STRONG } from "@/components/admin/palette";
import type { FlaggedRisk, FlaggedStatus } from "@/services/admin-flagged-users.service";

export const RISK_LABEL: Record<FlaggedRisk, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const RISK_BORDER: Record<FlaggedRisk, string> = {
  critical: "border-l-red-500",
  high: "border-l-orange-500",
  medium: "border-l-amber-500",
  low: "border-l-slate-600",
};

export const RISK_AVATAR_RING: Record<FlaggedRisk, string> = {
  critical: "border-red-500",
  high: "border-orange-500",
  medium: "border-amber-500",
  low: "border-slate-600",
};

export const RISK_PILL: Record<FlaggedRisk, string> = {
  critical: ADMIN_BADGE_STRONG.danger!,
  high: ADMIN_BADGE_STRONG.elevated!,
  // Converged from amber-200 in the same motion: the other two tiers read
  // their tone's 300, and one tier a step lighter than its neighbours was
  // the only thing keeping this from being a single recipe.
  medium: ADMIN_BADGE_STRONG.warning!,
  // `low` is not a wash pill. A solid slate chip means "no elevated risk",
  // so no heavy entry is an identical set and it stays as written.
  low: "bg-slate-700 border-slate-600 text-slate-300",
};

export const RISK_DOT: Record<FlaggedRisk, string> = {
  critical: "bg-red-400",
  high: ADMIN_TONE.elevated.dot,
  medium: "bg-amber-300",
  low: "bg-slate-400",
};

export const STATUS_LABEL: Record<FlaggedStatus, string> = {
  active: "Active",
  under_review: "Under Review",
  suspended: "Suspended",
  resolved: "Resolved",
};

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

export function relative(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "—";
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function absoluteDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-NG", { year: "numeric", month: "short", day: "numeric" });
}