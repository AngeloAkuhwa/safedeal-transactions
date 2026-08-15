import { Loader2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatMoney } from "@/lib/format";
import { formatRelative } from "@/components/admin/dashboard/relative";
import { PayoutStatusPill, payoutPillFor } from "./PayoutStatusPill";
import { eligibleForRelease } from "./PayoutsTable";
import type { PayoutRow } from "@/services/admin-payouts.service";

interface Props {
  rows: PayoutRow[];
  loading: boolean;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onOpen: (row: PayoutRow) => void;
  onRelease: (row: PayoutRow) => void;
  onRetry: (row: PayoutRow) => void;
  onUnblock: (row: PayoutRow) => void;
  releasingId: string | null;
}

export function PayoutMobileCards({ rows, loading, selected, onToggleSelect, onOpen, onRelease, onRetry, onUnblock, releasingId }: Props) {
  if (loading && rows.length === 0) {
    return <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-xl" />)}</div>;
  }
  if (rows.length === 0) {
    return (
      <Card className="p-8 text-center">
        <div className="text-sm font-medium text-foreground">No payouts found</div>
        <div className="mt-1 text-xs text-muted-foreground">There are no payouts for the selected filter.</div>
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      {rows.map((r) => {
        const e = eligibleForRelease(r);
        const pill = payoutPillFor(r);
        const PillIcon = pill.Icon;
        // Status-icon square color from the pill class (matches reference)
        const iconSquareCls = pill.cls.replace(/text-\S+/, "").trim();
        const verified = r.payout_account?.verification_status === "verified";
        const acctLabel = r.payout_account
          ? `${r.payout_account.bank_name ?? "Bank"} ${r.payout_account.masked_account ?? ""}`.trim()
          : "No account";
        const reason = r.payout_blocked_reason || r.failure_reason || pill.label;
        const sellerInitials = (r.seller.name || "?")
          .split(" ").map((s) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
        return (
          <Card key={r.id} className="bg-slate-900 border-slate-800 p-4 space-y-3">
            {/* Row 1: checkbox + status-icon square + code/reason + status pill */}
            <div className="flex items-start gap-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="mt-1"><Checkbox disabled={!e.ok} checked={selected.has(r.id)} onCheckedChange={() => onToggleSelect(r.id)} /></span>
                </TooltipTrigger>
                {!e.ok && <TooltipContent>{e.reason}</TooltipContent>}
              </Tooltip>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-8 h-8 rounded-lg border flex items-center justify-center flex-shrink-0 ${iconSquareCls}`}>
                      <PillIcon className={`h-3.5 w-3.5 ${pill.cls.match(/text-\S+/)?.[0] ?? ""}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-white font-semibold text-xs font-mono truncate">{r.transaction.code || r.id.slice(0, 10)}</p>
                      <p className={`text-xs truncate ${pill.cls.match(/text-\S+/)?.[0] ?? "text-slate-400"}`}>{reason}</p>
                    </div>
                  </div>
                  <PayoutStatusPill row={r} className="flex-shrink-0" />
                </div>

                {/* Row 2: seller */}
                <div className="flex items-center gap-2 mt-3">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={(r.seller as any).avatar_url ?? undefined} alt={r.seller.name} />
                    <AvatarFallback className="text-[10px]">{sellerInitials}</AvatarFallback>
                  </Avatar>
                  <span className="text-slate-300 text-xs font-medium truncate">{r.seller.name}</span>
                </div>

                {/* Row 3: amount + bank */}
                <div className="flex items-center justify-between gap-2 mt-3">
                  <div className="min-w-0">
                    <p className="text-white font-bold text-base">{formatMoney(r.amount, r.currency ?? "NGN")}</p>
                    <p className="text-slate-400 text-xs truncate">
                      {r.transaction.code}
                      {r.transaction.item_title ? ` • ${r.transaction.item_title}` : ""}
                    </p>
                  </div>
                  <div className="text-right min-w-0">
                    <p className="text-slate-400 text-xs truncate">{acctLabel}</p>
                    {verified ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded text-[10px] font-bold">VERIFIED</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-red-500/20 border border-red-500/30 text-red-400 rounded text-[10px] font-bold">UNVERIFIED</span>
                    )}
                  </div>
                </div>

                {/* Row 4: timestamp + actions */}
                <div className="flex items-center justify-between gap-2 mt-3">
                  <p className="text-slate-500 text-xs truncate">{formatRelative(r.entered_queue_at)}</p>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {r.release_blocked ? (
                      <Button size="sm" variant="outline" className="h-11 px-3 text-xs" onClick={() => onUnblock(r)}>Unblock</Button>
                    ) : r.status === "failed" && r.retry_allowed ? (
                      <Button size="sm" variant="outline" className="h-11 px-3 text-xs" onClick={() => onRetry(r)}>Retry</Button>
                    ) : r.status === "awaiting_release" ? (
                      <Button size="sm" className="h-11 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                        disabled={!e.ok || releasingId === r.id}
                        onClick={() => onRelease(r)}>
                        {releasingId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Release"}
                      </Button>
                    ) : null}
                    <Button size="sm" variant="outline" className="h-11 px-3 text-xs gap-1" onClick={() => onOpen(r)}>
                      <Eye className="h-3.5 w-3.5" /> View
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}