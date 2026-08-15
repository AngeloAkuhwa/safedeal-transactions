import { Search } from "lucide-react";
import { INTERNAL_ROLES, PERMISSION_MODULES, ROLE_LABEL } from "@/services/permission-catalog";

const ACTION_OPTIONS: Array<{ key: string; label: string }> = [
  { key: "view", label: "View" },
  { key: "view_assigned", label: "View assigned" },
  { key: "create", label: "Create" },
  { key: "update", label: "Update" },
  { key: "approve", label: "Approve" },
  { key: "reject", label: "Reject" },
  { key: "escalate", label: "Escalate" },
  { key: "resolve", label: "Resolve" },
  { key: "assign", label: "Assign" },
  { key: "reassign", label: "Reassign" },
  { key: "export", label: "Export" },
  { key: "configure", label: "Configure" },
  { key: "manage_permissions", label: "Manage permissions" },
  { key: "suspend", label: "Suspend" },
  { key: "reactivate", label: "Reactivate" },
  { key: "remove_flag", label: "Remove flag" },
];

export interface FiltersState {
  role: string;      // "all" | role_key
  module: string;    // "all" | module_key
  risk: string;      // "all" | "privileged" | "standard"
  search: string;
  action?: string;   // "all" | PermissionAction
  status?: string;   // "all" | "active" | "suspended" | "deprecated"
  approval?: string; // "all" | "required" | "not_required"
}

export function PermissionFilters({
  value,
  onChange,
  showRole = true,
  showModule = true,
  showRisk = true,
  showSearch = true,
  showAction = false,
  showStatus = false,
  showApproval = false,
}: {
  value: FiltersState;
  onChange: (v: FiltersState) => void;
  showRole?: boolean;
  showModule?: boolean;
  showRisk?: boolean;
  showSearch?: boolean;
  showAction?: boolean;
  showStatus?: boolean;
  showApproval?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border/70 bg-card/60 p-3 backdrop-blur-sm shadow-[0_1px_0_hsl(var(--border)/0.4)_inset]">
      {showSearch && (
        <label className="min-w-[220px] flex-1">
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Search</span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className="h-11 w-full rounded-md border border-border bg-background/60 pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:ring-1 focus:ring-primary/40"
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
            className="h-11 rounded-md border border-border bg-background/60 px-3 text-sm outline-none focus:border-primary"
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
            className="h-11 rounded-md border border-border bg-background/60 px-3 text-sm outline-none focus:border-primary"
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
      {showAction && (
        <label>
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Action</span>
          <select
            className="h-11 rounded-md border border-border bg-background/60 px-3 text-sm outline-none focus:border-primary"
            value={value.action ?? "all"}
            onChange={(e) => onChange({ ...value, action: e.target.value })}
          >
            <option value="all">All actions</option>
            {ACTION_OPTIONS.map((a) => (
              <option key={a.key} value={a.key}>{a.label}</option>
            ))}
          </select>
        </label>
      )}
      {showRisk && (
        <label>
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Risk</span>
          <select
            className="h-11 rounded-md border border-border bg-background/60 px-3 text-sm outline-none focus:border-primary"
            value={value.risk}
            onChange={(e) => onChange({ ...value, risk: e.target.value })}
          >
            <option value="all">All</option>
            <option value="privileged">Privileged only</option>
            <option value="standard">Standard only</option>
          </select>
        </label>
      )}
      {showStatus && (
        <label>
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Status</span>
          <select
            className="h-11 rounded-md border border-border bg-background/60 px-3 text-sm outline-none focus:border-primary"
            value={value.status ?? "all"}
            onChange={(e) => onChange({ ...value, status: e.target.value })}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="deprecated">Deprecated</option>
          </select>
        </label>
      )}
      {showApproval && (
        <label>
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Approval</span>
          <select
            className="h-11 rounded-md border border-border bg-background/60 px-3 text-sm outline-none focus:border-primary"
            value={value.approval ?? "all"}
            onChange={(e) => onChange({ ...value, approval: e.target.value })}
          >
            <option value="all">All</option>
            <option value="required">Approval required</option>
            <option value="not_required">Direct edit</option>
          </select>
        </label>
      )}
      <div className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Full</span>
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-amber-200"><span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> Limited</span>
        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5"><span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" /> None</span>
      </div>
    </div>
  );
}
