import { Ban, Search, ShieldAlert, UserPlus } from "lucide-react";
import type { AccessFilter } from "@/services/admin-access-control.service";

interface Props {
  filter: AccessFilter;
  onFilter: (f: AccessFilter) => void;
  q: string;
  onQuery: (v: string) => void;
  onAddUser: () => void;
}

const CHIPS: Array<{ id: AccessFilter; label: string; icon?: React.ReactNode; tone?: "danger" | "critical" }> = [
  { id: "all", label: "All Users" },
  { id: "admins", label: "Admins" },
  { id: "agents", label: "Agents" },
  { id: "suspended", label: "Suspended", icon: <Ban className="h-3.5 w-3.5" />, tone: "danger" },
  { id: "critical", label: "Critical Access", icon: <ShieldAlert className="h-3.5 w-3.5" />, tone: "critical" },
];

function chipClass(active: boolean, tone?: "danger" | "critical") {
  if (active) {
    if (tone === "critical") return "bg-red-500/20 text-red-200 border-red-500/60";
    if (tone === "danger") return "bg-red-500/15 text-red-300 border-red-500/50";
    return "bg-blue-600 text-white border-blue-600";
  }
  if (tone === "critical") return "bg-red-500/10 text-red-300 border-red-500/30 hover:bg-red-500/20";
  if (tone === "danger") return "bg-muted text-red-300 border-red-500/30 hover:bg-red-500/10";
  return "bg-muted text-foreground/80 border-transparent hover:bg-muted/70";
}

export function UserAccessFilters({ filter, onFilter, q, onQuery, onAddUser }: Props) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-base font-semibold text-foreground">Filter Internal Users</h3>
          <div className="flex flex-wrap gap-2">
            {CHIPS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onFilter(c.id)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${chipClass(filter === c.id, c.tone)}`}
              >
                {c.icon}
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={q}
              onChange={(e) => onQuery(e.target.value)}
              placeholder="Search users..."
              className="w-64 rounded-lg border border-border bg-muted/60 py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={onAddUser}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
          >
            <UserPlus className="h-4 w-4" /> Add User
          </button>
        </div>
      </div>
    </div>
  );
}