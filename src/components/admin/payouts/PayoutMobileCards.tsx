import { Loader2, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatMoney } from "@/lib/format";
import { formatRelative } from "@/components/admin/dashboard/relative";
import { PayoutStatusPill } from "./PayoutStatusPill";
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
    return <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-32" />)}</div>;
  }
  if (rows.length === 0) {
    return <Card className="p-8 text-center text-sm text-muted-foreground">No payouts in this view.</Card>;
  }
  return (
    <div className="space-y-3">
      {rows.map((r) => {
        const e = eligibleForRelease(r);
        return (
          <Card key={r.id} className="p-4 space-y-3">
            <div className="flex items-start gap-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span><Checkbox disabled={!e.ok} checked={selected.has(r.id)} onCheckedChange={() => onToggleSelect(r.id)} /></span>
                </TooltipTrigger>
                {!e.ok && <TooltipContent>{e.reason}</TooltipContent>}
              </Tooltip>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-mono text-xs text-muted-foreground truncate">{r.id.slice(0, 10)}…</div>
                  <PayoutStatusPill row={r} />
                </div>
                <div className="mt-1 font-medium text-foreground truncate">{r.seller.name}</div>
                <div className="text-xs text-muted-foreground">{r.payout_account?.bank_name ?? "—"} {r.payout_account?.masked_account ?? ""}</div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-bold text-foreground">{formatMoney(r.amount, r.currency)}</div>
                <div className="text-xs text-muted-foreground font-mono">{r.transaction.code}</div>
              </div>
              <div className="text-xs text-muted-foreground whitespace-nowrap">{formatRelative(r.entered_queue_at)}</div>
            </div>
            {r.transaction.item_title && (
              <div className="text-xs text-muted-foreground truncate">{r.transaction.item_title}</div>
            )}
            {(r.payout_blocked_reason || r.failure_reason) && (
              <div className="text-xs text-red-400 truncate">{r.payout_blocked_reason ?? r.failure_reason}</div>
            )}
            <div className="flex items-center gap-2">
              {r.release_blocked ? (
                <Button size="sm" className="flex-1" variant="outline" onClick={() => onUnblock(r)}>Unblock</Button>
              ) : r.status === "failed" && r.retry_allowed ? (
                <Button size="sm" className="flex-1" variant="outline" onClick={() => onRetry(r)}>Retry</Button>
              ) : r.status === "awaiting_release" ? (
                <Button size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={!e.ok || releasingId === r.id}
                  onClick={() => onRelease(r)}>
                  {releasingId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Release"}
                </Button>
              ) : null}
              <Button size="sm" variant="outline" className="flex-1" onClick={() => onOpen(r)}>View</Button>
              <Button size="sm" variant="ghost" onClick={() => onOpen(r)}><MoreHorizontal className="h-4 w-4" /></Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}