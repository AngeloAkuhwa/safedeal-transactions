import { formatDistanceToNow } from "date-fns";
import type { AgentRosterEntry, OrchestrationPriority } from "@/services/task-orchestration.service";
import { ADMIN_TONE } from "@/components/admin/palette";

export function initialsOf(a?: AgentRosterEntry | null): string {
  if (!a) return "?";
  const f = (a.first_name ?? "").trim();
  const l = (a.last_name ?? "").trim();
  return `${f[0] ?? ""}${l[0] ?? ""}`.toUpperCase() || (a.email?.[0] ?? "?").toUpperCase();
}
export function nameOf(a?: AgentRosterEntry | null): string {
  if (!a) return "—";
  const name = [a.first_name, a.last_name].filter(Boolean).join(" ").trim();
  return name || a.email || "Agent";
}
export function shortNameOf(a?: AgentRosterEntry | null): string {
  if (!a) return "—";
  const first = a.first_name || a.email?.split("@")[0] || "Agent";
  const last = a.last_name ? ` ${a.last_name[0]}.` : "";
  return `${first}${last}`;
}
export function currencyFmt(amount: number | null, currency: string): string {
  if (amount == null) return "—";
  try {
    return new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch { return `${currency} ${amount.toLocaleString()}`; }
}
export function relative(ts: string | null): string {
  if (!ts) return "—";
  try { return formatDistanceToNow(new Date(ts), { addSuffix: true }); } catch { return "—"; }
}
export function relativeShort(ts: string | null): string {
  if (!ts) return "—";
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}
export function humanize(s: string): string {
  return s.replace(/[_-]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

/* Matrix-aligned tone tokens */
export const TONE = {
  primary: "text-primary bg-primary/10 ring-1 ring-inset ring-primary/20",
  success: "text-emerald-300 bg-emerald-500/10 ring-1 ring-inset ring-emerald-500/20",
  warning: "text-amber-300 bg-amber-500/10 ring-1 ring-inset ring-amber-500/20",
  danger:  "text-rose-300 bg-rose-500/10 ring-1 ring-inset ring-rose-500/20",
  info:    "text-sky-300 bg-sky-500/10 ring-1 ring-inset ring-sky-500/20",
  muted:   "text-muted-foreground bg-muted/60 ring-1 ring-inset ring-border",
} as const;
export type ToneKey = keyof typeof TONE;

export const CARD_CLASS =
  "rounded-2xl border border-border/60 bg-card/60 p-5 backdrop-blur-sm md:p-6 shadow-[0_1px_0_hsl(var(--border)/0.4)_inset] transition hover:border-border/80";
export const INNER_CARD_CLASS =
  "rounded-xl border border-border/60 bg-card/40 p-4 backdrop-blur-sm shadow-[0_1px_0_hsl(var(--border)/0.4)_inset]";
export const FILTER_BAR_CLASS =
  "flex flex-wrap items-end gap-3 rounded-xl border border-border/70 bg-card/60 p-3 backdrop-blur-sm shadow-[0_1px_0_hsl(var(--border)/0.4)_inset]";

export function priorityBadgeClass(p: OrchestrationPriority): string {
  return {
    critical: "bg-rose-500/10 text-rose-300 ring-1 ring-inset ring-rose-500/30",
    high:     "bg-amber-500/10 text-amber-300 ring-1 ring-inset ring-amber-500/30",
    medium:   "bg-sky-500/10 text-sky-300 ring-1 ring-inset ring-sky-500/30",
    low:      "bg-muted/60 text-muted-foreground ring-1 ring-inset ring-border",
  }[p];
}

export function slaBadgeClass(s: string): string {
  if (s === "overdue" || s === "breached") return "bg-rose-500/10 text-rose-300 ring-1 ring-inset ring-rose-500/30";
  if (s === "at_risk") return "bg-amber-500/10 text-amber-300 ring-1 ring-inset ring-amber-500/30";
  return "bg-emerald-500/10 text-emerald-300 ring-1 ring-inset ring-emerald-500/30";
}

export function slaLabel(s: string): string {
  if (s === "overdue" || s === "breached") return "Overdue";
  if (s === "at_risk") return "At Risk";
  return "On Track";
}

export function availabilityDot(a: string): string {
  return {
    available:   "bg-emerald-400",
    active:      "bg-primary",
    busy:        ADMIN_TONE.warning.dot,
    at_capacity: "bg-rose-400",
    offline:     "bg-muted-foreground",
    on_leave:    "bg-sky-400",
    suspended:   "bg-rose-500",
  }[a] ?? "bg-muted-foreground";
}

export function availabilityLabel(a: string): string {
  return {
    available: "Available", active: "Active", busy: "Busy",
    at_capacity: "At Capacity", offline: "Offline",
    on_leave: "On Leave", suspended: "Suspended",
  }[a] ?? humanize(a);
}

export function availabilityTextColor(a: string): string {
  return {
    available: "text-emerald-300", active: "text-primary", busy: ADMIN_TONE.warning.text,
    at_capacity: "text-rose-300", offline: "text-muted-foreground",
    on_leave: "text-sky-300", suspended: "text-rose-400",
  }[a] ?? "text-muted-foreground";
}

export function availabilityRing(a: string): string {
  return {
    available:   "ring-emerald-500/30",
    active:      "ring-primary/30",
    busy:        "ring-amber-500/30",
    at_capacity: "ring-rose-500/30",
    offline:     "ring-border",
    on_leave:    "ring-sky-500/30",
    suspended:   "ring-rose-500/40",
  }[a] ?? "ring-border";
}

/** Availability values that are treated as ineligible for new work. */
export const INELIGIBLE_AVAILABILITY = new Set<string>(["offline", "on_leave", "suspended"]);
export function isEligibleAvailability(a: string): boolean {
  return !INELIGIBLE_AVAILABILITY.has(a);
}

/** Live progression status chip (distinct from SLA badge). */
export function statusChip(status: string): { label: string; className: string } | null {
  if (status === "waiting_on_buyer" || status === "waiting_on_seller" || status === "waiting_on_evidence") {
    return { label: "Waiting on External", className: "bg-sky-500/10 text-sky-300 ring-1 ring-inset ring-sky-500/30" };
  }
  if (status === "escalated") {
    return { label: "Escalated", className: "bg-rose-500/10 text-rose-300 ring-1 ring-inset ring-rose-500/30" };
  }
  if (status === "pending_approval") {
    return { label: "Pending Approval", className: "bg-amber-500/10 text-amber-300 ring-1 ring-inset ring-amber-500/30" };
  }
  return null;
}