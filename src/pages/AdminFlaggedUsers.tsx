import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { fetchFlaggedUsers, type FlaggedQuery } from "@/services/admin-flagged-users.service";
import { FlaggedSummaryCards } from "@/components/admin/flagged-users/FlaggedSummaryCards";
import { FlaggedMobileStatsScroll } from "@/components/admin/flagged-users/FlaggedMobileStatsScroll";
import { FlaggedFilters } from "@/components/admin/flagged-users/FlaggedFilters";
import { FlaggedMobileSearchBar } from "@/components/admin/flagged-users/FlaggedMobileSearchBar";
import { FlaggedAdvancedFiltersSheet } from "@/components/admin/flagged-users/FlaggedAdvancedFiltersSheet";
import { FlaggedUsersTable } from "@/components/admin/flagged-users/FlaggedUsersTable";
import { FlaggedUsersMobileFeed } from "@/components/admin/flagged-users/FlaggedUsersMobileFeed";
import { FlaggedUserDrawer } from "@/components/admin/flagged-users/FlaggedUserDrawer";
import { FlaggedHeaderBar } from "@/components/admin/flagged-users/FlaggedHeaderBar";
import { FlaggedMobileTopBar } from "@/components/admin/flagged-users/FlaggedMobileTopBar";
import { FlaggedBulkActionBar } from "@/components/admin/flagged-users/FlaggedBulkActionBar";

const TITLE = "Flagged Users";
const SUBTITLE = "Fraud review workspace for suspicious accounts and high-risk users";

const DEFAULTS: FlaggedQuery = {
  risk: "all", reason: "all", range: "30d", status: "all",
  sort: "risk", page: 1, page_size: 15,
};

export default function AdminFlaggedUsers() {
  const [params, setParams] = useSearchParams();

  const [filters, setFilters] = useState<FlaggedQuery>(() => ({
    ...DEFAULTS,
    risk: (params.get("risk") as FlaggedQuery["risk"]) ?? DEFAULTS.risk,
    reason: (params.get("reason") as FlaggedQuery["reason"]) ?? DEFAULTS.reason,
    range: (params.get("range") as FlaggedQuery["range"]) ?? DEFAULTS.range,
    status: (params.get("status") as FlaggedQuery["status"]) ?? DEFAULTS.status,
    sort: (params.get("sort") as FlaggedQuery["sort"]) ?? DEFAULTS.sort,
  }));
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [appliedSearch, setAppliedSearch] = useState(params.get("q") ?? "");
  const [page, setPage] = useState(Number(params.get("page") ?? "1") || 1);
  const [drawerUser, setDrawerUser] = useState<string | null>(params.get("u"));
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const query = useMemo<FlaggedQuery>(
    () => ({ ...filters, q: appliedSearch || undefined, page, page_size: 15 }),
    [filters, appliedSearch, page],
  );

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-flagged-users", query],
    queryFn: () => fetchFlaggedUsers(query),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (isError && error) {
      toast({ title: "Failed to load flagged users", description: (error as Error).message, variant: "destructive" });
    }
  }, [isError, error]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (filters.risk && filters.risk !== "all") next.set("risk", filters.risk);
    if (filters.reason && filters.reason !== "all") next.set("reason", filters.reason);
    if (filters.range && filters.range !== "30d") next.set("range", filters.range);
    if (filters.status && filters.status !== "all") next.set("status", filters.status);
    if (filters.sort && filters.sort !== "risk") next.set("sort", filters.sort);
    if (appliedSearch) next.set("q", appliedSearch);
    if (page > 1) next.set("page", String(page));
    if (drawerUser) next.set("u", drawerUser);
    setParams(next, { replace: true });
  }, [filters, appliedSearch, page, drawerUser, setParams]);

  const onApply = useCallback(() => { setAppliedSearch(search); setPage(1); }, [search]);
  const onReset = useCallback(() => { setFilters(DEFAULTS); setSearch(""); setAppliedSearch(""); setPage(1); }, []);

  const toggleSelect = (id: string) =>
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const rows = data?.rows ?? [];
  const drawerRow = drawerUser ? rows.find((r) => r.user_id === drawerUser) ?? null : null;

  const toggleAll = () =>
    setSelected((s) => {
      if (rows.every((r) => s.has(r.user_id))) return new Set();
      const n = new Set(s);
      rows.forEach((r) => n.add(r.user_id));
      return n;
    });

  const summary = data?.summary;

  return (
    <AdminLayout
      title={TITLE}
      subtitle={SUBTITLE}
      hideDefaultHeaders
      fullBleed
      headerSlot={
        <FlaggedHeaderBar
          activeFlags={summary?.total_flagged ?? 0}
          critical={summary?.critical ?? 0}
          query={query}
          isFetching={isFetching}
          onRefresh={() => void refetch()}
        />
      }
      mobileHeaderSlot={({ onOpenMenu }) => (
        <FlaggedMobileTopBar onOpenMenu={onOpenMenu} activeFlags={summary?.total_flagged ?? 0} />
      )}
    >
      <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6 lg:px-8 lg:py-6 space-y-6 lg:space-y-8 bg-slate-950 min-h-[100dvh]">
        {isLoading || !data ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-[140px] rounded-xl bg-slate-900" />
              ))}
            </div>
            <Skeleton className="h-[180px] rounded-xl bg-slate-900" />
            <Skeleton className="h-[400px] rounded-xl bg-slate-900" />
          </>
        ) : (
          <>
            {summary && <FlaggedSummaryCards summary={summary} />}
            {summary && <FlaggedMobileStatsScroll summary={summary} />}

            <FlaggedFilters
              value={filters}
              search={search}
              onChange={(next) => { setFilters(next); setPage(1); }}
              onSearchChange={setSearch}
              onApply={onApply}
              onReset={onReset}
            />

            <FlaggedMobileSearchBar
              search={search}
              onSearchChange={setSearch}
              onApply={onApply}
              onOpenFilters={() => setAdvancedOpen(true)}
            />

            <FlaggedUsersTable
              rows={rows}
              total={data.total}
              page={data.page}
              pageSize={data.page_size}
              selected={selected}
              onToggleSelect={toggleSelect}
              onToggleAll={toggleAll}
              onOpenDetail={(id) => setDrawerUser(id)}
              onPage={setPage}
              sort={filters.sort ?? "risk"}
              onSortToggle={() => setFilters({ ...filters, sort: filters.sort === "risk" ? "recent" : "risk" })}
            />

            <FlaggedUsersMobileFeed
              rows={rows}
              total={data.total}
              page={data.page}
              pageSize={data.page_size}
              onOpen={(id) => setDrawerUser(id)}
              onPage={setPage}
            />
          </>
        )}
      </div>

      <FlaggedAdvancedFiltersSheet
        open={advancedOpen}
        onOpenChange={setAdvancedOpen}
        value={filters}
        search={search}
        onChange={(next) => { setFilters(next); setPage(1); }}
        onSearchChange={setSearch}
        onApply={onApply}
        onReset={onReset}
      />

      <FlaggedUserDrawer
        row={drawerRow}
        userId={drawerUser}
        open={!!drawerUser}
        onClose={() => setDrawerUser(null)}
      />

      <FlaggedBulkActionBar userIds={Array.from(selected)} onClear={() => setSelected(new Set())} />
    </AdminLayout>
  );
}