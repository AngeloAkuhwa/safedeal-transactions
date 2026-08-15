import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentPerformanceRow } from "@/services/agent-performance.service";

export type AgentSortKey =
  | "rank" | "active_cases" | "waiting_cases" | "critical_cases" | "resolved" | "avg_resolution_hours"
  | "overdue" | "breached" | "on_time" | "sla_compliance" | "score";
export type SortDir = "asc" | "desc";

const NUMERIC_DEFAULT_DESC: AgentSortKey[] = [
  "active_cases", "waiting_cases", "critical_cases", "resolved", "overdue", "breached", "on_time", "sla_compliance", "score",
];

function valueOf(a: AgentPerformanceRow, key: AgentSortKey): number {
  if (key === "rank") return a.rank;
  const v = a[key];
  // Nulls (no data) sort last in both directions.
  return v == null ? Number.POSITIVE_INFINITY : Number(v);
}

/**
 * Client-side sorting shared by the Workload, Performance and SLA tables.
 * `rank` stays the server-computed position, so it never shifts when the
 * operator sorts by a different column.
 */
export function useAgentSort(agents: AgentPerformanceRow[], initial: AgentSortKey = "rank") {
  const [sortKey, setSortKey] = useState<AgentSortKey>(initial);
  const [sortDir, setSortDir] = useState<SortDir>(initial === "rank" ? "asc" : "desc");

  const toggle = (key: AgentSortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(NUMERIC_DEFAULT_DESC.includes(key) ? "desc" : "asc");
  };

  const sorted = useMemo(() => {
    const copy = [...agents];
    copy.sort((a, b) => {
      const av = valueOf(a, sortKey);
      const bv = valueOf(b, sortKey);
      if (av === bv) return a.rank - b.rank;
      if (!Number.isFinite(av)) return 1;
      if (!Number.isFinite(bv)) return -1;
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return copy;
  }, [agents, sortKey, sortDir]);

  return { sorted, sortKey, sortDir, toggle };
}

export function SortableTh({
  label, sortKey, active, dir, onToggle, className, children,
}: {
  label: string;
  sortKey: AgentSortKey;
  active: boolean;
  dir: SortDir;
  onToggle: (k: AgentSortKey) => void;
  className?: string;
  children?: ReactNode;
}) {
  const Icon = !active ? ChevronsUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      className={cn("px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground", className)}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      scope="col"
    >
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 rounded transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-11",
          active && "text-foreground",
        )}
        aria-label={`Sort by ${label}`}
      >
        {children ?? label}
        <Icon className={cn("h-3 w-3", active ? "opacity-100" : "opacity-40")} aria-hidden="true" />
      </button>
    </th>
  );
}
