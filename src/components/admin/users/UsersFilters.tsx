import { Search, X } from "lucide-react";
import type { UserDirectoryQuery } from "@/services/admin-users-directory.service";
import { resolveClaim } from "@/lib/trust/trust-claims";

interface Props {
  value: UserDirectoryQuery;
  search: string;
  onChange: (v: UserDirectoryQuery) => void;
  onSearchChange: (s: string) => void;
  onApply: () => void;
  onReset: () => void;
}

const ROLES: Array<{ v: string; l: string }> = [
  { v: "all", l: "All Roles" }, { v: "buyer", l: "Buyer" }, { v: "seller", l: "Seller" },
  { v: "business", l: "Business" }, { v: "admin", l: "Admin" },
];
const STATUSES: Array<{ v: string; l: string }> = [
  { v: "all", l: "All Status" }, { v: "active", l: "Active" }, { v: "flagged", l: "Flagged" },
  { v: "suspended", l: "Suspended" }, { v: "pending", l: "Pending" }, { v: "under_investigation", l: "Under Investigation" },
];
const VERIFS: Array<{ v: string; l: string }> = [
  { v: "all", l: "All Verification" }, { v: "fully", l: "Fully Verified" }, { v: "id", l: "ID Verified" },
  { v: "phone", l: resolveClaim("SELLER_PHONE_VERIFIED", { phoneVerified: true })! }, { v: "email", l: "Email Only" }, { v: "none", l: "Unverified" },
];
const RANGES: Array<{ v: string; l: string }> = [
  { v: "all", l: "All Time" }, { v: "7d", l: "Last 7 days" }, { v: "30d", l: "Last 30 days" }, { v: "90d", l: "Last 90 days" },
];
const SORTS: Array<{ v: string; l: string }> = [
  { v: "recent", l: "Most Recent" }, { v: "name", l: "Name (A–Z)" },
  { v: "transactions", l: "Most Transactions" }, { v: "disputes", l: "Most Disputes" },
];

function Select({ value, options, onChange }: { value: string; options: { v: string; l: string }[]; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 min-h-11"
    >
      {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  );
}

export function UsersFilters({ value, search, onChange, onSearchChange, onApply, onReset }: Props) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
        <div className="md:col-span-2 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onApply(); }}
            placeholder="Search name, email, phone, ID…"
            className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 min-h-11"
          />
        </div>
        <Select value={value.role ?? "all"} options={ROLES} onChange={(v) => onChange({ ...value, role: v as UserDirectoryQuery["role"] })} />
        <Select value={value.status ?? "all"} options={STATUSES} onChange={(v) => onChange({ ...value, status: v as UserDirectoryQuery["status"] })} />
        <Select value={value.verification ?? "all"} options={VERIFS} onChange={(v) => onChange({ ...value, verification: v as UserDirectoryQuery["verification"] })} />
        <Select value={value.range ?? "all"} options={RANGES} onChange={(v) => onChange({ ...value, range: v as UserDirectoryQuery["range"] })} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
        <Select value={value.sort ?? "recent"} options={SORTS} onChange={(v) => onChange({ ...value, sort: v as UserDirectoryQuery["sort"] })} />
        <div className="flex items-center gap-2">
          <button type="button" onClick={onReset} className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg flex items-center gap-1.5 min-h-11">
            <X className="h-4 w-4" /> Reset
          </button>
          <button type="button" onClick={onApply} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg flex items-center gap-1.5 min-h-11">
            <Search className="h-4 w-4" /> Search
          </button>
        </div>
      </div>
    </div>
  );
}