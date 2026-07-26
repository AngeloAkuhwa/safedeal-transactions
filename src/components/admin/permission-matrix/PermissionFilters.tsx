import { Search } from "lucide-react";
import { INTERNAL_ROLES, PERMISSION_MODULES, ROLE_LABEL } from "@/services/permission-catalog";

export interface FiltersState {
  role: string;      // "all" | role_key
  module: string;    // "all" | module_key
  risk: string;      // "all" | "privileged" | "standard"
  search: string;
}

export function PermissionFilters({
  value,
  onChange,
  showRole = true,
  showModule = true,
  showRisk = true,
  showSearch = true,
}: {
  value: FiltersState;
  onChange: (v: FiltersState) => void;
  showRole?: boolean;
  showModule?: boolean;
  showRisk?: boolean;
  showSearch?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-3">
      {showSearch && (
        <label className="min-w-[220px] flex-1">
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Search</span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary"
              placeholder="Search features, permissions, users…"
              value={value.search}
              onChange={(e) => onChange({ ...value, search: e.target.value })}
            />
          </div>
        </label>
      )}
      {showRole && (
        <label>
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Role</span>
          <select
            className="h-9 rounded-md border border-border bg-background px-3 text-sm"
            value={value.role}
            onChange={(e) => onChange({ ...value, role: e.target.value })}
          >
            <option value="all">All roles</option>
            {INTERNAL_ROLES.map((r) => (
              <option key={r.key} value={r.key}>{ROLE_LABEL[r.key]}</option>
            ))}
          </select>
        </label>
      )}
      {showModule && (
        <label>
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Feature Group</span>
          <select
            className="h-9 rounded-md border border-border bg-background px-3 text-sm"
            value={value.module}
            onChange={(e) => onChange({ ...value, module: e.target.value })}
          >
            <option value="all">All features</option>
            {PERMISSION_MODULES.map((m) => (
              <option key={m.key} value={m.key}>{m.label}</option>
            ))}
          </select>
        </label>
      )}
      {showRisk && (
        <label>
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Risk</span>
          <select
            className="h-9 rounded-md border border-border bg-background px-3 text-sm"
            value={value.risk}
            onChange={(e) => onChange({ ...value, risk: e.target.value })}
          >
            <option value="all">All</option>
            <option value="privileged">Privileged only</option>
            <option value="standard">Standard only</option>
          </select>
        </label>
      )}
      <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-emerald-500" /> Full</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-amber-500" /> Limited</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-muted-foreground/50" /> None</span>
      </div>
    </div>
  );
}
