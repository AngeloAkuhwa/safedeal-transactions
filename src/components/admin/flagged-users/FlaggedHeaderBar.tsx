import { RefreshCw, ShieldAlert, Flag, AlertTriangle } from "lucide-react";
import { FlaggedExportButton } from "./FlaggedExportButton";
import type { FlaggedQuery } from "@/services/admin-flagged-users.service";

interface Props {
  activeFlags: number;
  critical: number;
  query: FlaggedQuery;
  isFetching: boolean;
  onRefresh: () => void;
}

export function FlaggedHeaderBar({ activeFlags, critical, query, isFetching, onRefresh }: Props) {
  return (
    <header className="sticky top-0 z-sticky hidden border-b border-slate-800 bg-slate-900/95 backdrop-blur px-4 py-5 md:px-8 lg:block">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <h2 className="text-white text-xl font-semibold flex items-center gap-2">
              <Flag className="h-5 w-5 text-red-400" /> Flagged Users
            </h2>
            <p className="text-slate-400 text-sm mt-0.5">Fraud review workspace for suspicious accounts and high-risk users</p>
          </div>
          <div className="flex items-center gap-2 ml-0 md:ml-4">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-lg">
              <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
              <span className="text-red-400 font-semibold text-sm">{activeFlags.toLocaleString()} Active Flags</span>
            </div>
            {critical > 0 && (
              <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 bg-orange-500/10 border border-orange-500/20 rounded-lg">
                <AlertTriangle className="h-3 w-3 text-orange-400" />
                <span className="text-orange-400 text-sm font-semibold">{critical} Critical</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <FlaggedExportButton query={query} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-all flex items-center gap-2 text-sm font-medium disabled:opacity-60" />
          <button type="button" onClick={onRefresh} disabled={isFetching} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-all flex items-center gap-2 text-sm font-medium disabled:opacity-60 min-h-11">
            {isFetching ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
            <span className="hidden sm:inline">Fraud Detection</span>
          </button>
        </div>
      </div>
    </header>
  );
}