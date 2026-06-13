import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, RefreshCw, Clock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { EscrowKpiCards } from "@/components/admin/escrow/EscrowKpiCards";
import { EscrowCharts } from "@/components/admin/escrow/EscrowCharts";
import { EscrowAlertsPanel } from "@/components/admin/escrow/EscrowAlertsPanel";
import { EscrowFilters } from "@/components/admin/escrow/EscrowFilters";
import { EscrowRecordsTable } from "@/components/admin/escrow/EscrowRecordsTable";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { fetchEscrowOverview, type EscrowQuery } from "@/services/admin-escrow.service";

const TITLE = "Escrow Overview";
const SUBTITLE = "Real-time financial control center for all platform escrow funds";

const DEFAULTS: EscrowQuery = {
  state: "all",
  date_range: "30d",
  amount_bucket: "any",
  flag: "all",
  page: 1,
  page_size: 20,
};

export default function AdminEscrow() {
  const [filters, setFilters] = useState<EscrowQuery>(DEFAULTS);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(1);

  const query = useMemo<EscrowQuery>(() => ({
    ...filters, q: appliedSearch || undefined, page, page_size: 20,
  }), [filters, appliedSearch, page]);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-escrow-overview", query],
    queryFn: () => fetchEscrowOverview(query),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (isError && error) toast({ title: "Failed to load escrow", description: (error as Error).message, variant: "destructive" });
  }, [isError, error]);

  const onApply = useCallback(() => { setAppliedSearch(search); setPage(1); }, [search]);
  const onReset = useCallback(() => { setFilters(DEFAULTS); setSearch(""); setAppliedSearch(""); setPage(1); }, []);

  return (
    <AdminLayout title={TITLE} subtitle={SUBTITLE}>
      <div className="space-y-4 lg:space-y-6">
        {/* Header bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[11px] font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300 text-[11px] font-medium">
              <Clock className="h-3 w-3" />
              Last updated {new Date().toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" disabled className="px-3 py-2 bg-slate-800 text-slate-300 rounded-lg text-sm font-medium inline-flex items-center gap-2 cursor-not-allowed opacity-70">
              <Download className="h-4 w-4" /> <span className="hidden sm:inline">Export Report</span>
            </button>
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={isFetching}
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh Data</span>
            </button>
          </div>
        </div>

        {isLoading || !data ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 lg:gap-4">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[120px] rounded-xl bg-slate-900" />)}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
              <Skeleton className="h-[300px] rounded-xl bg-slate-900" />
              <Skeleton className="h-[300px] rounded-xl bg-slate-900" />
              <Skeleton className="h-[350px] rounded-xl bg-slate-900 lg:col-span-2" />
            </div>
            <Skeleton className="h-[320px] rounded-xl bg-slate-900" />
            <Skeleton className="h-[200px] rounded-xl bg-slate-900" />
            <Skeleton className="h-[400px] rounded-xl bg-slate-900" />
          </>
        ) : (
          <>
            <EscrowKpiCards kpis={data.kpis} />
            <EscrowCharts trends={data.trends} />
            <EscrowAlertsPanel alerts={data.alerts} />
            <EscrowFilters
              value={filters}
              search={search}
              onSearchChange={setSearch}
              onChange={(next) => { setFilters(next); setPage(1); }}
              onApply={onApply}
              onReset={onReset}
            />
            <EscrowRecordsTable
              rows={data.records.rows}
              total={data.records.total}
              page={data.records.page}
              pageSize={data.records.page_size}
              onPage={setPage}
            />
          </>
        )}
      </div>
    </AdminLayout>
  );
}