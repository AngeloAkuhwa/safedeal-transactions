import { Search, Filter, X, Download } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

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
}: Props) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by code, buyer, item, or reason..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9 h-9"
        />
      </div>

      <Select value={status} onValueChange={onStatusChange}>
        <SelectTrigger className="h-9 w-52">
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
        <SelectTrigger className="h-9 w-52">
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

      <Button variant="outline" size="sm" className="h-9 gap-1.5">
        <Download className="h-3.5 w-3.5" />
        Export
      </Button>

      {hasActiveFilters && (
        <Button variant="ghost" size="sm" className="h-9 gap-1.5 text-muted-foreground" onClick={onClearFilters}>
          <X className="h-3.5 w-3.5" />
          Clear ({totalCount})
        </Button>
      )}
    </div>
  );
}
