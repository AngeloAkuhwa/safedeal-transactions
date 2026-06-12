import { Loader2 } from "lucide-react";
import {
  FaArrowsRotate, FaTriangleExclamation, FaCheck, FaClock, FaBan,
  FaEye, FaRotateRight, FaEllipsisVertical, FaChevronLeft, FaChevronRight,
  FaArrowUpRightFromSquare, FaXmark,
} from "react-icons/fa6";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatMoney } from "@/lib/format";
import { formatRelative } from "@/components/admin/dashboard/relative";
import { PayoutStatusPill } from "./PayoutStatusPill";
import type { PayoutRow } from "@/services/admin-payouts.service";

interface Props {
  rows: PayoutRow[];
  loading: boolean;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onOpen: (row: PayoutRow) => void;
  onRelease: (row: PayoutRow) => void;
  onRetry: (row: PayoutRow) => void;
  onUnblock: (row: PayoutRow) => void;
  onOpenTransaction: (row: PayoutRow) => void;
  releasingId: string | null;
  total?: number;
  page?: number;
  limit?: number;
  onRefresh?: () => void;
  onPageChange?: (page: number) => void;
}

function eligibleForRelease(r: PayoutRow): { ok: boolean; reason?: string } {
  if (r.release_blocked) return { ok: false, reason: r.payout_blocked_reason ?? "Payout is blocked" };
  if (r.status !== "awaiting_release") return { ok: false, reason: `Status is ${r.status}` };
  if (r.transaction.money_status !== "funds_pending_release") return { ok: false, reason: `Money status is ${r.transaction.money_status ?? "unknown"}` };
  if (r.transaction.dispute_status && r.transaction.dispute_status !== "resolved") return { ok: false, reason: "Active dispute" };
  if (r.transaction.needs_release_review) return { ok: false, reason: "Needs admin review" };
  if (r.transaction.refund_in_flight) return { ok: false, reason: "Refund in flight" };
  if (r.payout_account?.verification_status !== "verified") return { ok: false, reason: "Payout account not verified" };
  if (!r.payout_account?.has_recipient_code) return { ok: false, reason: "Missing provider recipient code" };
  return { ok: true };
}

const emeraldBtn = "px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-all flex items-center gap-2 text-xs font-semibold whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed";
const slateBtn = "px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-all flex items-center gap-2 text-xs font-medium whitespace-nowrap";

function primaryCTA(r: PayoutRow, releasingId: string | null,
  onRelease: () => void, onRetry: () => void, onUnblock: () => void, onOpen: () => void) {
  const isReleasing = releasingId === r.id;
  if (r.release_blocked) {
    return <button onClick={onUnblock} className={slateBtn}><FaBan className="text-xs" />Unblock</button>;
  }
  if (r.status === "failed" && r.retry_allowed) {
    return <button onClick={onRetry} className={emeraldBtn}><FaRotateRight className="text-xs" />Retry</button>;
  }
  if (r.status === "awaiting_release") {
    const e = eligibleForRelease(r);
    const btn = (
      <button disabled={!e.ok || isReleasing} onClick={onRelease} className={emeraldBtn}>
        {isReleasing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><FaCheck className="text-xs" />Release</>}
      </button>
    );
    if (e.ok) return btn;
    return (
      <Tooltip>
        <TooltipTrigger asChild><span tabIndex={0}>{btn}</span></TooltipTrigger>
        <TooltipContent>{e.reason}</TooltipContent>
      </Tooltip>
    );
  }
  return <button onClick={onOpen} className={slateBtn}><FaEye className="text-xs" />View</button>;
}

function PayoutIdIcon({ row }: { row: PayoutRow }) {
  if (row.release_blocked) return <div className="w-8 h-8 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center justify-center shrink-0"><FaBan className="text-red-400 text-xs" /></div>;
  if (row.status === "failed") return <div className="w-8 h-8 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center justify-center shrink-0"><FaTriangleExclamation className="text-red-400 text-xs" /></div>;
  if (row.status === "completed") return <div className="w-8 h-8 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-center justify-center shrink-0"><FaCheck className="text-emerald-400 text-xs" /></div>;
  if (row.status === "pending" || row.status === "processing") return <div className="w-8 h-8 bg-blue-500/10 border border-blue-500/30 rounded-lg flex items-center justify-center shrink-0"><FaArrowsRotate className="text-blue-400 text-xs" /></div>;
  return <div className="w-8 h-8 bg-orange-500/10 border border-orange-500/30 rounded-lg flex items-center justify-center shrink-0"><FaClock className="text-orange-400 text-xs" /></div>;
}

function payoutCaption(r: PayoutRow): { text: string; tone: "red" | "muted" | "emerald" } | null {
  if (r.payout_blocked_reason) return { text: r.payout_blocked_reason, tone: "red" };
  if (r.failure_reason) return { text: r.failure_reason, tone: "red" };
  if (r.status === "completed") return { text: "Completed successfully", tone: "emerald" };
  if (r.status === "pending" || r.status === "processing") return { text: "Bank processing", tone: "muted" };
  return null;
}

function formatAbsolute(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-NG", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
  } catch { return iso; }
}

function initials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

function buildPageList(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "…")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push("…");
  for (let p = start; p <= end; p++) pages.push(p);
  if (end < total - 1) pages.push("…");
  pages.push(total);
  return pages;
}

export function PayoutsTable({
  rows, loading, selected, onToggleSelect, onToggleSelectAll, onOpen,
  onRelease, onRetry, onUnblock, onOpenTransaction, releasingId,
  total, page = 1, limit = 50, onRefresh, onPageChange,
}: Props) {
  if (loading && rows.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-4 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      </div>
    );
  }
  const allEligible = rows.filter((r) => eligibleForRelease(r).ok);
  const allSelected = allEligible.length > 0 && allEligible.every((r) => selected.has(r.id));
  const totalCount = typeof total === "number" ? total : rows.length;
  const startIdx = totalCount === 0 ? 0 : (page - 1) * limit + 1;
  const endIdx = Math.min(page * limit, totalCount);
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));
  const pageList = buildPageList(page, totalPages);
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between p-4 sm:p-6 border-b border-border">
        <h3 className="text-base sm:text-lg font-semibold text-foreground">Payout Records</h3>
        <div className="flex items-center gap-3">
          <span className="text-xs sm:text-sm text-muted-foreground">{totalCount} payouts found</span>
          {onRefresh && (
            <Button size="sm" variant="outline" className="gap-2" onClick={onRefresh}>
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
          )}
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="p-10 text-center">
          <div className="text-sm font-medium text-foreground">No payouts found</div>
          <div className="mt-1 text-xs text-muted-foreground">There are no payouts for the selected filter.</div>
        </div>
      ) : (
      <>
      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-3 w-10"><Checkbox checked={allSelected} onCheckedChange={onToggleSelectAll} /></th>
            <th className="px-3 py-3 text-left">Payout ID</th>
            <th className="px-3 py-3 text-left">Seller</th>
            <th className="px-3 py-3 text-left">Transaction</th>
            <th className="px-3 py-3 text-right">Amount</th>
            <th className="px-3 py-3 text-left">Payout Account</th>
            <th className="px-3 py-3 text-left">Status</th>
            <th className="px-3 py-3 text-left">Initiated</th>
            <th className="px-3 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => {
            const e = eligibleForRelease(r);
            const caption = payoutCaption(r);
            return (
              <tr key={r.id} className="hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => onOpen(r)}>
                <td className="px-3 py-3" onClick={(ev) => ev.stopPropagation()}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Checkbox
                          disabled={!e.ok}
                          checked={selected.has(r.id)}
                          onCheckedChange={() => onToggleSelect(r.id)}
                        />
                      </span>
                    </TooltipTrigger>
                    {!e.ok && <TooltipContent>{e.reason}</TooltipContent>}
                  </Tooltip>
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-3">
                    <PayoutIdIcon row={r} />
                    <div className="min-w-0">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="font-mono text-xs text-foreground cursor-default truncate max-w-[160px]">{r.id.slice(0, 14)}…</div>
                        </TooltipTrigger>
                        <TooltipContent>{r.id}</TooltipContent>
                      </Tooltip>
                      {caption && (
                        <div className={`text-xs mt-0.5 truncate max-w-[160px] ${
                          caption.tone === "red" ? "text-red-400" : caption.tone === "emerald" ? "text-emerald-400" : "text-muted-foreground"
                        }`}>{caption.text}</div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar className="h-8 w-8 shrink-0">
                      {r.seller.avatar_url ? <AvatarImage src={r.seller.avatar_url} alt={r.seller.name} /> : null}
                      <AvatarFallback className="text-[10px] bg-muted text-muted-foreground">{initials(r.seller.name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="font-medium text-foreground truncate max-w-[160px]">{r.seller.name}</div>
                      <div className="text-xs text-muted-foreground truncate max-w-[160px]">{r.seller.email ?? "Seller"}</div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs text-foreground">{r.transaction.code}</span>
                    <button
                      type="button"
                      onClick={(ev) => { ev.stopPropagation(); onOpenTransaction(r); }}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="Open transaction"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="text-xs text-muted-foreground truncate max-w-[180px]">
                    {r.transaction.item_title ?? "No item snapshot"}
                  </div>
                </td>
                <td className="px-3 py-3 text-right">
                  <div className="font-semibold text-foreground">{formatMoney(r.amount, r.currency ?? "NGN")}</div>
                  <div className="text-xs text-muted-foreground">NGN</div>
                </td>
                <td className="px-3 py-3">
                  {r.payout_account && r.payout_account.verification_status === "verified" ? (
                    <>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-foreground truncate max-w-[140px]">{r.payout_account.bank_name ?? "—"}</span>
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          <CheckCircle2 className="h-2.5 w-2.5" /> VERIFIED
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">{r.payout_account.masked_account ?? "—"}</div>
                    </>
                  ) : r.payout_account ? (
                    <>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-foreground truncate max-w-[140px]">{r.payout_account.bank_name ?? "Account"}</span>
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/30">
                          <AlertTriangle className="h-2.5 w-2.5" /> INVALID
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">{r.payout_account.masked_account ?? "—"}</div>
                    </>
                  ) : (
                    <div className="text-xs text-red-400">No verified payout account</div>
                  )}
                </td>
                <td className="px-3 py-3"><PayoutStatusPill row={r} /></td>
                <td className="px-3 py-3 whitespace-nowrap" title={new Date(r.entered_queue_at).toLocaleString()}>
                  <div className="text-xs text-foreground">{formatAbsolute(r.entered_queue_at)}</div>
                  <div className="text-xs text-muted-foreground">{formatRelative(r.entered_queue_at)}</div>
                </td>
                <td className="px-3 py-3 text-right" onClick={(ev) => ev.stopPropagation()}>
                  <div className="flex items-center gap-2 justify-end">
                    {primaryCTA(r, releasingId,
                      () => onRelease(r), () => onRetry(r), () => onUnblock(r), () => onOpen(r))}
                    <Button size="sm" variant="outline" className="gap-1.5 hidden md:inline-flex" onClick={() => onOpen(r)}>
                      <Eye className="h-3.5 w-3.5" /> Details
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="ghost"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onOpen(r)}>View Details</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onOpenTransaction(r)}>Open Transaction</DropdownMenuItem>
                        {r.status === "failed" && r.retry_allowed && (
                          <DropdownMenuItem onClick={() => onRetry(r)}>Retry Payout</DropdownMenuItem>
                        )}
                        {r.release_blocked && <DropdownMenuItem onClick={() => onUnblock(r)}>Unblock Payout</DropdownMenuItem>}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 border-t border-border">
        <div className="text-xs text-muted-foreground">Showing {startIdx}-{endIdx} of {totalCount} payouts</div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPageChange?.(page - 1)} aria-label="Previous page">
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          {pageList.map((p, i) =>
            p === "…" ? (
              <span key={`e-${i}`} className="px-2 text-xs text-muted-foreground">…</span>
            ) : p === page ? (
              <Button key={p} size="sm" className="bg-emerald-500 hover:bg-emerald-600 text-white min-w-9">{p}</Button>
            ) : (
              <Button key={p} size="sm" variant="outline" className="min-w-9" onClick={() => onPageChange?.(p)}>{p}</Button>
            )
          )}
          <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => onPageChange?.(page + 1)} aria-label="Next page">
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      </>
      )}
    </div>
  );
}

export { eligibleForRelease };