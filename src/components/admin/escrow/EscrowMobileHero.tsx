import { Clock, RefreshCw } from "lucide-react";

export function EscrowMobileHero({
  lastUpdated, isFetching, onRefresh, critical, warnings,
}: {
  lastUpdated: string;
  isFetching: boolean;
  onRefresh: () => void;
  critical: number;
  warnings: number;
}) {
  return (
    <div className="lg:hidden bg-slate-900 border border-slate-800 rounded-xl p-4">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <h2 className="text-white text-base font-semibold">Escrow Overview</h2>
          <div className="mt-1.5 flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[12px] font-semibold">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live
            </span>
            <span className="inline-flex items-center gap-1 text-slate-400 text-[12px]">
              <Clock className="h-3 w-3" /> {lastUpdated}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isFetching}
          className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-60 min-h-11"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>
      {(critical > 0 || warnings > 0) && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            <p className="text-[12px] uppercase text-red-300/80">Critical</p>
            <p className="text-red-300 text-lg font-bold leading-tight">{critical}</p>
          </div>
          <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg px-3 py-2">
            <p className="text-[12px] uppercase text-orange-300/80">Warnings</p>
            <p className="text-orange-300 text-lg font-bold leading-tight">{warnings}</p>
          </div>
        </div>
      )}
    </div>
  );
}