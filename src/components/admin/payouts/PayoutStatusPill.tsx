import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PayoutRow } from "@/services/admin-payouts.service";

type PillSource = { status: string; release_blocked?: boolean; transaction?: PayoutRow["transaction"] };

export function payoutPillFor(row: PillSource): { label: string; cls: string } {
  if (row.release_blocked) return { label: "Blocked", cls: "bg-red-500/15 text-red-400 border-red-500/30" };
  if (row.transaction?.needs_release_review) return { label: "On Hold", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" };
  switch (row.status) {
    case "awaiting_release": return { label: "Pending Release", cls: "bg-orange-500/15 text-orange-400 border-orange-500/30" };
    case "pending":
    case "processing": return { label: "Processing", cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" };
    case "completed": return { label: "Released", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" };
    case "failed": return { label: "Failed", cls: "bg-red-500/15 text-red-400 border-red-500/30" };
    case "reversed": return { label: "Reversed", cls: "bg-purple-500/15 text-purple-400 border-purple-500/30" };
    case "blocked": return { label: "Blocked", cls: "bg-red-500/15 text-red-400 border-red-500/30" };
    case "cancelled": return { label: "Cancelled", cls: "bg-muted text-muted-foreground border-border" };
    default: return { label: row.status, cls: "bg-muted text-muted-foreground border-border" };
  }
}

export function PayoutStatusPill({ row, className }: { row: PillSource; className?: string }) {
  const p = payoutPillFor(row);
  return <Badge variant="outline" className={cn("text-xs font-medium whitespace-nowrap", p.cls, className)}>{p.label}</Badge>;
}