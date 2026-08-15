import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Download, FileText, Loader2, X } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { MoneyStatusBadge } from "@/components/transactions/MoneyStatusBadge";
import {
  getSellerTransactions,
  type SellerTransaction,
} from "@/services/seller-transactions.service";
import { resolveTransactionLabel } from "@/lib/status-labels";
import { formatMoney } from "@/lib/format";

const statusLabel = (s: string) => resolveTransactionLabel(s, "seller").label;

interface ExportPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialStatusFilter: string;
  initialDateFilter: string;
}


const fmtCurrency = (amount: number, currency: string) => formatMoney(amount, currency);

function buildCsv(rows: SellerTransaction[]): string {
  const headers = [
    "Transaction Code", "Buyer", "Email", "Item", "Qty",
    "Amount", "Currency", "Status", "Money Status", "Date",
  ];
  const lines = rows.map((tx) => [
    tx.transaction_code,
    `"${tx.buyer_name}"`,
    tx.buyer_email,
    `"${tx.item_title}"`,
    tx.item_quantity,
    tx.amount,
    tx.currency_code,
    statusLabel(tx.transaction_status),
    tx.money_status.replace(/_/g, " "),
    format(new Date(tx.created_at), "yyyy-MM-dd"),
  ].join(","));
  return [headers.join(","), ...lines].join("\n");
}

function downloadBlob(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExportPreviewDialog({
  open, onOpenChange, initialStatusFilter, initialDateFilter,
}: ExportPreviewDialogProps) {
  const [dateFilter, setDateFilter] = useState(initialDateFilter);
  const [statusFilter] = useState(initialStatusFilter);

  const { data, isLoading } = useQuery({
    queryKey: ["seller-transactions-export", statusFilter, dateFilter],
    queryFn: () =>
      getSellerTransactions({
        status_filter: statusFilter !== "all" ? statusFilter : undefined,
        date_filter: dateFilter !== "all" ? dateFilter : undefined,
        page: 1,
        page_size: 500,
      }),
    enabled: open,
  });

  const transactions = data?.transactions ?? [];
  const totalAmount = transactions.reduce((s, tx) => s + tx.amount, 0);
  const completedCount = transactions.filter((tx) => tx.transaction_status === "completed").length;

  const handleDownload = () => {
    const csv = buildCsv(transactions);
    const dateStr = format(new Date(), "yyyy-MM-dd");
    downloadBlob(csv, `transactions-export-${dateStr}.csv`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-xl font-bold text-foreground">Export Preview</DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">Review your data before downloading</p>
            </div>
          </div>
        </DialogHeader>

        {/* Controls + Summary */}
        <div className="px-6 py-4 border-b bg-muted/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="w-40 bg-background">
                <SelectValue placeholder="Time Range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="this-week">This Week</SelectItem>
                <SelectItem value="this-month">This Month</SelectItem>
                <SelectItem value="this-quarter">This Quarter</SelectItem>
              </SelectContent>
            </Select>
            {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
          <div className="flex items-center gap-5 text-sm">
            <div>
              <span className="text-muted-foreground">Records: </span>
              <span className="font-semibold text-foreground">{transactions.length}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Total: </span>
              <span className="font-semibold text-foreground">{formatMoney(totalAmount, "NGN")}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Completed: </span>
              <span className="font-semibold text-success">{completedCount}</span>
            </div>
          </div>
        </div>

        {/* Preview Table */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {transactions.length === 0 && !isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <FileText className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-foreground">No transactions in this range</p>
              <p className="text-xs text-muted-foreground mt-1">Try a different time range</p>
            </div>
          ) : (
            <table className="w-full text-sm sd-stack">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="text-left py-2 pr-3 font-semibold">Code</th>
                  <th className="text-left py-2 pr-3 font-semibold">Buyer</th>
                  <th className="text-left py-2 pr-3 font-semibold hidden md:table-cell">Item</th>
                  <th className="text-right py-2 pr-3 font-semibold">Amount</th>
                  <th className="text-left py-2 pr-3 font-semibold">Status</th>
                  <th className="text-left py-2 font-semibold hidden sm:table-cell">Date</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx, i) => (
                  <tr
                    key={tx.transaction_id}
                    className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}
                  >
                    <td className="py-2.5 pr-3 font-mono text-xs">{tx.transaction_code}</td>
                    <td className="py-2.5 pr-3">
                      <p className="font-medium text-foreground text-xs">{tx.buyer_name}</p>
                      <p className="text-xs text-muted-foreground">{tx.buyer_email}</p>
                    </td>
                    <td className="py-2.5 pr-3 hidden md:table-cell text-xs text-foreground truncate max-w-[160px]">
                      {tx.item_title}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-semibold text-xs">
                      {fmtCurrency(tx.amount, tx.currency_code)}
                    </td>
                    <td className="py-2.5 pr-3">
                      <Badge variant="outline" className="text-xs">
                        {statusLabel(tx.transaction_status)}
                      </Badge>
                    </td>
                    <td className="py-2.5 hidden sm:table-cell text-xs text-muted-foreground">
                      {format(new Date(tx.created_at), "MMM d, yyyy")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {transactions.length} record{transactions.length !== 1 ? "s" : ""} will be exported
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              disabled={transactions.length === 0}
              onClick={handleDownload}
            >
              <Download className="h-4 w-4" />
              Download CSV
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
