import { Search } from "lucide-react";
import { ADMIN_FOCUS, ADMIN_GROUND, ADMIN_SOLID } from "@/components/admin/palette";
import type { EscrowQuery } from "@/services/admin-escrow.service";

interface Props {
  value: EscrowQuery;
  search: string;
  onSearchChange: (v: string) => void;
  onChange: (next: EscrowQuery) => void;
  onApply: () => void;
  onReset: () => void;
}

function Select<T extends string>({ label, value, onChange, options }: {
  label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[];
}) {
  return (
    <div>
      <label className="text-slate-400 text-xs lg:text-sm font-medium mb-2 block">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className={`w-full p-2.5 lg:p-3 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm ${ADMIN_FOCUS} min-h-11`}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

export function EscrowFilters({ value, search, onSearchChange, onChange, onApply, onReset }: Props) {
  return (
    <div className={`${ADMIN_GROUND.panel} border rounded-xl`}>
      <div className="p-4 lg:p-6 border-b border-slate-800">
        <h3 className="text-white text-base lg:text-lg font-semibold">Filters &amp; Search</h3>
        <p className="text-slate-400 text-xs lg:text-sm mt-1">Filter and search escrow records</p>
      </div>
      <div className="p-4 lg:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-4">
          <Select
            label="Escrow State"
            value={value.state ?? "all"}
            onChange={(v) => onChange({ ...value, state: v })}
            options={[
              { value: "all", label: "All States" },
              { value: "held", label: "Held" },
              { value: "frozen", label: "Frozen" },
              { value: "pending_release", label: "Pending Release" },
              { value: "released", label: "Released" },
              { value: "refunded", label: "Refunded" },
            ]}
          />
          <Select
            label="Date Range"
            value={value.date_range ?? "30d"}
            onChange={(v) => onChange({ ...value, date_range: v })}
            options={[
              { value: "30d", label: "Last 30 Days" },
              { value: "7d", label: "Last 7 Days" },
              { value: "today", label: "Today" },
              { value: "all", label: "All Time" },
            ]}
          />
          <Select
            label="Amount Range"
            value={value.amount_bucket ?? "any"}
            onChange={(v) => onChange({ ...value, amount_bucket: v })}
            options={[
              { value: "any", label: "All Amounts" },
              { value: "lt_100k", label: "₦0 – ₦100,000" },
              { value: "100k_1m", label: "₦100,000 – ₦1,000,000" },
              { value: "gt_1m", label: "₦1,000,000+" },
            ]}
          />
          <Select
            label="Special Flags"
            value={value.flag ?? "all"}
            onChange={(v) => onChange({ ...value, flag: v })}
            options={[
              { value: "all", label: "All Records" },
              { value: "flagged", label: "Flagged / Disputed" },
              { value: "high_value", label: "High Value (₦1M+)" },
              { value: "state_mismatch", label: "State Mismatch" },
            ]}
          />
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <input
              type="text"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onApply(); }}
              placeholder="Search by transaction code, buyer, seller, or payment reference…"
              className={`w-full p-2.5 lg:p-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 text-sm ${ADMIN_FOCUS} min-h-11`}
            />
          </div>
          <button
            type="button"
            onClick={onApply}
            className={`px-5 py-2.5 lg:py-3 ${ADMIN_SOLID.success} rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 min-h-11`}
          >
            <Search className="h-4 w-4" />
            Search
          </button>
          <button
            type="button"
            onClick={onReset}
            className="px-5 py-2.5 lg:py-3 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm font-semibold transition-all min-h-11"
          >
            Clear Filters
          </button>
        </div>
      </div>
    </div>
  );
}