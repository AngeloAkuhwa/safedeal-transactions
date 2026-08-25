import { Ban, ClipboardCheck, MailPlus, Search, ShieldAlert, UserPlus, X } from "lucide-react";
import type { AccessFilter } from "@/services/admin-access-control.service";
import { AdvancedFilters, type AdvancedFilterState } from "./AdvancedFilters";
import { ADMIN_TONE } from "@/components/admin/palette";
import { Button } from "@/components/ui/button";

interface Props {
  filter: AccessFilter;
  onFilter: (f: AccessFilter) => void;
  q: string;
  onQuery: (v: string) => void;
  onAddUser: () => void;
  advanced: AdvancedFilterState;
  onAdvanced: (s: AdvancedFilterState) => void;
  departments: string[];
  onClearAll: () => void;
  hasAnyFilter: boolean;
}

const CHIPS: Array<{ id: AccessFilter; label: string; icon?: React.ReactNode; tone?: "danger" | "critical" | "warning" | "indigo" }> = [
  { id: "all",              label: "All Users" },
  { id: "admins",           label: "Admins" },
  { id: "agents",           label: "Operational Agents" },
  { id: "finance",          label: "Finance" },
  { id: "compliance",       label: "Compliance" },
  { id: "auditors",         label: "Auditors" },
  { id: "invited",          label: "Pending Invitations", icon: <MailPlus className="h-3.5 w-3.5" />, tone: "indigo" },
  { id: "pending_approval", label: "Pending Approval",    icon: <ClipboardCheck className="h-3.5 w-3.5" />, tone: "warning" },
  { id: "suspended_or_locked", label: "Suspended",        icon: <Ban className="h-3.5 w-3.5" />, tone: "danger" },
  { id: "privileged",       label: "Privileged Access",   icon: <ShieldAlert className="h-3.5 w-3.5" />, tone: "critical" },
];

function chipClass(active: boolean, tone?: "danger" | "critical" | "warning" | "indigo") {
  if (active) {
    if (tone === "critical") return "bg-red-500/20 text-red-200 border-red-500/60";
    if (tone === "danger")   return "bg-red-500/15 text-red-300 border-red-500/50";
    if (tone === "warning")  return "bg-amber-500/20 text-amber-200 border-amber-500/60";
    if (tone === "indigo")   return "bg-indigo-500/20 text-indigo-200 border-indigo-500/60";
    return "bg-blue-600 text-white border-blue-600";
  }
  if (tone === "critical") return `${ADMIN_TONE.danger.panel} text-red-300 hover:bg-red-500/20`;
  if (tone === "danger")   return "bg-muted text-red-300 border-red-500/30 hover:bg-red-500/10";
  if (tone === "warning")  return "bg-muted text-amber-300 border-amber-500/30 hover:bg-amber-500/10";
  if (tone === "indigo")   return "bg-muted text-indigo-300 border-indigo-500/30 hover:bg-indigo-500/10";
  return "bg-muted text-foreground/80 border-transparent hover:bg-muted/70";
}

export function UserAccessFilters({
  filter, onFilter, q, onQuery, onAddUser,
  advanced, onAdvanced, departments, onClearAll, hasAnyFilter,
}: Props) {
  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-base font-semibold text-foreground">Filter Internal Users</h3>
          <div className="flex flex-wrap gap-2">
            {CHIPS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onFilter(c.id)}
                aria-pressed={filter === c.id}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${chipClass(filter === c.id, c.tone)} min-h-11`}
              >
                {c.icon}
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* The search is fixed-width and the action cannot shrink; on a 320px
            screen they need two lines rather than one clipped one. */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={q}
              onChange={(e) => onQuery(e.target.value)}
              placeholder="Name, email, employee ID, role…"
              aria-label="Search internal users"
              className="w-full min-w-0 sm:w-72 rounded-lg border border-border bg-muted/60 py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none min-h-11"
            />
          </div>
          <button
            type="button"
            onClick={onAddUser}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 min-h-11"
          >
            <UserPlus className="h-4 w-4" /> Add User
          </button>
        </div>
      </div>

      <AdvancedFilters state={advanced} onChange={onAdvanced} departments={departments} />

      {hasAnyFilter && (
        <div className="flex justify-end">
          <Button size="sm" variant="ghost" onClick={onClearAll} className="text-xs text-muted-foreground">
            <X className="mr-1 h-3.5 w-3.5" /> Clear all filters
          </Button>
        </div>
      )}
    </div>
  );
}