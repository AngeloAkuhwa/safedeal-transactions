import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface BuyerDisputeFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  status: string;
  onStatusChange: (value: string) => void;
  totalCount: number;
  onClearFilters: () => void;
  hasActiveFilters: boolean;
}

const statusOptions = [
  { value: "all", label: "All Statuses" },
  { value: "open", label: "Open" },
  { value: "seller_response_pending", label: "Seller Response Pending" },
  { value: "under_review", label: "Under Review" },
  { value: "resolved", label: "Resolved" },
];

export function BuyerDisputeFilters({
  search,
  onSearchChange,
  status,
  onStatusChange,
  totalCount,
  onClearFilters,
  hasActiveFilters,
}: BuyerDisputeFiltersProps) {
  return (
    <Card className="p-2.5 shadow-sm">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search by code or description..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8 h-11 text-xs"
          />
        </div>

        <Select value={status} onValueChange={onStatusChange}>
          <SelectTrigger className="h-11 text-xs sm:w-52">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={onClearFilters} className="h-11 text-xs text-muted-foreground">
            Reset
          </Button>
        )}
      </div>

      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
        <span className="text-xs text-muted-foreground">
          Showing <span className="font-semibold text-foreground">{totalCount}</span> disputes
        </span>
      </div>
    </Card>
  );
}
