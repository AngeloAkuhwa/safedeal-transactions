import { Search, Filter, X, Download } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { SellerDisputeItem } from "@/services/seller-disputes.service";

interface Props {
  search: string;
  onSearchChange: (v: string) => void;
  status: string;
  onStatusChange: (v: string) => void;
  reason: string;
  onReasonChange: (v: string) => void;
  totalCount: number;
  onClearFilters: () => void;
  hasActiveFilters: boolean;
  items?: SellerDisputeItem[];
  onExportClick?: () => void;
}

function exportDisputesCsv(items: SellerDisputeItem[]) {
  const headers = [
    "Dispute ID",
    "Transaction Code",
    "Buyer",
    "Item",
    "Reason",
    "Status",
    "Money Impact",
    "Response Deadline",
    "Opened Date",
    "Last Updated",
    "Resolution Summary",
  ];

  const escapeCsv = (val: string | null | undefined) => {
    if (!val) return "";
    const s = String(val);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const rows = items.map((d) => [
    escapeCsv(d.id.substring(0, 8).toUpperCase()),
    escapeCsv(d.transaction_code),
    escapeCsv(d.buyer?.name),
    escapeCsv(d.item_title),
    escapeCsv(d.reason_label),
    escapeCsv(d.status.replace(/_/g, " ")),
    escapeCsv(d.money_impact.replace(/_/g, " ")),
    escapeCsv(d.seller_response_due_at ? new Date(d.seller_response_due_at).toLocaleDateString("en-NG") : ""),
    escapeCsv(new Date(d.opened_at).toLocaleDateString("en-NG")),
    escapeCsv(d.resolved_at ? new Date(d.resolved_at).toLocaleDateString("en-NG") : ""),
    "", // resolution summary not in list data
  ]);

  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const date = new Date().toISOString().split("T")[0];
  link.href = url;
  link.download = `disputes-export-${date}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function SellerDisputeFilters({
  search,
  onSearchChange,
  status,
  onStatusChange,
  reason,
  onReasonChange,
  totalCount,
  onClearFilters,
  hasActiveFilters,
  items = [],
  onExportClick,
}: Props) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by code, buyer, item, or reason..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9 h-11"
        />
      </div>

      <Select value={status} onValueChange={onStatusChange}>
        <SelectTrigger className="h-11 w-52">
          <Filter className="h-3.5 w-3.5 mr-1.5" />
          <SelectValue placeholder="All Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Status</SelectItem>
          <SelectItem value="open">Open</SelectItem>
          <SelectItem value="seller_response_pending">Awaiting Seller Response</SelectItem>
          <SelectItem value="under_review">Under Review</SelectItem>
          <SelectItem value="resolved">Resolved</SelectItem>
        </SelectContent>
      </Select>

      <Select value={reason} onValueChange={onReasonChange}>
        <SelectTrigger className="h-11 w-52">
          <SelectValue placeholder="All Reasons" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Reasons</SelectItem>
          <SelectItem value="wrong_item_received">Wrong item received</SelectItem>
          <SelectItem value="damaged_item_received">Damaged item</SelectItem>
          <SelectItem value="incomplete_order">Incomplete order</SelectItem>
          <SelectItem value="item_not_as_described">Item not as described</SelectItem>
          <SelectItem value="item_not_delivered">Item not delivered</SelectItem>
          <SelectItem value="suspected_fake_item">Suspected fake item</SelectItem>
          <SelectItem value="other">Other</SelectItem>
        </SelectContent>
      </Select>

      <Button
        variant="outline"
        size="sm"
        className="h-11 gap-1.5"
        onClick={() => onExportClick?.()}
      >
        <Download className="h-3.5 w-3.5" />
        Export
      </Button>

      {hasActiveFilters && (
        <Button variant="ghost" size="sm" className="h-11 gap-1.5 text-muted-foreground" onClick={onClearFilters}>
          <X className="h-3.5 w-3.5" />
          Clear ({totalCount})
        </Button>
      )}
    </div>
  );
}
