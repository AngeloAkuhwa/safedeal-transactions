import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DEFAULT_AGENT_FILTERS, type AgentPerformanceFilters as Filters } from "@/services/agent-performance.service";
import { workloadStatusLabel, type WorkloadStatus } from "./workloadStatus";
import { availabilityLabel } from "./helpers";

type Chip = { key: keyof Filters | "score"; label: string; reset: Partial<Filters> };

export function activeFilterChips(
  f: Filters,
  roles: { key: string; name: string }[],
): Chip[] {
  const chips: Chip[] = [];
  if (f.search) chips.push({ key: "search", label: `Search: ${f.search}`, reset: { search: "" } });
  if (f.team !== "all") chips.push({ key: "team", label: `Team: ${f.team}`, reset: { team: "all" } });
  if (f.role !== "all") {
    chips.push({ key: "role", label: `Role: ${roles.find((r) => r.key === f.role)?.name ?? f.role}`, reset: { role: "all" } });
  }
  if (f.availability !== "all") {
    chips.push({ key: "availability", label: `Availability: ${availabilityLabel(f.availability)}`, reset: { availability: "all" } });
  }
  if (f.workload_status !== "all") {
    chips.push({
      key: "workload_status",
      label: `Workload: ${workloadStatusLabel(f.workload_status as WorkloadStatus)}`,
      reset: { workload_status: "all" },
    });
  }
  if (f.case_priority !== "all") chips.push({ key: "case_priority", label: `Priority: ${f.case_priority}`, reset: { case_priority: "all" } });
  if (f.case_status !== "all") chips.push({ key: "case_status", label: `Case status: ${f.case_status}`, reset: { case_status: "all" } });
  if (f.case_sla !== "all") chips.push({ key: "case_sla", label: `Case SLA: ${f.case_sla.replace("_", " ")}`, reset: { case_sla: "all" } });
  if (f.sla !== "all") chips.push({ key: "sla", label: `SLA: ${f.sla}`, reset: { sla: "all" } });
  if (f.overdue_only) chips.push({ key: "overdue_only", label: "Overdue agents only", reset: { overdue_only: false } });
  if (f.min_active > 0) chips.push({ key: "min_active", label: `Min active: ${f.min_active}`, reset: { min_active: 0 } });
  if (f.min_overdue > 0) chips.push({ key: "min_overdue", label: `Min overdue: ${f.min_overdue}`, reset: { min_overdue: 0 } });
  if (f.score_min > 0 || f.score_max < 100) {
    chips.push({ key: "score", label: `Score ${f.score_min}–${f.score_max}`, reset: { score_min: 0, score_max: 100 } });
  }
  return chips;
}

export function ActiveFilterChips({
  filters, roles, onChange, onClear,
}: {
  filters: Filters;
  roles: { key: string; name: string }[];
  onChange: (patch: Partial<Filters>) => void;
  onClear: () => void;
}) {
  const chips = activeFilterChips(filters, roles);
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Active filters">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">Filters</span>
      {chips.map((c) => (
        <button
          key={String(c.key)}
          type="button"
          onClick={() => onChange(c.reset)}
          className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs text-primary transition-colors hover:bg-primary/20 min-h-11"
          aria-label={`Remove filter ${c.label}`}
        >
          {c.label}
          <X className="h-3 w-3" aria-hidden />
        </button>
      ))}
      <Button variant="ghost" size="sm" className="h-11 px-2 text-xs" onClick={onClear}>
        Clear Filters
      </Button>
    </div>
  );
}

export function hasActiveFilters(f: Filters): boolean {
  return (Object.keys(DEFAULT_AGENT_FILTERS) as (keyof Filters)[])
    .some((k) => k !== "range" && f[k] !== DEFAULT_AGENT_FILTERS[k]);
}