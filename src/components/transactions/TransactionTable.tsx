import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TransactionStatusBadge } from "./TransactionStatusBadge";
import { MoneyStatusBadge } from "./MoneyStatusBadge";
import type { BuyerTransactionRow } from "@/services/transactions.service";

interface TransactionTableProps {
  transactions: BuyerTransactionRow[];
  isLoading?: boolean;
}

const actionLabels: Record<string, { label: string; variant: "default" | "outline" | "secondary" }> = {
  continue_payment: { label: "Continue Payment", variant: "default" },
  track_order: { label: "Track Order", variant: "outline" },
  verify_item: { label: "Verify Item", variant: "default" },
  view_dispute: { label: "View Dispute", variant: "outline" },
  view_receipt: { label: "View Receipt", variant: "secondary" },
  view_details: { label: "View Details", variant: "secondary" },
};

function formatCurrency(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

export function TransactionTable({ transactions, isLoading }: TransactionTableProps) {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="p-4 space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-10 w-24" />
              <Skeleton className="h-10 flex-1" />
              <Skeleton className="h-10 w-20" />
              <Skeleton className="h-10 w-28" />
              <Skeleton className="h-10 w-28" />
              <Skeleton className="h-10 w-24" />
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
              <TableHead>Transaction</TableHead>
              <TableHead>Seller</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Transaction Status</TableHead>
              <TableHead>Money Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((tx) => {
              const action = actionLabels[tx.primary_action] ?? actionLabels.view_details;
              return (
                <TableRow
                  key={tx.transaction_id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/dashboard/transactions/${tx.transaction_id}`)}
                >
                  <TableCell>
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium text-foreground">{tx.item_title}</p>
                      <p className="text-xs text-muted-foreground">
                        {tx.transaction_code}
                        {tx.item_category && ` · ${tx.item_category}`}
                        {tx.item_quantity > 1 && ` · Qty: ${tx.item_quantity}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(tx.created_at), "MMM dd, yyyy HH:mm")}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-foreground">{tx.seller_name}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="text-sm font-semibold text-foreground">
                      {formatCurrency(tx.amount, tx.currency_code)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <TransactionStatusBadge status={tx.transaction_status} />
                  </TableCell>
                  <TableCell>
                    <MoneyStatusBadge status={tx.money_status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant={action.variant}
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/dashboard/transactions/${tx.transaction_id}`);
                      }}
                    >
                      {action.label}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {transactions.map((tx) => {
          const action = actionLabels[tx.primary_action] ?? actionLabels.view_details;
          return (
            <div
              key={tx.transaction_id}
              className="rounded-xl border bg-card p-4 space-y-3 cursor-pointer active:bg-accent/50 transition-colors"
              onClick={() => navigate(`/dashboard/transactions/${tx.transaction_id}`)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{tx.item_title}</p>
                  <p className="text-xs text-muted-foreground">{tx.transaction_code}</p>
                </div>
                <span className="text-sm font-semibold text-foreground whitespace-nowrap">
                  {formatCurrency(tx.amount, tx.currency_code)}
                </span>
              </div>

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{tx.seller_name}</span>
                <span>·</span>
                <span>{format(new Date(tx.created_at), "MMM dd, yyyy")}</span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <TransactionStatusBadge status={tx.transaction_status} />
                  <MoneyStatusBadge status={tx.money_status} />
                </div>
                <Button
                  variant={action.variant}
                  size="sm"
                  className="text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/dashboard/transactions/${tx.transaction_id}`);
                  }}
                >
                  {action.label}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
