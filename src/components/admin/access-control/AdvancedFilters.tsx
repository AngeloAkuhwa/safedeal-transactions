import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type {
  AccessLevel,
  InternalRoleKey,
  InternalUserStatus,
} from "@/services/admin-access-control.service";
import { ROLE_LABEL, ACCESS_LABEL, STATUS_LABEL } from "@/services/admin-access-control.service";

export interface AdvancedFilterState {
  role: InternalRoleKey | null;
  department: string | null;
  status: InternalUserStatus | null;
  access_level: AccessLevel | null;
}

const ROLES: InternalRoleKey[] = [
  "super_admin", "senior_admin", "dispute_manager", "dispute_agent",
  "support_agent", "identity_officer", "finance_operator", "finance_approver",
  "compliance_officer", "auditor",
];
const STATUSES: InternalUserStatus[] = [
  "invited", "pending_approval", "active", "suspended", "locked", "deactivated",
];
const LEVELS: AccessLevel[] = ["full", "high", "standard", "limited"];

const ALL = "__all__";

export function AdvancedFilters({
  state, onChange, departments,
}: {
  state: AdvancedFilterState;
  onChange: (next: AdvancedFilterState) => void;
  departments: string[];
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Role</label>
        <Select
          value={state.role ?? ALL}
          onValueChange={(v) => onChange({ ...state, role: v === ALL ? null : (v as InternalRoleKey) })}
        >
          <SelectTrigger className="h-11"><SelectValue placeholder="Any role" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any role</SelectItem>
            {ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Department / Team</label>
        <Select
          value={state.department ?? ALL}
          onValueChange={(v) => onChange({ ...state, department: v === ALL ? null : v })}
        >
          <SelectTrigger className="h-11"><SelectValue placeholder="Any department" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any department</SelectItem>
            {departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Status</label>
        <Select
          value={state.status ?? ALL}
          onValueChange={(v) => onChange({ ...state, status: v === ALL ? null : (v as InternalUserStatus) })}
        >
          <SelectTrigger className="h-11"><SelectValue placeholder="Any status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any status</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Access Level</label>
        <Select
          value={state.access_level ?? ALL}
          onValueChange={(v) => onChange({ ...state, access_level: v === ALL ? null : (v as AccessLevel) })}
        >
          <SelectTrigger className="h-11"><SelectValue placeholder="Any access level" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any access level</SelectItem>
            {LEVELS.map((l) => <SelectItem key={l} value={l}>{ACCESS_LABEL[l]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}