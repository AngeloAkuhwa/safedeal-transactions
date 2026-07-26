import { Search, Globe } from "lucide-react";
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
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border/70 bg-card/60 p-3 backdrop-blur-sm shadow-[0_1px_0_hsl(var(--border)/0.4)_inset]">
      {showSearch && (
        <label className="min-w-[220px] flex-1">
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Search</span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className="h-9 w-full rounded-md border border-border bg-background/60 pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:ring-1 focus:ring-primary/40"
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
            className="h-9 rounded-md border border-border bg-background/60 px-3 text-sm outline-none focus:border-primary"
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
            className="h-9 rounded-md border border-border bg-background/60 px-3 text-sm outline-none focus:border-primary"
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
            className="h-9 rounded-md border border-border bg-background/60 px-3 text-sm outline-none focus:border-primary"
            value={value.risk}
            onChange={(e) => onChange({ ...value, risk: e.target.value })}
          >
            <option value="all">All</option>
            <option value="privileged">Privileged only</option>
            <option value="standard">Standard only</option>
          </select>
        </label>
      )}
      <label title="Environment scoping is coming soon. Changes always apply to Production for now.">
        <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Environment</span>
        <div className="flex h-9 items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-3 text-sm text-muted-foreground">
          <Globe className="h-3.5 w-3.5" />
          Production
          <span className="rounded-sm border border-border/60 bg-background/50 px-1 text-[10px] uppercase">soon</span>
        </div>
      </label>
      <div className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Full</span>
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-amber-200"><span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> Limited</span>
        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5"><span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" /> None</span>
      </div>
    </div>
  );
}
