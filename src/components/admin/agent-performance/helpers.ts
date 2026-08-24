/**
 * Multi-select SLA chip toggling. "all" means no state filter, so selecting a
 * chip from "all" narrows to that single state and clearing the last chip
 * returns to "all".
 */
export function toggleStateFilter(current: string, state: string): string {
  const selected = !current || current === "all" ? [] : current.split(",");
  const next = selected.includes(state)
    ? selected.filter((s) => s !== state)
    : [...selected, state];
  return next.length ? next.join(",") : "all";
}
import type { AgentPerformanceRow } from "@/services/agent-performance.service";
import { ADMIN_TONE } from "@/components/admin/palette";

export const CARD_CLASS =
  "rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur-sm lg:p-6 shadow-[0_1px_0_hsl(var(--border)/0.4)_inset]";
export const INNER_CARD_CLASS =
  "rounded-xl border border-border/60 bg-background/60 p-4 backdrop-blur-sm shadow-[0_1px_0_hsl(var(--border)/0.4)_inset]";

export function rankBadgeClass(rank: number): string {
  if (rank === 1) return "bg-gradient-to-br from-amber-300 to-amber-500 text-background shadow-[0_0_18px_hsl(45_93%_58%/0.35)]";
  if (rank === 2) return "bg-gradient-to-br from-slate-200 to-slate-400 text-background shadow-[0_0_14px_hsl(210_16%_82%/0.25)]";
  if (rank === 3) return "bg-gradient-to-br from-orange-300 to-amber-700 text-background shadow-[0_0_14px_hsl(30_60%_50%/0.25)]";
  return "bg-muted text-muted-foreground ring-1 ring-inset ring-border";
}

export function scoreTone(band: string): string {
  switch (band) {
    case "Excellent": return "text-primary";
    case "Very Good": return "text-emerald-300";
    case "Good": return ADMIN_TONE.warning.text;
    case "Insufficient Data": return "text-muted-foreground";
    default: return "text-rose-300";
  }
}

export function rowRingClass(r: AgentPerformanceRow): string {
  if (r.overdue > 0) return "ring-1 ring-inset ring-rose-500/30";
  if (r.at_capacity) return "ring-1 ring-inset ring-amber-500/30";
  if (r.rank === 1) return "ring-1 ring-inset ring-primary/30";
  return "";
}

export function activeCasesPillClass(r: AgentPerformanceRow): string {
  if (r.active_cases > r.max_active) return "bg-rose-500/15 text-rose-300 ring-1 ring-inset ring-rose-500/30";
  if (r.at_capacity) return "bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-500/30";
  return "bg-primary/15 text-primary ring-1 ring-inset ring-primary/25";
}

export function availabilityDot(a: string): string {
  return {
    available: "bg-emerald-400", active: "bg-emerald-400", busy: ADMIN_TONE.warning.dot,
    at_capacity: "bg-rose-400", offline: "bg-muted-foreground",
    on_leave: "bg-sky-400", suspended: "bg-rose-500",
  }[a] ?? "bg-muted-foreground";
}

export function availabilityLabel(a: string): string {
  return {
    available: "Available", active: "Active", busy: "Busy", at_capacity: "At Capacity",
    offline: "Offline", on_leave: "On Leave", suspended: "Suspended",
  }[a] ?? a;
}

export function availabilityTextClass(a: string): string {
  return {
    available: "text-emerald-300", active: "text-emerald-300", busy: ADMIN_TONE.warning.text,
    at_capacity: "text-rose-300", offline: "text-muted-foreground",
    on_leave: "text-sky-300", suspended: "text-rose-400",
  }[a] ?? "text-muted-foreground";
}

export function hoursLabel(h: number | null): string {
  if (h == null) return "—";
  if (h < 1) return `${Math.round(h * 60)}m`;
  return `${h}h`;
}

export function minutesLabel(m: number | null): string {
  if (m == null) return "—";
  if (m < 60) return `${m}m`;
  return `${Math.round((m / 60) * 10) / 10}h`;
}

export function slaTone(pctValue: number | null): string {
  if (pctValue == null) return "text-muted-foreground";
  if (pctValue >= 95) return "text-emerald-300";
  if (pctValue >= 85) return ADMIN_TONE.warning.text;
  return "text-rose-300";
}

export const SCORE_FORMULA =
  "Score = 40% SLA compliance + 25% resolution speed vs team median + 20% overdue rate + 15% escalation rate, normalised to 0–100.";