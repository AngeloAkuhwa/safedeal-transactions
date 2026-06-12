import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Download, Play } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";
import { PayoutSummaryCards } from "@/components/admin/payouts/PayoutSummaryCards";
import { PayoutAdvancedFilters } from "@/components/admin/payouts/PayoutAdvancedFilters";
import { PayoutTabs } from "@/components/admin/payouts/PayoutTabs";
import { PayoutFilters } from "@/components/admin/payouts/PayoutFilters";
import { PayoutBatchBar } from "@/components/admin/payouts/PayoutBatchBar";
import { PayoutsTable, eligibleForRelease } from "@/components/admin/payouts/PayoutsTable";
import { PayoutMobileCards } from "@/components/admin/payouts/PayoutMobileCards";
import { PayoutDetailDrawer } from "@/components/admin/payouts/PayoutDetailDrawer";
import * as payoutsApi from "@/services/admin-payouts.service";
import type { PayoutRow, PayoutDetail, PayoutSummary, PayoutTab, PayoutListResponse } from "@/services/admin-payouts.service";

const SIDEBAR_BADGES = { disputes: 0, identity: 0, payouts: 0, flagged_users: 0, exports: 0 } as const;

const VALID_TABS: PayoutTab[] = ["all","pending_release","blocked","processing","completed","failed","reversed","on_hold"];

export default function AdminPayouts() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialTab = (searchParams.get("tab") as PayoutTab | null);
  const [tab, setTab] = useState<PayoutTab>(initialTab && VALID_TABS.includes(initialTab) ? initialTab : "all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [summary, setSummary] = useState<PayoutSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [rows, setRows] = useState<PayoutRow[]>([]);
  const [pagination, setPagination] = useState<PayoutListResponse["pagination"] | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [releasingId, setReleasingId] = useState<string | null>(null);

  const initialDeepPayout = searchParams.get("payout_id");
  const [openPayoutId, setOpenPayoutId] = useState<string | null>(initialDeepPayout);
  const [detail, setDetail] = useState<PayoutDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try { setSummary(await payoutsApi.getSummary()); }
    catch (e) { toast({ title: "Failed to load summary", description: (e as Error).message, variant: "destructive" }); }
    finally { setSummaryLoading(false); }
  }, []);

  const loadList = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await payoutsApi.listPayouts({ tab, search: search || undefined, page, limit: 50 });
      setRows(res.rows);
      setPagination(res.pagination);
    } catch (e) {
      toast({ title: "Failed to load payouts", description: (e as Error).message, variant: "destructive" });
    } finally { setListLoading(false); }
  }, [tab, search, page]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try { setDetail(await payoutsApi.getPayoutDetail(id)); }
    catch (e) { toast({ title: "Failed to load payout detail", description: (e as Error).message, variant: "destructive" }); }
    finally { setDetailLoading(false); }
  }, []);

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { if (openPayoutId) loadDetail(openPayoutId); else setDetail(null); }, [openPayoutId, loadDetail]);

  // Sync URL with tab + open payout
  useEffect(() => {
    const p = new URLSearchParams(searchParams);
    p.set("tab", tab);
    if (openPayoutId) p.set("payout_id", openPayoutId); else p.delete("payout_id");
    setSearchParams(p, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, openPayoutId]);

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

  async function handleBatchProcess() {
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
          await payoutsApi.releasePayout({ transaction_id: r.transaction.id, payout_id: r.id });
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

  const headerSlot = (
    <div className="sticky top-0 z-30 hidden border-b border-border bg-card lg:block">
      <div className="flex items-start justify-between gap-4 px-8 py-5">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold leading-tight text-foreground">Payout Management</h1>
          <p className="mt-1 text-sm text-muted-foreground">Monitor and manage seller payout processing</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" className="gap-2">
            <Download className="h-4 w-4" /> Export Report
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  size="sm"
                  className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={handleBatchProcess}
                  disabled={batchDisabled}
                >
                  <Play className="h-4 w-4" /> Process Batch
                  {eligibleSelectedCount > 0 && (
                    <span className="ml-1 rounded bg-white/20 px-1.5 py-0.5 text-[10px]">{eligibleSelectedCount}</span>
                  )}
                </Button>
              </span>
            </TooltipTrigger>
            {batchDisabled && (
              <TooltipContent>Select eligible pending payouts to process</TooltipContent>
            )}
          </Tooltip>
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

      <div className="bg-card border border-border rounded-xl p-4 sm:p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <PayoutTabs active={tab} onChange={(t) => { setTab(t); setPage(1); setSelectedIds(new Set()); }} summary={summary} />
          <PayoutFilters search={search} onSearch={(v) => { setSearch(v); setPage(1); }} />
        </div>

        <PayoutAdvancedFilters />

        <PayoutBatchBar
          selected={selectedRows.filter((r) => eligibleForRelease(r).ok)}
          onClear={() => setSelectedIds(new Set())}
          onProcess={handleBatchProcess}
          processing={batchProcessing}
        />
      </div>

        {/* Desktop table */}
        <div className="hidden md:block">
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
            total={pagination?.total}
            page={pagination?.page}
            limit={pagination?.limit}
            onRefresh={() => { loadList(); loadSummary(); }}
            onPageChange={(p) => setPage(p)}
          />
        </div>
        {/* Mobile cards */}
        <div className="md:hidden">
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
    </AdminLayout>
  );
}