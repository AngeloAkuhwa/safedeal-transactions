import { useNavigate } from "react-router";
import { formatMoney } from "@/lib/format";
import { format } from "date-fns";
import { Package } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { TransactionStatusBadge } from "./TransactionStatusBadge";
import type { BuyerTransactionRow } from "@/services/transactions.service";
import type { Audience } from "@/lib/status-labels";

interface TransactionTableProps {
  transactions: BuyerTransactionRow[];
  isLoading?: boolean;
  /** Pass `"buyer"` from buyer surfaces so status copy reads in buyer voice. */
  audience?: Audience;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function TransactionTable({ transactions, isLoading, audience = "seller" }: TransactionTableProps) {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="p-4 space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-10 w-28" />
              <Skeleton className="h-10 flex-1" />
              <Skeleton className="h-10 w-24" />
              <Skeleton className="h-10 w-24" />
              <Skeleton className="h-10 w-28" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block rounded-xl border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Transaction</TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Item Details</TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Seller</TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground text-right">Amount</TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Transaction Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((tx) => (
              <TableRow
                key={tx.transaction_id}
                className="cursor-pointer"
                onClick={() => navigate(
                  tx.primary_action === "verify_item"
                    ? `/dashboard/transactions/${tx.transaction_id}/verify`
                    : `/dashboard/transactions/${tx.transaction_id}`
                )}
              >
                {/* Transaction */}
                <TableCell className="py-4 px-4">
                  <div className="space-y-0.5">
                    <p className="text-sm font-semibold text-foreground">{tx.transaction_code}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(tx.created_at), "MMM dd, yyyy HH:mm")}
                    </p>
                  </div>
                </TableCell>

                {/* Item Details */}
                <TableCell className="py-4 px-4">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                      <Package className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="space-y-0.5 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{tx.item_title}</p>
                      <p className="text-xs text-muted-foreground">
                        {tx.item_category || "General"}
                        {tx.item_quantity > 1 && ` · Qty: ${tx.item_quantity}`}
                      </p>
                    </div>
                  </div>
                </TableCell>

                {/* Seller */}
                <TableCell className="py-4 px-4">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                      {getInitials(tx.seller_name)}
                    </div>
                    <div className="space-y-0.5 min-w-0">
                      <p className="text-sm text-foreground truncate">{tx.seller_name}</p>
                    </div>
                  </div>
                </TableCell>

                {/* Amount */}
                <TableCell className="py-4 px-4 text-right">
                  <div className="space-y-0.5">
                    <p className="text-sm font-semibold text-foreground">
                      {formatMoney(tx.amount, tx.currency_code)}
                    </p>
                    <p className="text-xs text-muted-foreground">{tx.currency_code}</p>
                  </div>
                </TableCell>

                {/* Status */}
                <TableCell className="py-4 px-4">
                  <TransactionStatusBadge status={tx.transaction_status} audience={audience} moneyStatus={tx.money_status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {transactions.map((tx) => (
          <div
            key={tx.transaction_id}
            className="rounded-xl border bg-card p-4 space-y-3 cursor-pointer active:bg-accent/50 transition-colors"
            onClick={() => navigate(
              tx.primary_action === "verify_item"
                ? `/dashboard/transactions/${tx.transaction_id}/verify`
                : `/dashboard/transactions/${tx.transaction_id}`
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-0.5 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{tx.item_title}</p>
                <p className="text-xs text-muted-foreground">{tx.transaction_code}{tx.item_quantity > 1 ? ` · Qty: ${tx.item_quantity}` : ""}</p>
              </div>
              <span className="text-sm font-semibold text-foreground whitespace-nowrap">
                {formatMoney(tx.amount, tx.currency_code)}
              </span>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{tx.seller_name}</span>
              <span>·</span>
              <span>{format(new Date(tx.created_at), "MMM dd, yyyy")}</span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <TransactionStatusBadge status={tx.transaction_status} audience={audience} moneyStatus={tx.money_status} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
