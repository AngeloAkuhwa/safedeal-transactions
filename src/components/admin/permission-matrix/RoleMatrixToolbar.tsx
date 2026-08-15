import { useState } from "react";
import { Search, ChevronDown, X, Sparkles, GitCompare, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  INTERNAL_ROLES,
  PERMISSION_MODULES,
  ROLE_LABEL,
  PERMISSION_ROW_STATE_LABEL,
  type PermissionRiskLevel,
  type PermissionRowState,
  type InternalRoleKey,
} from "@/services/permission-catalog";
import type { RoleMatrixFilters } from "@/hooks/useRoleMatrixFilters";

const RISK_LEVELS: PermissionRiskLevel[] = ["low", "medium", "high", "critical"];
const STATES: PermissionRowState[] = ["granted", "denied", "override_granted", "override_denied", "pending", "restricted"];

interface Props {
  filters: RoleMatrixFilters;
  set: <K extends keyof RoleMatrixFilters>(key: K, value: RoleMatrixFilters[K]) => void;
  reset: () => void;
  expandAll: () => void;
  collapseAll: () => void;
  activeFilterCount: number;
  onModeChange: (mode: "all" | "compare") => void;
}

function Chip({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
        active
          ? "border-primary/50 bg-primary/15 text-primary-foreground"
          : "border-border/60 bg-background/40 text-muted-foreground hover:text-foreground hover:border-border",
      )}
    >
      {children}
    </button>
  );
}

function MultiPopover<T extends string>({
  label, values, selected, onToggle, renderLabel,
}: {
  label: string;
  values: T[];
  selected: T[];
  onToggle: (v: T) => void;
  renderLabel?: (v: T) => string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-11 items-center gap-1.5 rounded-md border border-border bg-background/60 px-3 text-xs font-medium hover:border-primary/40"
      >
        {label}
        {selected.length > 0 && (
          <span className="rounded bg-primary/20 px-1.5 text-[10px] font-semibold text-primary-foreground">
            {selected.length}
          </span>
        )}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-40 mt-1 max-h-72 w-64 overflow-auto rounded-lg border border-border bg-card p-2 shadow-xl">
            <div className="flex flex-col gap-1">
              {values.map((v) => {
                const on = selected.includes(v);
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => onToggle(v)}
                    className={cn(
                      "flex items-center justify-between rounded px-2 py-1.5 text-left text-xs hover:bg-muted",
                      on && "bg-primary/10 text-foreground",
                    )}
                  >
                    <span>{renderLabel ? renderLabel(v) : v}</span>
                    {on && <span className="text-primary">✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function RoleMatrixToolbar({
  filters, set, reset, expandAll, collapseAll, activeFilterCount, onModeChange,
}: Props) {
  const toggle = <T,>(arr: T[], v: T): T[] => arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

  return (
    <div className="space-y-3">
      {/* Mode + primary controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-border/70 bg-background/40 p-0.5">
          <button
            type="button"
            onClick={() => onModeChange("all")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md min-h-11 px-3 py-1.5 text-xs font-semibold transition",
              filters.mode === "all" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <LayoutGrid className="h-3.5 w-3.5" /> All Roles
          </button>
          <button
            type="button"
            onClick={() => onModeChange("compare")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md min-h-11 px-3 py-1.5 text-xs font-semibold transition",
              filters.mode === "compare" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <GitCompare className="h-3.5 w-3.5" /> Compare Roles
          </button>
        </div>

        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="h-11 w-full rounded-md border border-border bg-background/60 pl-9 pr-3 text-sm outline-none focus:border-primary"
            placeholder="Search by name, description or permission key…"
            value={filters.search}
            onChange={(e) => set("search", e.target.value)}
          />
        </div>

        <MultiPopover
          label="Modules"
          values={PERMISSION_MODULES.map((m) => m.key)}
          selected={filters.modules}
          onToggle={(v) => set("modules", toggle(filters.modules, v))}
          renderLabel={(v) => PERMISSION_MODULES.find((m) => m.key === v)?.label ?? v}
        />
        <MultiPopover
          label="Risk"
          values={RISK_LEVELS}
          selected={filters.risks}
          onToggle={(v) => set("risks", toggle(filters.risks, v))}
          renderLabel={(v) => v[0].toUpperCase() + v.slice(1)}
        />
        <MultiPopover
          label="State"
          values={STATES}
          selected={filters.states}
          onToggle={(v) => set("states", toggle(filters.states, v))}
          renderLabel={(v) => PERMISSION_ROW_STATE_LABEL[v]}
        />
        <MultiPopover
          label="Roles"
          values={INTERNAL_ROLES.map((r) => r.key)}
          selected={filters.visibleRoles}
          onToggle={(v) => {
            const next = toggle(filters.visibleRoles, v as InternalRoleKey);
            // require at least one visible role
            if (next.length === 0) return;
            set("visibleRoles", next);
          }}
          renderLabel={(v) => ROLE_LABEL[v as InternalRoleKey]}
        />

        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-11 items-center gap-1 rounded-md border border-border/60 bg-background/40 px-2.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" /> Clear ({activeFilterCount})
          </button>
        )}
      </div>

      {/* Secondary toggles */}
      <div className="flex flex-wrap items-center gap-2">
        <Chip active={filters.privilegedOnly} onClick={() => set("privilegedOnly", !filters.privilegedOnly)}>
          <Sparkles className="h-3 w-3" /> Privileged only
        </Chip>
        <Chip active={filters.differencesOnly} onClick={() => set("differencesOnly", !filters.differencesOnly)}>
          Differences only
        </Chip>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={expandAll}
            className="rounded-md border border-border/60 bg-background/40 px-2.5 py-1 text-[11px] hover:border-border"
          >
            Expand all
          </button>
          <button
            type="button"
            onClick={collapseAll}
            className="rounded-md border border-border/60 bg-background/40 px-2.5 py-1 text-[11px] hover:border-border"
          >
            Collapse all
          </button>
        </div>
      </div>
    </div>
  );
}