import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertCircle, Download, FileText, Loader2, RefreshCw } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { getSellerPayouts, type PayoutHistoryItem } from "@/services/seller-payouts.service";
import { formatMoney } from "@/lib/format";

interface ExportPayoutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentStatusFilter: string;
  currentSearch: string;
}

const statusLabel: Record<string, string> = {
  completed: "Released",
  processing: "Processing",
  pending: "Scheduled",
  failed: "Failed",
  cancelled: "Cancelled",
  on_hold: "On Hold",
};

const fmtCurrency = (amount: number) => formatMoney(amount, "NGN");

function buildCsv(rows: PayoutHistoryItem[]): string {
  const headers = [
    "Payout ID", "Transaction Code", "Buyer", "Item",
    "Gross Amount", "Fees", "Net Payout", "Currency",
    "Status", "Release Date", "Failure Reason",
  ];
  const esc = (v: string | null | undefined) => {
    if (!v) return "";
    const s = String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((r) => [
    esc(r.payout_id),
    esc(r.transaction_code),
    esc(r.buyer_name),
    esc(r.item_title),
    r.gross_amount.toFixed(2),
    r.fees.toFixed(2),
    r.net_payout.toFixed(2),
    r.currency_code,
    esc(statusLabel[r.status] ?? r.status),
    format(new Date(r.release_date), "yyyy-MM-dd"),
    esc(r.failure_reason),
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

const PREVIEW_LIMIT = 20;

export function ExportPayoutsDialog({
  open, onOpenChange, currentStatusFilter, currentSearch,
}: ExportPayoutsDialogProps) {
  const [scope, setScope] = useState("filtered");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const dateError = useMemo(() => {
    if (fromDate && toDate && fromDate > toDate) {
      return "Start date must be on or before end date";
    }
    return null;
  }, [fromDate, toDate]);

  const resolvedStatus = (() => {
    if (scope === "filtered") return currentStatusFilter || undefined;
    if (scope === "all") return undefined;
    return scope;
  })();

  const resolvedSearch = scope === "filtered" ? currentSearch || undefined : undefined;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["seller-payouts-export", scope, fromDate, toDate, resolvedStatus, resolvedSearch],
    queryFn: () =>
      getSellerPayouts(
        1,
        500,
        resolvedStatus ?? "",
        resolvedSearch ?? "",
        fromDate || undefined,
        toDate || undefined,
      ),
    enabled: open && !dateError,
  });

  const rows = data?.payout_history ?? [];
  const previewRows = rows.slice(0, PREVIEW_LIMIT);
  const totalNet = rows.reduce((s, r) => s + r.net_payout, 0);
  const releasedCount = rows.filter((r) => r.status === "completed").length;

  const helperText = !fromDate && !toDate
    ? "No date range selected — exporting all payout history."
    : "Export payout records within the selected date range.";

  const handleDownload = () => {
    const csv = buildCsv(rows);
    const dateStr = format(new Date(), "yyyy-MM-dd");
    const rangeSuffix = fromDate || toDate ? `-${fromDate || "start"}_${toDate || "now"}` : "";
    const scopeSuffix = scope !== "all" ? "-filtered" : "";
    downloadBlob(csv, `safedeal-payouts${scopeSuffix}${rangeSuffix}-${dateStr}.csv`);
    toast.success(
      rows.length > 0
        ? `Exported ${rows.length} payout record${rows.length === 1 ? "" : "s"}`
        : "Exported empty CSV (headers only)"
    );
  };

  const exportDisabled = isLoading || !!dateError;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <div>
            <DialogTitle className="text-xl font-bold text-foreground">Export Payouts</DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Export payout records based on your current filters or choose a broader payout history range.
            </p>
          </div>
        </DialogHeader>

        {/* Controls + Summary */}
        <div className="px-6 py-4 border-b bg-muted/30 flex flex-col lg:flex-row items-start lg:items-end justify-between gap-4">
          <div className="flex flex-col gap-2 w-full lg:w-auto">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Scope</Label>
                <Select value={scope} onValueChange={setScope}>
                  <SelectTrigger className="w-48 bg-background h-11">
                    <SelectValue placeholder="Export Scope" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="filtered">Current filtered view</SelectItem>
                    <SelectItem value="all">All payouts</SelectItem>
                    <SelectItem value="completed">Released only</SelectItem>
                    <SelectItem value="processing">Processing only</SelectItem>
                    <SelectItem value="pending">Pending / Scheduled only</SelectItem>
                    <SelectItem value="on_hold">On Hold only</SelectItem>
                    <SelectItem value="failed">Failed only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="from-date" className="text-xs text-muted-foreground">Date from</Label>
                <Input
                  id="from-date"
                  type="date"
                  value={fromDate}
                  max={toDate || undefined}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-40 bg-background h-11"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="to-date" className="text-xs text-muted-foreground">Date to</Label>
                <Input
                  id="to-date"
                  type="date"
                  value={toDate}
                  min={fromDate || undefined}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-40 bg-background h-11"
                />
              </div>
              {(fromDate || toDate) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-11 text-xs"
                  onClick={() => { setFromDate(""); setToDate(""); }}
                >
                  Clear dates
                </Button>
              )}
              {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mb-2" />}
            </div>
            <p className={`text-xs ${dateError ? "text-destructive" : "text-muted-foreground/70"}`}>
              {dateError ?? helperText}
            </p>
          </div>
          <div className="flex items-center gap-5 text-sm">
            <div>
              <span className="text-muted-foreground">Records: </span>
              <span className="font-semibold text-foreground">{rows.length}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Net Total: </span>
              <span className="font-semibold text-foreground">{fmtCurrency(totalNet)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Released: </span>
              <span className="font-semibold text-success">{releasedCount}</span>
            </div>
          </div>
        </div>

        {/* Preview Table */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {isError ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <AlertCircle className="h-10 w-10 text-destructive/50 mb-3" />
              <p className="text-sm font-medium text-foreground">Failed to load payout data</p>
              <p className="text-xs text-muted-foreground mt-1">Check your connection and try again</p>
              <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={() => refetch()}>
                <RefreshCw className="h-3.5 w-3.5" /> Retry
              </Button>
            </div>
          ) : rows.length === 0 && !isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <FileText className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-foreground">No payouts in this range</p>
              <p className="text-xs text-muted-foreground mt-1">Try a different scope or date range</p>
            </div>
          ) : (
            <>
              <table className="w-full text-sm sd-stack">
                <thead>
                  <tr className="border-b text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="text-left py-2 pr-3 font-semibold">Payout ID</th>
                    <th className="text-left py-2 pr-3 font-semibold">Code</th>
                    <th className="text-left py-2 pr-3 font-semibold hidden md:table-cell">Buyer</th>
                    <th className="text-left py-2 pr-3 font-semibold hidden lg:table-cell">Item</th>
                    <th className="text-right py-2 pr-3 font-semibold hidden sm:table-cell">Gross</th>
                    <th className="text-right py-2 pr-3 font-semibold hidden sm:table-cell">Fees</th>
                    <th className="text-right py-2 pr-3 font-semibold">Net</th>
                    <th className="text-left py-2 pr-3 font-semibold">Status</th>
                    <th className="text-left py-2 font-semibold hidden sm:table-cell">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((r, i) => (
                    <tr key={r.payout_id_full} className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                      <td className="py-2.5 pr-3 font-mono text-xs">{r.payout_id}</td>
                      <td className="py-2.5 pr-3 font-mono text-xs">{r.transaction_code}</td>
                      <td className="py-2.5 pr-3 hidden md:table-cell text-xs">{r.buyer_name}</td>
                      <td className="py-2.5 pr-3 hidden lg:table-cell text-xs truncate max-w-[140px]">{r.item_title}</td>
                      <td className="py-2.5 pr-3 text-right hidden sm:table-cell text-xs">{fmtCurrency(r.gross_amount)}</td>
                      <td className="py-2.5 pr-3 text-right hidden sm:table-cell text-xs text-muted-foreground">-{fmtCurrency(r.fees)}</td>
                      <td className="py-2.5 pr-3 text-right font-semibold text-xs">{fmtCurrency(r.net_payout)}</td>
                      <td className="py-2.5 pr-3">
                        <Badge variant="outline" className="text-xs">
                          {statusLabel[r.status] ?? r.status}
                        </Badge>
                      </td>
                      <td className="py-2.5 hidden sm:table-cell text-xs text-muted-foreground">
                        {format(new Date(r.release_date), "MMM d, yyyy")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > PREVIEW_LIMIT && (
                <p className="text-xs text-muted-foreground mt-3 text-center">
                  Showing first {PREVIEW_LIMIT} of {rows.length} records
                </p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {rows.length} record{rows.length !== 1 ? "s" : ""} will be exported
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button size="sm" className="gap-1.5" disabled={exportDisabled} onClick={handleDownload}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Download CSV
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
