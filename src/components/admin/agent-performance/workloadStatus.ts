import type { AgentPerformanceRow } from "@/services/agent-performance.service";

/**
 * Single derivation of an agent's workload status, built from the existing
 * Task Orchestration capacity + availability configuration
 * (agent_capacity.max_active_tasks vs current active work, agent_availability.status).
 * No second capacity model exists. Every screen reads this helper.
 */
export type WorkloadStatus =
  | "available" | "normal" | "near_capacity" | "at_capacity" | "overloaded" | "offline" | "on_leave";

export const WORKLOAD_STATUS_OPTIONS: { value: WorkloadStatus; label: string }[] = [
  { value: "available", label: "Available" },
  { value: "normal", label: "Normal" },
  { value: "near_capacity", label: "Near Capacity" },
  { value: "at_capacity", label: "At Capacity" },
  { value: "overloaded", label: "Overloaded" },
  { value: "offline", label: "Offline" },
  { value: "on_leave", label: "On Leave" },
];

export function workloadStatus(a: Pick<AgentPerformanceRow, "availability" | "active_cases" | "max_active">): WorkloadStatus {
  if (a.availability === "on_leave" || a.availability === "suspended") return "on_leave";
  if (a.availability === "offline") return "offline";
  const max = Math.max(1, a.max_active);
  const ratio = a.active_cases / max;
  if (a.active_cases > max) return "overloaded";
  if (a.active_cases >= max) return "at_capacity";
  if (ratio >= 0.8) return "near_capacity";
  if (a.active_cases === 0) return "available";
  return "normal";
}

export function workloadStatusLabel(s: WorkloadStatus): string {
  return WORKLOAD_STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s;
}

export function workloadStatusClass(s: WorkloadStatus): string {
  switch (s) {
    case "available": return "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30";
    case "normal": return "bg-primary/15 text-primary ring-primary/25";
    case "near_capacity": return "bg-amber-500/15 text-amber-300 ring-amber-500/30";
    case "at_capacity": return "bg-orange-500/15 text-orange-300 ring-orange-500/30";
    case "overloaded": return "bg-rose-500/15 text-rose-300 ring-rose-500/30";
    case "on_leave": return "bg-sky-500/15 text-sky-300 ring-sky-500/30";
    default: return "bg-muted text-muted-foreground ring-border";
  }
}