import { Search } from "lucide-react";
import { ADMIN_GROUND, ADMIN_SOLID } from "@/components/admin/palette";
import type { FlaggedQuery } from "@/services/admin-flagged-users.service";

interface Props {
  value: FlaggedQuery;
  search: string;
  onChange: (next: FlaggedQuery) => void;
  onSearchChange: (v: string) => void;
  onApply: () => void;
  onReset: () => void;
}

const SELECT_CLS =
  "min-h-11 w-full p-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-red-500";

export function FlaggedFilters({ value, search, onChange, onSearchChange, onApply, onReset }: Props) {
  return (
    <div className={`hidden lg:block ${ADMIN_GROUND.panel} border rounded-xl`}>
      <div className="p-6 border-b border-slate-800">
        <h3 className="text-white text-lg font-semibold">Filter &amp; Search</h3>
        <p className="text-slate-400 text-sm mt-1">Filter flagged users by risk level, reason, and date range</p>
      </div>
      <div className="p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="text-slate-400 text-sm font-medium mb-2 block">Risk Level</label>
            <select
              className={SELECT_CLS}
              value={value.risk ?? "all"}
              onChange={(e) => onChange({ ...value, risk: e.target.value as FlaggedQuery["risk"] })}
            >
              <option value="all">All Risk Levels</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <div>
            <label className="text-slate-400 text-sm font-medium mb-2 block">Flag Reason</label>
            <select
              className={SELECT_CLS}
              value={value.reason ?? "all"}
              onChange={(e) => onChange({ ...value, reason: e.target.value as FlaggedQuery["reason"] })}
            >
              <option value="all">All Reasons</option>
              <option value="multiple_disputes">Multiple Disputes</option>
              <option value="suspicious_activity">Suspicious Activity</option>
              <option value="chargeback_pattern">Chargeback Pattern</option>
              <option value="identity_issues">Identity Issues</option>
              <option value="fraud_detection">Fraud Detection</option>
              <option value="stuck_frozen_escrow">Stuck/Frozen Escrow</option>
              <option value="admin_flag">Admin Flag</option>
            </select>
          </div>
          <div>
            <label className="text-slate-400 text-sm font-medium mb-2 block">Date Range</label>
            <select
              className={SELECT_CLS}
              value={value.range ?? "30d"}
              onChange={(e) => onChange({ ...value, range: e.target.value as FlaggedQuery["range"] })}
            >
              <option value="30d">Last 30 Days</option>
              <option value="7d">Last 7 Days</option>
              <option value="today">Today</option>
              <option value="all">All Time</option>
            </select>
          </div>
          <div>
            <label className="text-slate-400 text-sm font-medium mb-2 block">Status</label>
            <select
              className={SELECT_CLS}
              value={value.status ?? "all"}
              onChange={(e) => onChange({ ...value, status: e.target.value as FlaggedQuery["status"] })}
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Flags</option>
              <option value="under_review">Under Review</option>
              <option value="suspended">Suspended</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <input
              type="text"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onApply();
              }}
              placeholder="Search by user name, email, ID, or transaction code..."
              className="w-full p-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-red-500"
            />
          </div>
          <button
            type="button"
            onClick={onApply}
            className={`px-6 py-3 ${ADMIN_SOLID.danger} rounded-lg font-semibold transition-all flex items-center justify-center gap-2`}
          >
            <Search className="h-4 w-4" /> Search
          </button>
          <button
            type="button"
            onClick={onReset}
            className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg font-semibold transition-all"
          >
            Clear Filters
          </button>
        </div>
      </div>
    </div>
  );
}