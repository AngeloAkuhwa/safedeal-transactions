import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import {
  fetchUsersDirectory, type UserDirectoryQuery, type UserDirectoryRow,
} from "@/services/admin-users-directory.service";
import { performFlaggedAction } from "@/services/admin-flagged-users.service";
import { UsersHeaderBar } from "@/components/admin/users/UsersHeaderBar";
import { UsersMobileTopBar } from "@/components/admin/users/UsersMobileTopBar";
import { UsersSummaryCards } from "@/components/admin/users/UsersSummaryCards";
import { UsersFilters } from "@/components/admin/users/UsersFilters";
import { UsersTable } from "@/components/admin/users/UsersTable";
import { UsersMobileFeed } from "@/components/admin/users/UsersMobileFeed";
import { UsersMobileStatsScroll } from "@/components/admin/users/UsersMobileStatsScroll";
import { UsersAdvancedFiltersSheet } from "@/components/admin/users/UsersAdvancedFiltersSheet";
import { UserDetailDrawer } from "@/components/admin/users/UserDetailDrawer";
import { ActionConfirmDialog } from "@/components/admin/transactions/ActionConfirmDialog";
import { useOnlinePresence } from "@/hooks/useOnlinePresence";

const TITLE = "User Directory";
const SUBTITLE = "Search and manage all platform users";

const DEFAULTS: UserDirectoryQuery = {
  role: "all", status: "all", verification: "all", range: "all",
  sort: "recent", page: 1, page_size: 20,
};

type PendingAction = { kind: "flag" | "clear_flag" | "suspend"; user_id: string; name: string } | null;

export default function AdminUsers() {
  const [params, setParams] = useSearchParams();
  const routeParams = useParams();
  const qc = useQueryClient();

  const [filters, setFilters] = useState<UserDirectoryQuery>(() => ({
    ...DEFAULTS,
    role: (params.get("role") as UserDirectoryQuery["role"]) ?? DEFAULTS.role,
    status: (params.get("status") as UserDirectoryQuery["status"]) ?? DEFAULTS.status,
    verification: (params.get("verification") as UserDirectoryQuery["verification"]) ?? DEFAULTS.verification,
    range: (params.get("range") as UserDirectoryQuery["range"]) ?? DEFAULTS.range,
    sort: (params.get("sort") as UserDirectoryQuery["sort"]) ?? DEFAULTS.sort,
  }));
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [appliedSearch, setAppliedSearch] = useState(params.get("q") ?? "");
  const [page, setPage] = useState(Number(params.get("page") ?? "1") || 1);
  const [drawerUser, setDrawerUser] = useState<string | null>(
    (routeParams as { id?: string }).id ?? params.get("u"),
  );
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  const query = useMemo<UserDirectoryQuery>(
    () => ({ ...filters, q: appliedSearch || undefined, page, page_size: 20 }),
    [filters, appliedSearch, page],
  );

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-users-directory", query],
    queryFn: () => fetchUsersDirectory(query),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (isError && error) {
      toast({ title: "Failed to load users", description: (error as Error).message, variant: "destructive" });
    }
  }, [isError, error]);

  useEffect(() => {
    const next = new URLSearchParams();
    for (const [k, dv] of [["role", DEFAULTS.role], ["status", DEFAULTS.status], ["verification", DEFAULTS.verification], ["range", DEFAULTS.range], ["sort", DEFAULTS.sort]] as const) {
      const v = (filters as Record<string, unknown>)[k];
      if (v && v !== dv) next.set(k, String(v));
    }
    if (appliedSearch) next.set("q", appliedSearch);
    if (page > 1) next.set("page", String(page));
    if (drawerUser && !((routeParams as { id?: string }).id)) next.set("u", drawerUser);
    setParams(next, { replace: true });
  }, [filters, appliedSearch, page, drawerUser, setParams, (routeParams as { id?: string }).id]);

  const onApply = useCallback(() => { setAppliedSearch(search); setPage(1); }, [search]);
  const onReset = useCallback(() => { setFilters(DEFAULTS); setSearch(""); setAppliedSearch(""); setPage(1); }, []);

  const onFlag = (row: UserDirectoryRow) => {
    if (row.is_flagged) {
      setPendingAction({ kind: "clear_flag", user_id: row.user_id, name: row.full_name });
    } else {
      setPendingAction({ kind: "flag", user_id: row.user_id, name: row.full_name });
    }
  };
  const onSuspendRow = (row: UserDirectoryRow) =>
    setPendingAction({ kind: "suspend", user_id: row.user_id, name: row.full_name });

  const onConfirmAction = async (reason: string) => {
    if (!pendingAction) return;
    const action = pendingAction.kind === "flag" ? "flag_user"
      : pendingAction.kind === "clear_flag" ? "clear_flag"
      : "suspend_user";
    await performFlaggedAction({ action, user_id: pendingAction.user_id, note: reason });
    toast({ title: "Action recorded", description: `${pendingAction.kind.replace("_", " ")} on ${pendingAction.name}` });
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["admin-users-directory"] }),
      qc.invalidateQueries({ queryKey: ["admin-user-detail", pendingAction.user_id] }),
      qc.invalidateQueries({ queryKey: ["admin-flagged-users"] }),
    ]);
    setPendingAction(null);
  };

  const summary = data?.summary;
  const rows = data?.rows ?? [];
  const { isOnline, onlineCount: globalOnline } = useOnlinePresence();
  const pageOnline = rows.reduce((acc, r) => acc + (isOnline(r.user_id) ? 1 : 0), 0);
  const pageOffline = Math.max(0, rows.length - pageOnline);

  return (
    <AdminLayout
      title={TITLE}
      subtitle={SUBTITLE}
      hideDefaultHeaders
      fullBleed
      headerSlot={
        <UsersHeaderBar
          totalUsers={summary?.total_users ?? 0}
          query={query}
          onlineCount={pageOnline}
          offlineCount={pageOffline}
          globalOnline={globalOnline}
        />
      }
      mobileHeaderSlot={({ onOpenMenu }) => (
        <UsersMobileTopBar
          onOpenMenu={onOpenMenu}
          totalUsers={summary?.total_users ?? 0}
          onlineCount={pageOnline}
          offlineCount={pageOffline}
        />
      )}
    >
      <div className="mx-auto w-full max-w-[1400px] lg:px-8 lg:py-6 lg:space-y-8 bg-slate-950 min-h-[100dvh]">
        {isLoading || !data ? (
          <div className="px-4 py-5 sm:px-6 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-[140px] rounded-xl bg-slate-900" />
              ))}
            </div>
            <Skeleton className="h-[120px] rounded-xl bg-slate-900" />
            <Skeleton className="h-[400px] rounded-xl bg-slate-900" />
          </div>
        ) : (
          <>
            {/* Mobile-only sections (match reference HTML) */}
            {summary && <UsersMobileStatsScroll summary={summary} />}
            <UsersAdvancedFiltersSheet
              value={filters}
              search={search}
              onChange={(next) => { setFilters(next); setPage(1); }}
              onSearchChange={setSearch}
              onApply={onApply}
              onReset={onReset}
            />
            <UsersMobileFeed
              rows={rows}
              total={data.total}
              page={data.page}
              pageSize={data.page_size}
              onOpen={(id) => setDrawerUser(id)}
              onPage={setPage}
              onFlagToggle={onFlag}
              onSuspend={onSuspendRow}
              isOnline={isOnline}
            />

            {/* Desktop-only sections */}
            <div className="hidden lg:block space-y-8">
              {summary && <UsersSummaryCards summary={summary} />}
              <UsersFilters
                value={filters}
                search={search}
                onChange={(next) => { setFilters(next); setPage(1); }}
                onSearchChange={setSearch}
                onApply={onApply}
                onReset={onReset}
              />
              <UsersTable
                rows={rows}
                total={data.total}
                page={data.page}
                pageSize={data.page_size}
                onOpenDetail={(id) => setDrawerUser(id)}
                onPage={setPage}
                onFlagToggle={onFlag}
                onSuspend={onSuspendRow}
                isOnline={isOnline}
              />
            </div>
          </>
        )}
      </div>

      <UserDetailDrawer
        userId={drawerUser}
        open={!!drawerUser}
        onClose={() => setDrawerUser(null)}
        onFlag={(id, name) => setPendingAction({ kind: "flag", user_id: id, name })}
        onSuspend={(id, name) => setPendingAction({ kind: "suspend", user_id: id, name })}
        onClearFlag={(id, name) => setPendingAction({ kind: "clear_flag", user_id: id, name })}
      />

      <ActionConfirmDialog
        open={!!pendingAction}
        onOpenChange={(o) => { if (!o) setPendingAction(null); }}
        title={
          pendingAction?.kind === "flag" ? `Flag ${pendingAction.name} for fraud review`
            : pendingAction?.kind === "clear_flag" ? `Clear flag on ${pendingAction.name}`
            : pendingAction ? `Suspend ${pendingAction.name}` : ""
        }
        description="A note is required and will appear in the audit timeline."
        reasonLabel="Note"
        reasonPlaceholder="Explain why this action is being taken…"
        confirmLabel={pendingAction?.kind === "clear_flag" ? "Clear flag" : pendingAction?.kind === "suspend" ? "Suspend user" : "Flag user"}
        confirmTone={pendingAction?.kind === "clear_flag" ? "primary" : "danger"}
        onConfirm={onConfirmAction}
      />
    </AdminLayout>
  );
}