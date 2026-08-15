import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { RefreshCw, Clock } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminMobileHeader } from "@/components/admin/AdminMobileHeader";
import { EscrowKpiCards } from "@/components/admin/escrow/EscrowKpiCards";
import { EscrowCharts } from "@/components/admin/escrow/EscrowCharts";
import { EscrowAlertsPanel } from "@/components/admin/escrow/EscrowAlertsPanel";
import { EscrowFilters } from "@/components/admin/escrow/EscrowFilters";
import { EscrowRecordsTable } from "@/components/admin/escrow/EscrowRecordsTable";
import { EscrowExportButton } from "@/components/admin/escrow/EscrowExportButton";
import { EscrowRecordDrawer } from "@/components/admin/escrow/EscrowRecordDrawer";
import { EscrowMobileHero } from "@/components/admin/escrow/EscrowMobileHero";
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
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useState<EscrowQuery>(() => ({
    ...DEFAULTS,
    state: (params.get("state") as EscrowQuery["state"]) ?? DEFAULTS.state,
    date_range: (params.get("date_range") as EscrowQuery["date_range"]) ?? DEFAULTS.date_range,
    amount_bucket: (params.get("amount_bucket") as EscrowQuery["amount_bucket"]) ?? DEFAULTS.amount_bucket,
    flag: (params.get("flag") as EscrowQuery["flag"]) ?? DEFAULTS.flag,
  }));
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [appliedSearch, setAppliedSearch] = useState(params.get("q") ?? "");
  const [page, setPage] = useState(Number(params.get("page") ?? "1") || 1);
  const [drawerTx, setDrawerTx] = useState<string | null>(params.get("tx"));
  const queryClient = useQueryClient();

  const query = useMemo<EscrowQuery>(() => ({
    ...filters, q: appliedSearch || undefined, page, page_size: 20,
  }), [filters, appliedSearch, page]);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-escrow-overview", query],
    queryFn: () => fetchEscrowOverview(query),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (isError && error) toast({ title: "Failed to load escrow", description: (error as Error).message, variant: "destructive" });
  }, [isError, error]);

  // Sync filters + drawer + page to URL.
  useEffect(() => {
    const next = new URLSearchParams();
    if (filters.state && filters.state !== "all") next.set("state", filters.state);
    if (filters.date_range && filters.date_range !== "30d") next.set("date_range", filters.date_range);
    if (filters.amount_bucket && filters.amount_bucket !== "any") next.set("amount_bucket", filters.amount_bucket);
    if (filters.flag && filters.flag !== "all") next.set("flag", filters.flag);
    if (appliedSearch) next.set("q", appliedSearch);
    if (page > 1) next.set("page", String(page));
    if (drawerTx) next.set("tx", drawerTx);
    setParams(next, { replace: true });
  }, [filters, appliedSearch, page, drawerTx, setParams]);

  const onApply = useCallback(() => { setAppliedSearch(search); setPage(1); }, [search]);
  const onReset = useCallback(() => { setFilters(DEFAULTS); setSearch(""); setAppliedSearch(""); setPage(1); }, []);

  const lastUpdated = useMemo(
    () => new Date().toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" }),
    [data],
  );

  const desktopHeader = (
    <header className="sticky top-0 z-sticky hidden border-b border-slate-800 bg-slate-900/95 backdrop-blur px-4 py-5 md:px-8 lg:block">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <h2 className="text-white text-xl font-semibold">{TITLE}</h2>
            <p className="text-slate-400 text-sm mt-0.5">{SUBTITLE}</p>
          </div>
          <div className="flex items-center gap-2 ml-0 md:ml-4">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 sd-live-dot" />
              <span className="text-emerald-400 font-semibold text-sm">Live</span>
            </div>
            <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg">
              <Clock className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-slate-300 text-sm">Last updated: {lastUpdated}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <EscrowExportButton query={query} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-all flex items-center gap-2 text-sm font-medium disabled:opacity-60" />
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-all flex items-center gap-2 text-sm font-medium disabled:opacity-60 min-h-11"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh Data</span>
          </button>
        </div>
      </div>
    </header>
  );

  return (
    <AdminLayout
      title={TITLE}
      subtitle={SUBTITLE}
      hideDefaultHeaders
      fullBleed
      headerSlot={desktopHeader}
      mobileHeaderSlot={({ onOpenMenu }) => (
        <AdminMobileHeader onOpenMenu={onOpenMenu} title={TITLE} subtitle={SUBTITLE} />
      )}
    >
      <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6 lg:px-8 lg:py-6 space-y-4 lg:space-y-6">
        {data && (
          <EscrowMobileHero
            lastUpdated={lastUpdated}
            isFetching={isFetching}
            onRefresh={() => void refetch()}
            critical={data.alerts.counts.critical}
            warnings={data.alerts.counts.warning}
          />
        )}
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
            <EscrowAlertsPanel
              alerts={data.alerts}
              onThresholdsSaved={() => {
                void queryClient.invalidateQueries({ queryKey: ["admin-escrow-overview"] });
              }}
            />
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
              onOpenDetail={(id) => setDrawerTx(id)}
              exportSlot={<EscrowExportButton query={query} className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm font-medium inline-flex items-center gap-2 disabled:opacity-60" />}
            />
            <EscrowRecordDrawer
              txId={drawerTx}
              open={!!drawerTx}
              onClose={() => setDrawerTx(null)}
            />
          </>
        )}
      </div>
    </AdminLayout>
  );
}