import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertCircle, Download, FileText, Loader2, RefreshCw } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { getSellerDisputes, type SellerDisputeItem } from "@/services/seller-disputes.service";
import { resolveDisputeLabel, resolveDisputeMoneyImpact } from "@/lib/status-labels";

interface ExportDisputesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentStatusFilter: string;
  currentReasonFilter: string;
  currentSearch: string;
}

function esc(v: string | null | undefined) {
  if (!v) return "";
  const s = String(v);
  return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildCsv(rows: SellerDisputeItem[]): string {
  const headers = [
    "Dispute ID", "Transaction Code", "Buyer", "Item",
    "Reason", "Status", "Money Impact", "Response Deadline",
    "Date Opened", "Last Updated", "Resolution Date",
  ];
  const lines = rows.map((d) => [
    esc(d.id.substring(0, 8).toUpperCase()),
    esc(d.transaction_code),
    esc(d.buyer?.name),
    esc(d.item_title),
    esc(d.reason_label),
    esc(resolveDisputeLabel(d.status, "seller").label),
    esc(resolveDisputeMoneyImpact(d.money_impact).label),
    d.seller_response_due_at ? format(new Date(d.seller_response_due_at), "yyyy-MM-dd") : "",
    format(new Date(d.opened_at), "yyyy-MM-dd"),
    "",
    d.resolved_at ? format(new Date(d.resolved_at), "yyyy-MM-dd") : "",
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

export function ExportDisputesDialog({
  open, onOpenChange, currentStatusFilter, currentReasonFilter, currentSearch,
}: ExportDisputesDialogProps) {
  const [scope, setScope] = useState("filtered");

  const resolvedStatus = (() => {
    if (scope === "filtered") return currentStatusFilter !== "all" ? currentStatusFilter : undefined;
    if (scope === "open") return "open";
    if (scope === "seller_response_pending") return "seller_response_pending";
    if (scope === "under_review") return "under_review";
    if (scope === "resolved") return "resolved";
    return undefined;
  })();

  const resolvedReason = scope === "filtered" && currentReasonFilter !== "all" ? currentReasonFilter : undefined;
  const resolvedSearch = scope === "filtered" ? currentSearch || undefined : undefined;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["seller-disputes-export", scope, resolvedStatus, resolvedReason, resolvedSearch],
    queryFn: () => getSellerDisputes({
      status: resolvedStatus,
      reason: resolvedReason,
      search: resolvedSearch,
      page: 1,
      page_size: 500,
    }),
    enabled: open,
  });

  const rows = data?.items ?? [];
  const previewRows = rows.slice(0, PREVIEW_LIMIT);
  const openCount = rows.filter((d) => d.status === "open" || d.status === "seller_response_pending").length;
  const resolvedCount = rows.filter((d) => d.status === "resolved").length;

  const handleDownload = () => {
    const csv = buildCsv(rows);
    const dateStr = format(new Date(), "yyyy-MM-dd");
    const suffix = scope !== "all" ? "-filtered" : "";
    downloadBlob(csv, `safedeal-disputes${suffix}-${dateStr}.csv`);
    toast.success(`Exported ${rows.length} dispute records`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85dvh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <div>
            <DialogTitle className="text-xl font-bold text-foreground">Export Disputes</DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Export dispute cases using your current filters or choose a broader case history range.
            </p>
          </div>
        </DialogHeader>

        {/* Controls + Summary */}
        <div className="px-6 py-4 border-b bg-muted/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <Select value={scope} onValueChange={setScope}>
                <SelectTrigger className="w-52 bg-background">
                  <SelectValue placeholder="Export Scope" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="filtered">Current filtered view</SelectItem>
                  <SelectItem value="all">All disputes</SelectItem>
                  <SelectItem value="open">Open only</SelectItem>
                  <SelectItem value="seller_response_pending">Awaiting response</SelectItem>
                  <SelectItem value="under_review">Under review</SelectItem>
                  <SelectItem value="resolved">Resolved only</SelectItem>
                </SelectContent>
              </Select>
              
              {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
            
          </div>
          <div className="flex items-center gap-5 text-sm">
            <div>
              <span className="text-muted-foreground">Records: </span>
              <span className="font-semibold text-foreground">{rows.length}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Open: </span>
              <span className="font-semibold text-warning">{openCount}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Resolved: </span>
              <span className="font-semibold text-success">{resolvedCount}</span>
            </div>
          </div>
        </div>

        {/* Preview Table */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {isError ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <AlertCircle className="h-10 w-10 text-destructive/50 mb-3" />
              <p className="text-sm font-medium text-foreground">Failed to load dispute data</p>
              <p className="text-xs text-muted-foreground mt-1">Check your connection and try again</p>
              <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={() => refetch()}>
                <RefreshCw className="h-3.5 w-3.5" /> Retry
              </Button>
            </div>
          ) : rows.length === 0 && !isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <FileText className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-foreground">No disputes in this range</p>
              <p className="text-xs text-muted-foreground mt-1">Try a different scope</p>
            </div>
          ) : (
            <>
              <table className="w-full text-sm sd-stack">
                <thead>
                  <tr className="border-b text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="text-left py-2 pr-3 font-semibold">ID</th>
                    <th className="text-left py-2 pr-3 font-semibold">Code</th>
                    <th className="text-left py-2 pr-3 font-semibold hidden md:table-cell">Buyer</th>
                    <th className="text-left py-2 pr-3 font-semibold hidden lg:table-cell">Item</th>
                    <th className="text-left py-2 pr-3 font-semibold">Reason</th>
                    <th className="text-left py-2 pr-3 font-semibold">Status</th>
                    <th className="text-left py-2 pr-3 font-semibold hidden sm:table-cell">Impact</th>
                    <th className="text-left py-2 font-semibold hidden sm:table-cell">Opened</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((d, i) => (
                    <tr key={d.id} className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                      <td className="py-2.5 pr-3 font-mono text-xs">{d.id.substring(0, 8).toUpperCase()}</td>
                      <td className="py-2.5 pr-3 font-mono text-xs">{d.transaction_code}</td>
                      <td className="py-2.5 pr-3 hidden md:table-cell text-xs">{d.buyer?.name ?? "—"}</td>
                      <td className="py-2.5 pr-3 hidden lg:table-cell text-xs truncate max-w-[140px]">{d.item_title}</td>
                      <td className="py-2.5 pr-3 text-xs">{d.reason_label}</td>
                      <td className="py-2.5 pr-3">
                        <Badge variant="outline" className="text-xs">
                          {resolveDisputeLabel(d.status, "seller").label}
                        </Badge>
                      </td>
                      <td className="py-2.5 pr-3 hidden sm:table-cell text-xs">
                        {resolveDisputeMoneyImpact(d.money_impact).label}
                      </td>
                      <td className="py-2.5 hidden sm:table-cell text-xs text-muted-foreground">
                        {format(new Date(d.opened_at), "MMM d, yyyy")}
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
            <Button size="sm" className="gap-1.5" disabled={rows.length === 0 || isLoading} onClick={handleDownload}>
              <Download className="h-4 w-4" />
              Download CSV
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
