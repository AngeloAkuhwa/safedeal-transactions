import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Download, Play, SlidersHorizontal } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { PayoutSummaryCards } from "@/components/admin/payouts/PayoutSummaryCards";
import { PayoutAdvancedFilters, DEFAULT_PAYOUT_FILTERS, filtersToQuery, type PayoutFilterState } from "@/components/admin/payouts/PayoutAdvancedFilters";
import { PayoutTabs } from "@/components/admin/payouts/PayoutTabs";
import { PayoutFilters } from "@/components/admin/payouts/PayoutFilters";
import { PayoutBatchBar } from "@/components/admin/payouts/PayoutBatchBar";
import { PayoutsTable, eligibleForRelease } from "@/components/admin/payouts/PayoutsTable";
import { PayoutMobileCards } from "@/components/admin/payouts/PayoutMobileCards";
import { PayoutDetailDrawer } from "@/components/admin/payouts/PayoutDetailDrawer";
import { PayoutPromptDialog } from "@/components/admin/payouts/PayoutPromptDialog";
import { BatchReleaseConfirmDialog } from "@/components/admin/payouts/BatchReleaseConfirmDialog";
import { formatMoney } from "@/lib/format";
import * as payoutsApi from "@/services/admin-payouts.service";
import type { PayoutRow, PayoutDetail, PayoutSummary, PayoutTab, PayoutListResponse } from "@/services/admin-payouts.service";
import { exportPayoutsCsv } from "@/lib/payout-export";
import { fetchAdminSettings } from "@/services/admin-settings.service";
import { ADMIN_TONE, ADMIN_SOLID } from "@/components/admin/palette";
import { Info } from "lucide-react";

const SIDEBAR_BADGES = { disputes: 0, identity: 0, payouts: 0, flagged_users: 0, exports: 0 } as const;

const VALID_TABS: PayoutTab[] = ["all","pending_release","blocked","processing","completed","failed","reversed","on_hold","stuck"];

export default function AdminPayouts() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialTab = (searchParams.get("tab") as PayoutTab | null);
  const [tab, setTab] = useState<PayoutTab>(
    initialTab && VALID_TABS.includes(initialTab) ? initialTab : "all"
  );
  const [search, setSearch] = useState("");
  // Debounced mirror of `search`: the loader depends on this so typing costs
  // one request instead of one per keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<PayoutFilterState>(() => ({
    ...DEFAULT_PAYOUT_FILTERS,
    status: (initialTab && VALID_TABS.includes(initialTab) ? initialTab : "all") as PayoutTab,
    dateRange: (searchParams.get("range") as PayoutFilterState["dateRange"]) || "all_time",
    amount: (searchParams.get("amount") as PayoutFilterState["amount"]) || "any",
    bank: (searchParams.get("bank") as PayoutFilterState["bank"]) || "all",
    quick: (searchParams.get("quick") as PayoutFilterState["quick"]) || "none",
    customFrom: searchParams.get("from") ?? undefined,
    customTo: searchParams.get("to") ?? undefined,
  }));
  const [summary, setSummary] = useState<PayoutSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [rows, setRows] = useState<PayoutRow[]>([]);
  const [pagination, setPagination] = useState<PayoutListResponse["pagination"] | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [batchConfirmOpen, setBatchConfirmOpen] = useState(false);
  const [releasingId, setReleasingId] = useState<string | null>(null);

  const initialDeepPayout = searchParams.get("payout_id");
  const [openPayoutId, setOpenPayoutId] = useState<string | null>(initialDeepPayout);
  const [detail, setDetail] = useState<PayoutDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [noteFor, setNoteFor] = useState<PayoutRow | null>(null);
  const [blockFor, setBlockFor] = useState<{ row: PayoutRow; pause: boolean } | null>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [autoReleaseOn, setAutoReleaseOn] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const payload = await fetchAdminSettings(null);
        const row = (payload.settings ?? []).find(
          (r) => r.setting_key === "escrow.auto_release_enabled" && r.scope === "platform",
        );
        setAutoReleaseOn(row ? Boolean(row.setting_value) : false);
      } catch { /* non-fatal */ }
    })();
  }, []);

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try { setSummary(await payoutsApi.getSummary()); }
    catch (e) { toast({ title: "Failed to load summary", description: (e as Error).message, variant: "destructive" }); }
    finally { setSummaryLoading(false); }
  }, []);

  const loadList = useCallback(async () => {
    setListLoading(true);
    try {
      const q = filtersToQuery(filters);
      const res = await payoutsApi.listPayouts({ tab, search: debouncedSearch || undefined, page, limit: 50, ...q });
      setRows(res.rows);
      setPagination(res.pagination);
    } catch (e) {
      toast({ title: "Failed to load payouts", description: (e as Error).message, variant: "destructive" });
    } finally { setListLoading(false); }
  }, [tab, debouncedSearch, page, filters]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try { setDetail(await payoutsApi.getPayoutDetail(id)); }
    catch (e) { toast({ title: "Failed to load payout detail", description: (e as Error).message, variant: "destructive" }); }
    finally { setDetailLoading(false); }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { if (openPayoutId) loadDetail(openPayoutId); else setDetail(null); }, [openPayoutId, loadDetail]);

  // Live polling of summary so KPI cards stay current
  useEffect(() => {
    const id = setInterval(() => { loadSummary(); }, 60_000);
    return () => clearInterval(id);
  }, [loadSummary]);

  // Sync URL with tab + open payout
  useEffect(() => {
    const p = new URLSearchParams(searchParams);
    p.set("tab", tab);
    if (openPayoutId) p.set("payout_id", openPayoutId); else p.delete("payout_id");
    p.set("range", filters.dateRange);
    if (filters.amount !== "any") p.set("amount", filters.amount); else p.delete("amount");
    if (filters.bank !== "all") p.set("bank", filters.bank); else p.delete("bank");
    if (filters.quick !== "none") p.set("quick", filters.quick); else p.delete("quick");
    if (filters.customFrom) p.set("from", filters.customFrom); else p.delete("from");
    if (filters.customTo) p.set("to", filters.customTo); else p.delete("to");
    setSearchParams(p, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, openPayoutId, filters]);

  const selectedRows = useMemo(() => rows.filter((r) => selectedIds.has(r.id)), [rows, selectedIds]);

  function handleToggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function handleToggleSelectAll() {
    const eligible = rows.filter((r) => eligibleForRelease(r).ok);
    const allSelected = eligible.length > 0 && eligible.every((r) => selectedIds.has(r.id));
    setSelectedIds(allSelected ? new Set() : new Set(eligible.map((r) => r.id)));
  }

  async function handleReleaseOne(row: PayoutRow) {
    setReleasingId(row.id);
    try {
      await payoutsApi.releasePayout({ transaction_id: row.transaction.id, payout_id: row.id });
      toast({ title: "Payout release initiated" });
      setSelectedIds((prev) => { const n = new Set(prev); n.delete(row.id); return n; });
      await Promise.all([loadList(), loadSummary()]);
      if (openPayoutId === row.id) loadDetail(row.id);
    } catch (e) {
      toast({ title: "Release failed", description: (e as Error).message, variant: "destructive" });
    } finally { setReleasingId(null); }
  }

  async function handleRetryOne(row: PayoutRow) {
    try {
      await payoutsApi.retryPayout({ payout_id: row.id });
      toast({ title: "Retry initiated" });
      await Promise.all([loadList(), loadSummary()]);
    } catch (e) {
      toast({ title: "Retry failed", description: (e as Error).message, variant: "destructive" });
    }
  }

  function handleUnblockOne(row: PayoutRow) {
    setOpenPayoutId(row.id);
  }

  function handleOpenSeller(row: PayoutRow) {
    navigate(`/admin/users/${row.seller.id}`);
  }
  function handleUpdateBank(row: PayoutRow) {
    navigate(`/admin/users/${row.seller.id}?tab=payout`);
  }
  function handleDownloadReceipt(row: PayoutRow) {
    exportPayoutsCsv([row], `payout-receipt-${row.transaction.code || row.id}.csv`);
    toast({ title: "Receipt downloaded" });
  }

  async function handleBatchProcess(reason: string) {
    const candidates = selectedRows.filter((r) => eligibleForRelease(r).ok);
    if (candidates.length === 0) {
      toast({ title: "No eligible payouts selected" });
      return;
    }
    setBatchProcessing(true);
    let ok = 0, failed = 0;
    const queue = [...candidates];
    const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
      while (queue.length > 0) {
        const r = queue.shift()!;
        try {
          await payoutsApi.releasePayout({
            transaction_id: r.transaction.id,
            payout_id: r.id,
            notes: reason,
          });
          ok++;
        } catch { failed++; }
      }
    });
    await Promise.all(workers);
    setBatchProcessing(false);
    toast({
      title: "Batch release complete",
      description: `${ok} released, ${failed} failed${failed ? ". See Failed tab." : ""}`,
    });
    setSelectedIds(new Set());
    await Promise.all([loadList(), loadSummary()]);
  }

  const eligibleSelectedCount = selectedRows.filter((r) => eligibleForRelease(r).ok).length;
  const batchDisabled = batchProcessing || eligibleSelectedCount === 0;
  const eligibleSelectedTotal = selectedRows
    .filter((r) => eligibleForRelease(r).ok)
    .reduce((acc, r) => acc + r.amount, 0);

  function handleExport() {
    if (rows.length === 0) {
      toast({ title: "Nothing to export", description: "There are no payouts in the current filter." });
      return;
    }
    exportPayoutsCsv(rows);
    toast({ title: "Export ready", description: `Exported ${rows.length} payout${rows.length === 1 ? "" : "s"} to CSV.` });
  }

  function handleProcessBatchClick() {
    // Never auto-select silently: batch release requires an explicit selection.
    if (eligibleSelectedCount === 0) {
      const anyEligible = rows.some((r) => eligibleForRelease(r).ok);
      toast({
        title: "Select payouts first",
        description: anyEligible
          ? "Tick the payouts you want to release, then run the batch."
          : "No payouts on this page are eligible for release. Adjust your filters and try again.",
      });
      return;
    }
    setBatchConfirmOpen(true);
  }

  const headerSlot = (
    <div className="sticky top-0 z-sticky hidden border-b border-border bg-card lg:block">
      <div className="flex items-start justify-between gap-4 px-8 py-5">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold leading-tight text-foreground">Payout Management</h1>
          <p className="mt-1 text-sm text-muted-foreground">Monitor and manage seller payout processing</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" className="gap-2 bg-slate-800 hover:bg-slate-700 text-foreground border border-slate-700" onClick={handleExport}>
            <Download className="h-4 w-4" /> Export Report
          </Button>
          <Button
            size="sm"
            className={`gap-2 ${ADMIN_SOLID.success}`}
            onClick={handleProcessBatchClick}
            disabled={batchProcessing}
          >
            <Play className="h-4 w-4" /> Process Batch
            {eligibleSelectedCount > 0 && (
              <span className="ml-1 rounded bg-white/20 px-1.5 py-0.5 text-xs">{eligibleSelectedCount}</span>
            )}
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <AdminLayout
      title="Payout Management"
      subtitle="Monitor and manage seller payout processing"
      badges={SIDEBAR_BADGES}
      headerSlot={headerSlot}
    >
      <PayoutSummaryCards summary={summary} loading={summaryLoading} />

      {autoReleaseOn !== null && (
        <div className={`mb-4 rounded-lg border px-3 py-2 flex items-center gap-2 text-xs ${
          autoReleaseOn
            ? `${ADMIN_TONE.success.panel} text-emerald-200`
            : `${ADMIN_TONE.warning.panel} text-amber-200`
        }`}>
          <Info className="h-3.5 w-3.5 shrink-0" />
          <span>
            <strong className="font-semibold">Auto-Release is {autoReleaseOn ? "ON" : "OFF"}.</strong>{" "}
            {autoReleaseOn
              ? "Eligible escrow will release automatically after the configured window."
              : "Payouts require manual admin release. Use the Release action on each row."}
          </span>
        </div>
      )}

      {/* Desktop: original slate panel with all filters visible */}
      <div className="hidden lg:block bg-slate-900 border border-slate-800 rounded-xl p-6">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between mb-6 gap-4">
          <PayoutTabs active={tab} onChange={(t) => { setTab(t); setFilters((f) => ({ ...f, status: t })); setPage(1); setSelectedIds(new Set()); }} summary={summary} />
          <PayoutFilters search={search} onSearch={(v) => { setSearch(v); setPage(1); }} />
        </div>

        <PayoutAdvancedFilters
          value={filters}
          onChange={(next) => {
            setFilters(next);
            setPage(1);
            if (next.status !== tab) setTab(next.status);
          }}
        />

        <PayoutBatchBar
          selected={selectedRows.filter((r) => eligibleForRelease(r).ok)}
          onClear={() => setSelectedIds(new Set())}
          onProcess={handleProcessBatchClick}
          processing={batchProcessing}
        />
      </div>

      {/* Mobile: flat layout matching reference */}
      <div className="lg:hidden space-y-3">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" /></svg>
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search seller, payout ID..."
            className="w-full pl-10 pr-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0 overflow-x-auto">
            <PayoutTabs active={tab} onChange={(t) => { setTab(t); setFilters((f) => ({ ...f, status: t })); setPage(1); setSelectedIds(new Set()); }} summary={summary} />
          </div>
          <button
            type="button"
            onClick={() => setMobileFiltersOpen((v) => !v)}
            aria-label="Toggle filters"
            className={`w-11 h-11 rounded-xl border flex items-center justify-center flex-shrink-0 ${mobileFiltersOpen ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : "bg-slate-900 text-slate-400 border-slate-800"}`}
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>
        </div>
        {mobileFiltersOpen && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <PayoutAdvancedFilters
              variant="mobile"
              value={filters}
              onChange={(next) => {
                setFilters(next);
                setPage(1);
                if (next.status !== tab) setTab(next.status);
              }}
            />
          </div>
        )}
        <PayoutBatchBar
          selected={selectedRows.filter((r) => eligibleForRelease(r).ok)}
          onClear={() => setSelectedIds(new Set())}
          onProcess={handleProcessBatchClick}
          processing={batchProcessing}
        />
      </div>

        {/* Desktop table */}
        <div className="hidden lg:block">
          <PayoutsTable
            rows={rows} loading={listLoading}
            selected={selectedIds}
            onToggleSelect={handleToggleSelect}
            onToggleSelectAll={handleToggleSelectAll}
            onOpen={(r) => setOpenPayoutId(r.id)}
            onRelease={handleReleaseOne}
            onRetry={handleRetryOne}
            onUnblock={handleUnblockOne}
            onOpenTransaction={(r) => navigate(`/admin/transactions/${r.transaction.id}`)}
            releasingId={releasingId}
            onOpenSeller={handleOpenSeller}
            onUpdateBank={handleUpdateBank}
            onDownloadReceipt={handleDownloadReceipt}
            onAddNote={(r) => setNoteFor(r)}
            onBlock={(r) => setBlockFor({ row: r, pause: false })}
            onPause={(r) => setBlockFor({ row: r, pause: true })}
            total={pagination?.total}
            page={pagination?.page}
            limit={pagination?.limit}
            onRefresh={() => { loadList(); loadSummary(); }}
            onPageChange={(p) => setPage(p)}
          />
        </div>
        {/* Mobile cards */}
        <div className="lg:hidden pb-20">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white text-sm font-semibold">
              Payout Records{" "}
              <span className="text-slate-500 font-normal">{pagination?.total ?? rows.length}</span>
            </h3>
            <button
              type="button"
              onClick={() => { loadList(); loadSummary(); }}
              className="text-slate-400 text-xs inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 hover:text-white"
            >
              Refresh
            </button>
          </div>
          <PayoutMobileCards
            rows={rows} loading={listLoading}
            selected={selectedIds}
            onToggleSelect={handleToggleSelect}
            onOpen={(r) => setOpenPayoutId(r.id)}
            onRelease={handleReleaseOne}
            onRetry={handleRetryOne}
            onUnblock={handleUnblockOne}
            releasingId={releasingId}
          />
        </div>

      <PayoutDetailDrawer
        open={!!openPayoutId}
        payoutId={openPayoutId}
        detail={detail}
        loading={detailLoading}
        onClose={() => setOpenPayoutId(null)}
        onActionDone={() => {
          if (openPayoutId) loadDetail(openPayoutId);
          loadList(); loadSummary();
        }}
      />
      <BatchReleaseConfirmDialog
        open={batchConfirmOpen}
        count={eligibleSelectedCount}
        totalLabel={formatMoney(eligibleSelectedTotal, "NGN")}
        processing={batchProcessing}
        onClose={() => setBatchConfirmOpen(false)}
        onConfirm={(reason) => handleBatchProcess(reason)}
      />
      <PayoutPromptDialog
        open={!!noteFor}
        title="Add internal note"
        description={noteFor ? `Transaction ${noteFor.transaction.code}` : undefined}
        placeholder="Note visible to admins only..."
        confirmLabel="Save note"
        onClose={() => setNoteFor(null)}
        onConfirm={async (note) => {
          if (!noteFor) return;
          try {
            await payoutsApi.addInternalNote({ transaction_id: noteFor.transaction.id, note });
            toast({ title: "Note added" });
          } catch (e) {
            toast({ title: "Failed to add note", description: (e as Error).message, variant: "destructive" });
          }
        }}
      />
      <PayoutPromptDialog
        open={!!blockFor}
        title={blockFor?.pause ? "Pause payout" : "Block payout"}
        description={blockFor ? `Transaction ${blockFor.row.transaction.code}` : undefined}
        placeholder="Reason (required)..."
        confirmLabel={blockFor?.pause ? "Pause" : "Block"}
        destructive
        onClose={() => setBlockFor(null)}
        onConfirm={async (reason) => {
          if (!blockFor) return;
          try {
            await payoutsApi.blockPayout({
              transaction_id: blockFor.row.transaction.id,
              payout_id: blockFor.row.id,
              reason: blockFor.pause ? `Paused for review: ${reason}` : reason,
            });
            toast({ title: blockFor.pause ? "Payout paused" : "Payout blocked" });
            loadList(); loadSummary();
          } catch (e) {
            toast({ title: "Action failed", description: (e as Error).message, variant: "destructive" });
          }
        }}
      />
    </AdminLayout>
  );
}