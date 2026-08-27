import { Loader2 } from "lucide-react";
import {
  FaArrowsRotate, FaTriangleExclamation, FaCheck, FaClock, FaBan,
  FaEye, FaRotateRight, FaEllipsisVertical, FaChevronLeft, FaChevronRight,
  FaArrowUpRightFromSquare, FaXmark, FaCircleInfo, FaPenToSquare, FaUser,
  FaReceipt, FaNoteSticky, FaPause, FaDownload, FaCircleCheck,
} from "react-icons/fa6";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { resolveClaim } from "@/lib/trust/trust-claims";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatMoney } from "@/lib/format";
import { formatRelative } from "@/components/admin/dashboard/relative";
import { PayoutStatusPill } from "./PayoutStatusPill";
import type { PayoutRow } from "@/services/admin-payouts.service";
import { getPayoutCaptionFromRow, getAccountPresentation } from "@/lib/payout-presentation";
import { keyActivate } from "@/lib/a11y";
import { ADMIN_TONE, ADMIN_SOLID, ADMIN_GROUND } from "@/components/admin/palette";

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
  onOpenSeller: (row: PayoutRow) => void;
  onUpdateBank: (row: PayoutRow) => void;
  onDownloadReceipt: (row: PayoutRow) => void;
  onAddNote: (row: PayoutRow) => void;
  onBlock: (row: PayoutRow) => void;
  onPause: (row: PayoutRow) => void;
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
  const ds = r.transaction.dispute_status;
  if (ds && ds !== "resolved" && ds !== "none") return { ok: false, reason: "Active dispute" };
  if (r.transaction.needs_release_review) return { ok: false, reason: "Needs admin review" };
  if (r.transaction.refund_in_flight) return { ok: false, reason: "Refund in flight" };
  if (r.payout_account?.verification_status !== "verified") return { ok: false, reason: "Payout account not verified" };
  if (!r.payout_account?.has_recipient_code) return { ok: false, reason: "Missing provider recipient code" };
  return { ok: true };
}

const emeraldBtn = `px-3 py-1.5 ${ADMIN_SOLID.success} rounded-lg transition-all flex items-center justify-center gap-2 text-xs font-semibold whitespace-nowrap min-h-11 min-w-11 disabled:opacity-50 disabled:cursor-not-allowed`;
const slateBtn = `px-3 py-1.5 ${ADMIN_GROUND.raised} ${ADMIN_GROUND.raisedHover} ${ADMIN_GROUND.body} rounded-lg transition-all flex items-center justify-center gap-2 text-xs font-medium whitespace-nowrap min-h-11 min-w-11`;

const iconSquareBtn = `w-11 h-11 ${ADMIN_GROUND.raised} ${ADMIN_GROUND.raisedHover} rounded-lg flex items-center justify-center ${ADMIN_GROUND.body} hover:text-white transition-all`;

function renderPrimaryActions(
  r: PayoutRow, releasingId: string | null,
  onRelease: () => void, onRetry: () => void, onUnblock: () => void, onOpen: () => void,
) {
  const isReleasing = releasingId === r.id;
  const detailsBtn = (
    <button onClick={onOpen} className={slateBtn}>
      <FaEye className="text-xs" /> Details
    </button>
  );

  if (r.release_blocked) {
    return <>
      <button onClick={onUnblock} className={slateBtn}><FaBan className="text-xs" />Unblock</button>
      {detailsBtn}
    </>;
  }
  if (r.status === "failed") {
    return <>
      {r.retry_allowed && (
        <button onClick={onRetry} className={emeraldBtn}><FaRotateRight className="text-xs" />Retry</button>
      )}
      {detailsBtn}
    </>;
  }
  if (r.status === "pending" || r.status === "processing") {
    return (
      <button onClick={onOpen} className={slateBtn}><FaEye className="text-xs" />View</button>
    );
  }
  if (r.status === "completed") {
    return (
      <button onClick={onOpen} className={iconSquareBtn} aria-label="View details">
        <FaEye className="text-xs" />
      </button>
    );
  }
  if (r.status === "awaiting_release") {
    const e = eligibleForRelease(r);
    const releaseBtn = (
      <button disabled={!e.ok || isReleasing} onClick={onRelease} className={emeraldBtn}>
        {isReleasing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><FaCheck className="text-xs" />Release</>}
      </button>
    );
    return <>
      {e.ok ? releaseBtn : (
        <Tooltip>
          <TooltipTrigger asChild><span tabIndex={0}>{releaseBtn}</span></TooltipTrigger>
          <TooltipContent>{e.reason}</TooltipContent>
        </Tooltip>
      )}
      {detailsBtn}
    </>;
  }
  return <>
    <button onClick={onOpen} className={slateBtn}><FaEye className="text-xs" />View</button>
    {detailsBtn}
  </>;
}

function PayoutIdIcon({ row }: { row: PayoutRow }) {
  if (row.release_blocked) return <div className={`w-8 h-8 ${ADMIN_TONE.danger.panel} border rounded-lg flex items-center justify-center shrink-0`}><FaBan className={`${ADMIN_TONE.danger.text} text-xs`} /></div>;
  if (row.status === "failed") return <div className={`w-8 h-8 ${ADMIN_TONE.danger.panel} border rounded-lg flex items-center justify-center shrink-0`}><FaTriangleExclamation className={`${ADMIN_TONE.danger.text} text-xs`} /></div>;
  if (row.status === "completed") return <div className={`w-8 h-8 ${ADMIN_TONE.success.panel} border rounded-lg flex items-center justify-center shrink-0`}><FaCheck className={`${ADMIN_TONE.success.text} text-xs`} /></div>;
  if (row.status === "pending" || row.status === "processing") return <div className={`w-8 h-8 ${ADMIN_TONE.info.panel} border rounded-lg flex items-center justify-center shrink-0`}><FaArrowsRotate className={`${ADMIN_TONE.info.text} text-xs`} /></div>;
  return <div className={`w-8 h-8 ${ADMIN_TONE.elevated.panel} border rounded-lg flex items-center justify-center shrink-0`}><FaClock className={`${ADMIN_TONE.elevated.text} text-xs`} /></div>;
}

function payoutCaption(r: PayoutRow) {
  return getPayoutCaptionFromRow(r);
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

function friendlyPayoutId(r: PayoutRow): string {
  const year = (() => {
    try { return new Date(r.entered_queue_at).getFullYear(); } catch { return new Date().getFullYear(); }
  })();
  const tail = (r.id ?? "").replace(/-/g, "").slice(-6).toUpperCase();
  return `PAY-${year}-${tail || "000000"}`;
}

function sellerTierLabel(r: PayoutRow): string {
  const s = r.seller as unknown as { tier_label?: string; identity_verified?: boolean };
  if (s?.tier_label) return s.tier_label;
  return resolveClaim("SELLER_VERIFIED", { identityVerified: s?.identity_verified }) ?? "Seller";
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

function RowMenu({
  row, onOpen, onOpenTransaction, onRetry, onUnblock,
  onOpenSeller, onUpdateBank, onDownloadReceipt, onAddNote, onBlock, onPause,
}: {
  row: PayoutRow;
  onOpen: () => void;
  onOpenTransaction: () => void;
  onRetry: () => void;
  onUnblock: () => void;
  onOpenSeller: () => void;
  onUpdateBank: () => void;
  onDownloadReceipt: () => void;
  onAddNote: () => void;
  onBlock: () => void;
  onPause: () => void;
}) {
  const itemCls = "gap-2.5 cursor-pointer";
  const seller = (
    <DropdownMenuItem className={itemCls} onClick={onOpenSeller}>
      <FaUser className={ADMIN_TONE.info.text} /> View Seller Profile
    </DropdownMenuItem>
  );
  const tx = (
    <DropdownMenuItem className={itemCls} onClick={onOpenTransaction}>
      <FaReceipt className={ADMIN_TONE.info.text} /> View Transaction
    </DropdownMenuItem>
  );
  const note = (
    <DropdownMenuItem className={itemCls} onClick={onAddNote}>
      <FaNoteSticky className={ADMIN_TONE.warning.text} /> Add Internal Note
    </DropdownMenuItem>
  );
  const block = (
    <DropdownMenuItem className={`${itemCls} text-red-400 focus:text-red-400`} onClick={onBlock}>
      <FaBan className={ADMIN_TONE.danger.text} /> Block Payout
    </DropdownMenuItem>
  );

  if (row.release_blocked) {
    return (
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem className={itemCls} onClick={onOpen}>
          <FaCircleInfo className={ADMIN_TONE.info.text} /> View Block Reason
        </DropdownMenuItem>
        <DropdownMenuItem className={itemCls} onClick={onUnblock}>
          <FaCheck className={ADMIN_TONE.success.text} /> Unblock Payout
        </DropdownMenuItem>
        {seller}
        {tx}
        <DropdownMenuSeparator />
        {note}
      </DropdownMenuContent>
    );
  }

  if (row.status === "failed") {
    const rowCls = `px-4 py-2.5 text-xs ${ADMIN_GROUND.body} hover:bg-slate-700 focus:bg-slate-700 focus:text-slate-300 flex items-center gap-3 cursor-pointer rounded-none min-h-11`;
    const iconSlot = "w-4 flex justify-center";
    return (
      <DropdownMenuContent
        align="end"
        className={`w-56 !bg-slate-800 border ${ADMIN_GROUND.borderSoft} rounded-lg shadow-xl py-2 px-0`}
      >
        <DropdownMenuItem className={rowCls} onClick={onOpen}>
          <span className={iconSlot}><FaCircleInfo className={ADMIN_TONE.info.text} /></span>
          <span>View Failure Details</span>
        </DropdownMenuItem>
        <DropdownMenuItem className={rowCls} onClick={onUpdateBank}>
          <span className={iconSlot}><FaPenToSquare className="text-pink-400" /></span>
          <span>Update Bank Account</span>
        </DropdownMenuItem>
        <DropdownMenuItem className={rowCls} onClick={onOpenSeller}>
          <span className={iconSlot}><FaUser className="text-pink-400" /></span>
          <span>View Seller Profile</span>
        </DropdownMenuItem>
        <DropdownMenuItem className={rowCls} onClick={onOpenTransaction}>
          <span className={iconSlot}><FaReceipt className={ADMIN_TONE.info.text} /></span>
          <span>View Transaction</span>
        </DropdownMenuItem>
        <div className={`border-t ${ADMIN_GROUND.borderSoft} my-2`} />
        <DropdownMenuItem className={rowCls} onClick={onAddNote}>
          <span className={iconSlot}><FaNoteSticky className={ADMIN_TONE.warning.text} /></span>
          <span>Add Internal Note</span>
        </DropdownMenuItem>
        <DropdownMenuItem className={`${rowCls} text-red-400 focus:text-red-400 min-h-11`} onClick={onBlock}>
          <span className={iconSlot}><FaBan className={ADMIN_TONE.danger.text} /></span>
          <span>Block Payout</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    );
  }

  if (row.status === "pending" || row.status === "processing") {
    const rowCls = `px-4 py-2.5 text-xs ${ADMIN_GROUND.body} hover:bg-slate-700 focus:bg-slate-700 focus:text-slate-300 flex items-center gap-3 cursor-pointer rounded-none min-h-11`;
    const iconSlot = "w-4 flex justify-center";
    return (
      <DropdownMenuContent
        align="end"
        className={`w-56 !bg-slate-800 border ${ADMIN_GROUND.borderSoft} rounded-lg shadow-xl py-2 px-0`}
      >
        <DropdownMenuItem className={rowCls} onClick={onOpen}>
          <span className={iconSlot}><FaCircleInfo className={ADMIN_TONE.info.text} /></span>
          <span>View Processing Status</span>
        </DropdownMenuItem>
        <DropdownMenuItem className={rowCls} onClick={onOpenSeller}>
          <span className={iconSlot}><FaUser className="text-pink-400" /></span>
          <span>View Seller Profile</span>
        </DropdownMenuItem>
        <DropdownMenuItem className={rowCls} onClick={onOpenTransaction}>
          <span className={iconSlot}><FaReceipt className={ADMIN_TONE.info.text} /></span>
          <span>View Transaction Details</span>
        </DropdownMenuItem>
        <div className={`border-t ${ADMIN_GROUND.borderSoft} my-2`} />
        <DropdownMenuItem className={rowCls} onClick={onAddNote}>
          <span className={iconSlot}><FaNoteSticky className={ADMIN_TONE.warning.text} /></span>
          <span>Add Internal Note</span>
        </DropdownMenuItem>
        <DropdownMenuItem className={`${rowCls} text-orange-400 focus:text-orange-400 min-h-11`} onClick={onPause}>
          <span className={iconSlot}><FaPause className={ADMIN_TONE.elevated.text} /></span>
          <span>Pause Payout</span>
        </DropdownMenuItem>
        <DropdownMenuItem className={`${rowCls} text-red-400 focus:text-red-400 min-h-11`} onClick={onBlock}>
          <span className={iconSlot}><FaBan className={ADMIN_TONE.danger.text} /></span>
          <span>Block Payout</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    );
  }

  if (row.status === "completed") {
    return (
      <DropdownMenuContent
        align="end"
        className={`w-56 !bg-slate-800 border ${ADMIN_GROUND.borderSoft} rounded-lg shadow-xl py-2 px-0`}
      >
        <DropdownMenuItem onClick={onOpen} className={`px-4 py-2.5 text-xs ${ADMIN_GROUND.body} hover:bg-slate-700 focus:bg-slate-700 focus:text-slate-300 flex items-center gap-3 cursor-pointer rounded-none min-h-11`}>
          <span className={`w-4 flex justify-center ${ADMIN_GROUND.body}`}><FaCircleCheck /></span>
          <span>View Completion Details</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onOpenSeller} className={`px-4 py-2.5 text-xs ${ADMIN_GROUND.body} hover:bg-slate-700 focus:bg-slate-700 focus:text-slate-300 flex items-center gap-3 cursor-pointer rounded-none min-h-11`}>
          <span className={`w-4 flex justify-center ${ADMIN_GROUND.body}`}><FaUser /></span>
          <span>View Seller Profile</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onOpenTransaction} className={`px-4 py-2.5 text-xs ${ADMIN_GROUND.body} hover:bg-slate-700 focus:bg-slate-700 focus:text-slate-300 flex items-center gap-3 cursor-pointer rounded-none min-h-11`}>
          <span className={`w-4 flex justify-center ${ADMIN_GROUND.body}`}><FaReceipt /></span>
          <span>View Transaction</span>
        </DropdownMenuItem>
        <div className={`border-t ${ADMIN_GROUND.borderSoft} my-2`} />
        <DropdownMenuItem onClick={onDownloadReceipt} className={`px-4 py-2.5 text-xs ${ADMIN_GROUND.body} hover:bg-slate-700 focus:bg-slate-700 focus:text-slate-300 flex items-center gap-3 cursor-pointer rounded-none min-h-11`}>
          <span className={`w-4 flex justify-center ${ADMIN_GROUND.body}`}><FaDownload /></span>
          <span>Download Receipt</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onAddNote} className={`px-4 py-2.5 text-xs ${ADMIN_GROUND.body} hover:bg-slate-700 focus:bg-slate-700 focus:text-slate-300 flex items-center gap-3 cursor-pointer rounded-none min-h-11`}>
          <span className={`w-4 flex justify-center ${ADMIN_GROUND.body}`}><FaNoteSticky /></span>
          <span>Add Internal Note</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    );
  }

  // default: awaiting_release, on_hold, reversed, cancelled
  return (
    <DropdownMenuContent align="end" className="w-56">
      <DropdownMenuItem className={itemCls} onClick={onOpen}>
        <FaCircleInfo className={ADMIN_TONE.info.text} /> View Details
      </DropdownMenuItem>
      {seller}
      {tx}
      <DropdownMenuSeparator />
      {note}
    </DropdownMenuContent>
  );
}

export function PayoutsTable({
  rows, loading, selected, onToggleSelect, onToggleSelectAll, onOpen,
  onRelease, onRetry, onUnblock, onOpenTransaction, releasingId,
  onOpenSeller, onUpdateBank, onDownloadReceipt, onAddNote, onBlock, onPause,
  total, page = 1, limit = 50, onRefresh, onPageChange,
}: Props) {
  if (loading && rows.length === 0) {
    return (
      <div className={`${ADMIN_GROUND.panel} border rounded-xl overflow-hidden`}>
        <div className="p-4 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className={`h-14 w-full ${ADMIN_GROUND.raised}`} />)}
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
  // Top reasons block to explain why some/all rows can't be batch-released
  const reasonCounts = new Map<string, number>();
  for (const r of rows) {
    const e = eligibleForRelease(r);
    if (!e.ok && e.reason) reasonCounts.set(e.reason, (reasonCounts.get(e.reason) ?? 0) + 1);
  }
  const topReasons = Array.from(reasonCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3);
  return (
    <div className={`${ADMIN_GROUND.panel} border rounded-xl overflow-hidden`}>
      <div className={`p-6 border-b ${ADMIN_GROUND.border}`}>
        <div className="flex items-center justify-between">
          <h3 className={`${ADMIN_GROUND.heading} text-lg font-semibold`}>Payout Records</h3>
          <div className="flex items-center gap-3">
            <span className={`${ADMIN_GROUND.muted} text-sm`}>{totalCount} payouts found</span>
            {onRefresh && (
              <button onClick={onRefresh} className={`px-3 py-1.5 ${ADMIN_GROUND.raised} ${ADMIN_GROUND.body} rounded text-sm ${ADMIN_GROUND.raisedHover} transition-all flex items-center gap-1.5 min-h-11`}>
                <FaArrowsRotate className="text-xs" /> Refresh
              </button>
            )}
          </div>
        </div>
        {rows.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className={`font-medium ${ADMIN_GROUND.body}`}>
              {allEligible.length} of {rows.length} eligible for batch release
            </span>
            {topReasons.length > 0 && (
              <span className={ADMIN_GROUND.muted}>
               : {topReasons.map(([reason, n]) => `${n} ${reason.toLowerCase()}`).join(", ")}
              </span>
            )}
          </div>
        )}
      </div>
      {rows.length === 0 ? (
        <div className="p-10 text-center">
          <div className={`text-sm font-medium ${ADMIN_GROUND.heading}`}>No payouts found</div>
          <div className={`mt-1 text-xs ${ADMIN_GROUND.muted}`}>There are no payouts for the selected filter.</div>
        </div>
      ) : (
      <>
      <div className="overflow-x-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
      <table className="w-full min-w-[1200px] sd-stack">
        <thead>
          <tr className={`${ADMIN_GROUND.raised} border-b ${ADMIN_GROUND.borderSoft}`}>
            <th className="text-left p-4"><Checkbox checked={allSelected} onCheckedChange={onToggleSelectAll} /></th>
            <th className={`text-left p-4 ${ADMIN_GROUND.muted} font-medium text-xs uppercase tracking-wider`}>Payout ID</th>
            <th className={`text-left p-4 ${ADMIN_GROUND.muted} font-medium text-xs uppercase tracking-wider`}>Seller</th>
            <th className={`text-left p-4 ${ADMIN_GROUND.muted} font-medium text-xs uppercase tracking-wider`}>Transaction</th>
            <th className={`text-left p-4 ${ADMIN_GROUND.muted} font-medium text-xs uppercase tracking-wider`}>Amount</th>
            <th className={`text-left p-4 ${ADMIN_GROUND.muted} font-medium text-xs uppercase tracking-wider`}>Payout Account</th>
            <th className={`text-left p-4 ${ADMIN_GROUND.muted} font-medium text-xs uppercase tracking-wider`}>Status</th>
            <th className={`text-left p-4 ${ADMIN_GROUND.muted} font-medium text-xs uppercase tracking-wider`}>Initiated</th>
            <th className={`text-left p-4 ${ADMIN_GROUND.muted} font-medium text-xs uppercase tracking-wider`}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const e = eligibleForRelease(r);
            const caption = payoutCaption(r);
            return (
              <tr role="button" tabIndex={0} onKeyDown={keyActivate} key={r.id} className={`border-b ${ADMIN_GROUND.border} hover:bg-slate-800/50 transition-all cursor-pointer`} onClick={() => onOpen(r)}>
                <td role="button" tabIndex={0} onKeyDown={keyActivate} className="p-4" onClick={(ev) => ev.stopPropagation()}>
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
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <PayoutIdIcon row={r} />
                    <div>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className={`${ADMIN_GROUND.heading} font-medium text-sm cursor-default whitespace-nowrap`}>{friendlyPayoutId(r)}</div>
                        </TooltipTrigger>
                        <TooltipContent>{r.id}</TooltipContent>
                      </Tooltip>
                      {caption && (
                        <div className={`text-xs font-medium mt-0.5 whitespace-nowrap ${
                          caption.tone === "red" ? "text-red-400" : caption.tone === "emerald" ? "text-emerald-400" : "text-blue-400"
                        }`}>{caption.text}</div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="p-4">
                  <div className="flex items-center gap-2.5">
                    <Avatar className="h-8 w-8 shrink-0 rounded-full">
                      {r.seller.avatar_url ? <AvatarImage src={r.seller.avatar_url} alt={r.seller.name} /> : null}
                      <AvatarFallback className={`text-xs ${ADMIN_GROUND.raised} ${ADMIN_GROUND.body}`}>{initials(r.seller.name)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className={`${ADMIN_GROUND.heading} font-medium text-sm whitespace-nowrap`}>{r.seller.name}</div>
                      <div className={`${ADMIN_GROUND.muted} text-xs whitespace-nowrap`}>{sellerTierLabel(r)}</div>
                    </div>
                  </div>
                </td>
                <td className="p-4">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(ev) => { ev.stopPropagation(); onOpenTransaction(r); }}
                      className="text-slate-300 hover:text-emerald-400 transition-all font-medium text-sm whitespace-nowrap min-h-11 inline-flex items-center"
                    >
                      {r.transaction.code}
                    </button>
                    <FaArrowUpRightFromSquare className={`${ADMIN_GROUND.faint} text-xs shrink-0`} />
                  </div>
                  <p className={`${ADMIN_GROUND.muted} text-xs whitespace-nowrap`}>
                    {r.transaction.item_title ?? "No item snapshot"}
                  </p>
                </td>
                <td className="p-4">
                  <p className={`${ADMIN_GROUND.heading} font-semibold text-sm`}>{formatMoney(r.amount, r.currency ?? "NGN")}</p>
                  <p className={`${ADMIN_GROUND.muted} text-xs`}>NGN</p>
                </td>
                <td className="p-4">
                  {(() => {
                    const ap = getAccountPresentation(r.payout_account);
                    const terminal = r.status === "completed" || r.status === "reversed" || r.status === "cancelled";
                    if (ap.state === "no_account") {
                      if (terminal) {
                        return <p className={`${ADMIN_GROUND.muted} text-xs`}>—</p>;
                      }
                      return (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-700/40 border border-slate-600/40 text-slate-300 rounded text-xs font-medium">
                          Seller bank not set up
                        </span>
                      );
                    }
                    if (ap.state === "verified_ready") {
                      return (
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <p className={`${ADMIN_GROUND.body} text-sm font-medium whitespace-nowrap`}>{r.payout_account!.bank_name ?? "—"}</p>
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded text-xs font-bold shrink-0">
                              <FaCheck className="text-xs" /> VERIFIED
                            </span>
                          </div>
                          <p className={`${ADMIN_GROUND.muted} text-xs whitespace-nowrap`}>{r.payout_account!.masked_account ?? "—"}</p>
                        </div>
                      );
                    }
                    // Terminal payouts: account state is no longer actionable. Hide warning badge
                    if (terminal) {
                      return (
                        <div>
                          <p className={`${ADMIN_GROUND.body} text-sm font-medium whitespace-nowrap`}>{r.payout_account?.bank_name ?? "Account"}</p>
                          <p className={`${ADMIN_GROUND.muted} text-xs whitespace-nowrap`}>{r.payout_account?.masked_account ?? "—"}</p>
                        </div>
                      );
                    }
                    const badgeTone =
                      ap.state === "verified_no_recipient"
                        ? "bg-red-500/20 border-red-500/30 text-red-400"
                        : "bg-amber-500/20 border-amber-500/30 text-amber-400";
                    const badgeText = ap.state === "verified_no_recipient" ? "RECIPIENT MISSING" : "UNVERIFIED";
                    return (
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <p className={`${ADMIN_GROUND.body} text-sm font-medium whitespace-nowrap`}>{r.payout_account?.bank_name ?? "Account"}</p>
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 ${badgeTone} border rounded text-xs font-bold shrink-0`}>
                            <FaXmark className="text-xs" /> {badgeText}
                          </span>
                        </div>
                        <p className={`${ADMIN_GROUND.muted} text-xs whitespace-nowrap`}>{r.payout_account?.masked_account ?? ap.tableLabel}</p>
                      </div>
                    );
                  })()}
                </td>
                <td className="p-4"><PayoutStatusPill row={r} /></td>
                <td className="p-4 whitespace-nowrap" title={new Date(r.entered_queue_at).toLocaleString()}>
                  <p className="text-slate-300 text-sm">{formatAbsolute(r.entered_queue_at)}</p>
                  <p className={`${ADMIN_GROUND.muted} text-xs`}>{formatRelative(r.entered_queue_at)}</p>
                </td>
                <td role="button" tabIndex={0} onKeyDown={keyActivate} className="p-4" onClick={(ev) => ev.stopPropagation()}>
                  <div className="flex items-center gap-2">
                    {renderPrimaryActions(r, releasingId,
                      () => onRelease(r), () => onRetry(r), () => onUnblock(r), () => onOpen(r))}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="w-11 h-11 bg-slate-800 hover:bg-slate-700 rounded-lg flex items-center justify-center text-slate-300 hover:text-white transition-all">
                          <FaEllipsisVertical className="text-xs" />
                        </button>
                      </DropdownMenuTrigger>
                      <RowMenu
                        row={r}
                        onOpen={() => onOpen(r)}
                        onOpenTransaction={() => onOpenTransaction(r)}
                        onRetry={() => onRetry(r)}
                        onUnblock={() => onUnblock(r)}
                        onOpenSeller={() => onOpenSeller(r)}
                        onUpdateBank={() => onUpdateBank(r)}
                        onDownloadReceipt={() => onDownloadReceipt(r)}
                        onAddNote={() => onAddNote(r)}
                        onBlock={() => onBlock(r)}
                        onPause={() => onPause(r)}
                      />
                    </DropdownMenu>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 border-t border-slate-800">
        <div className={`${ADMIN_GROUND.muted} text-xs`}>Showing {startIdx}-{endIdx} of {totalCount} payouts</div>
        <div className="flex items-center gap-1">
          <button disabled={page <= 1} onClick={() => onPageChange?.(page - 1)} aria-label="Previous page"
            className="w-9 h-9 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-all relative before:absolute before:-inset-2 before:content-['']">
            <FaChevronLeft className="text-xs" />
          </button>
          {pageList.map((p, i) =>
            p === "…" ? (
              <span key={`e-${i}`} className="px-2 text-xs text-slate-400">…</span>
            ) : p === page ? (
              /* Current page indicator: static, not a control. */
              <span key={p} className="w-9 h-9 inline-flex items-center justify-center bg-emerald-700 text-white rounded-lg font-semibold text-sm">{p}</span>
            ) : (
              <button key={p} onClick={() => onPageChange?.(p)} className="w-9 h-9 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-all relative before:absolute before:-inset-2 before:content-['']">{p}</button>
            )
          )}
          <button disabled={page >= totalPages} onClick={() => onPageChange?.(page + 1)} aria-label="Next page"
            className="w-9 h-9 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-all relative before:absolute before:-inset-2 before:content-['']">
            <FaChevronRight className="text-xs" />
          </button>
        </div>
      </div>
      </>
      )}
    </div>
  );
}

export { eligibleForRelease };