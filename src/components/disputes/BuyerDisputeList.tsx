import { List } from "lucide-react";
import { useNavigate } from "react-router";
import { format, formatDistanceToNow } from "date-fns";
import { formatMoney } from "@/lib/format";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { DisputeStatusBadge } from "./DisputeStatusBadge";
import { DisputeMoneyStatusBadge } from "./DisputeMoneyStatusBadge";
import type { BuyerDisputeItem } from "@/services/disputes.service";

interface BuyerDisputeListProps {
  items: BuyerDisputeItem[];
  isLoading?: boolean;
}

function formatDisputeRef(id: string): string {
  return `#DSP-${id.substring(0, 8).toUpperCase()}`;
}

function formatAmount(amount: number | null): string {
  if (amount === null || amount === undefined) return "—";
  return formatMoney(amount, "NGN");
}

export function BuyerDisputeList({ items, isLoading }: BuyerDisputeListProps) {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="sd-card overflow-hidden">
        <div className="px-3 py-2.5 border-b border-border">
          <div className="flex items-center gap-2">
            <Skeleton className="h-7 w-7 rounded-lg" />
            <Skeleton className="h-4 w-28" />
          </div>
        </div>
        <div className="p-3 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="sd-card overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 bg-destructive/10 rounded-lg flex items-center justify-center">
            <List className="h-3.5 w-3.5 text-destructive" />
          </div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">All Disputes</h2>
        </div>
      </div>

      <div className="divide-y divide-border md:hidden">
        {items.map((item) => {
          const openedDate = new Date(item.opened_at);
          return (
            <article key={item.id} className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground">{formatDisputeRef(item.id)}</p>
                  <p className="truncate text-sm font-semibold text-foreground">{item.item_title ?? "Untitled Item"}</p>
                  <p className="text-xs text-muted-foreground">{item.seller?.name ?? "Unknown seller"} · {format(openedDate, "MMM d, yyyy")}</p>
                </div>
                <p className="shrink-0 text-sm font-bold text-foreground">{formatAmount(item.buyer_total_amount)}</p>
              </div>
              <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">Reason:</span> {item.reason_label}</p>
              <div className="flex flex-wrap gap-2"><DisputeStatusBadge status={item.status} /><DisputeMoneyStatusBadge status={item.money_status} /></div>
              <Button variant={item.status === "resolved" ? "secondary" : "destructive"} className="min-h-11 w-full" onClick={() => navigate(item.primary_action.route)}>
                {item.status === "resolved" ? "View Resolution" : "View Dispute"}
              </Button>
            </article>
          );
        })}
      </div>
      <div className="hidden overflow-x-auto md:block">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="text-xs font-semibold uppercase tracking-wider">Dispute ID</TableHead>
            <TableHead className="text-xs font-semibold uppercase tracking-wider">Transaction</TableHead>
            <TableHead className="text-xs font-semibold uppercase tracking-wider">Item</TableHead>
            <TableHead className="text-xs font-semibold uppercase tracking-wider">Seller</TableHead>
            <TableHead className="text-xs font-semibold uppercase tracking-wider">Reason</TableHead>
            <TableHead className="text-xs font-semibold uppercase tracking-wider">Status</TableHead>
            <TableHead className="text-xs font-semibold uppercase tracking-wider">Money Status</TableHead>
            <TableHead className="text-xs font-semibold uppercase tracking-wider">Date Opened</TableHead>
            <TableHead className="text-xs font-semibold uppercase tracking-wider">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const openedDate = new Date(item.opened_at);
            const sellerInitials = item.seller?.name
              ?.split(" ")
              .map((n) => n[0])
              .join("")
              .slice(0, 2)
              .toUpperCase() ?? "?";

            return (
              <TableRow key={item.id} className="hover:bg-muted/50 transition-colors">
                {/* Dispute ID */}
                <TableCell className="whitespace-nowrap">
                  <span className="text-sm font-bold text-foreground">
                    {formatDisputeRef(item.id)}
                  </span>
                </TableCell>

                {/* Transaction */}
                <TableCell className="whitespace-nowrap">
                  <div className="text-sm font-bold text-primary">
                    {item.transaction_code ? `#${item.transaction_code}` : "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {format(openedDate, "MMM d, yyyy")}
                  </div>
                </TableCell>

                {/* Item */}
                <TableCell>
                  <div className="text-sm font-semibold text-foreground">
                    {item.item_title ?? "Untitled Item"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatAmount(item.buyer_total_amount)}
                  </div>
                </TableCell>

                {/* Seller */}
                <TableCell className="whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={item.seller?.avatar_url ?? undefined} />
                      <AvatarFallback className="text-xs">{sellerInitials}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium text-foreground">
                      {item.seller?.name ?? "Unknown"}
                    </span>
                  </div>
                </TableCell>

                {/* Reason */}
                <TableCell>
                  <span className="text-sm text-foreground">{item.reason_label}</span>
                </TableCell>

                {/* Status */}
                <TableCell className="whitespace-nowrap">
                  <DisputeStatusBadge status={item.status} />
                </TableCell>

                {/* Money Status */}
                <TableCell className="whitespace-nowrap">
                  <DisputeMoneyStatusBadge status={item.money_status} />
                </TableCell>

                {/* Date Opened */}
                <TableCell className="whitespace-nowrap">
                  <div className="text-sm text-foreground">
                    {format(openedDate, "MMM d, yyyy")}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatDistanceToNow(openedDate, { addSuffix: true })}
                  </div>
                </TableCell>

                {/* Action */}
                <TableCell className="whitespace-nowrap">
                  {item.status === "resolved" ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => navigate(item.primary_action.route)}
                    >
                      View Resolution
                    </Button>
                  ) : (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => navigate(item.primary_action.route)}
                    >
                      View Dispute
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      </div>
    </div>
  );
}
