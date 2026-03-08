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
    <Card className="p-6 lg:p-8 shadow-lg">
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Search */}
        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">Search</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Transaction code or description"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Status */}
        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">Status</label>
          <Select value={status} onValueChange={onStatusChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Date Range - coming soon */}
        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">Date Range</label>
          <Select disabled value="all_time">
            <SelectTrigger className="w-full opacity-50">
              <SelectValue placeholder="All Time" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all_time">All Time</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Outcome - coming soon */}
        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">Outcome</label>
          <Select disabled value="all_outcomes">
            <SelectTrigger className="w-full opacity-50">
              <SelectValue placeholder="All Outcomes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all_outcomes">All Outcomes</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between mt-6 pt-6 border-t border-border">
        <div className="text-sm text-muted-foreground mb-4 sm:mb-0">
          Showing <span className="font-semibold text-foreground">{totalCount}</span> disputes
        </div>
        <div className="flex gap-3">
          {hasActiveFilters && (
            <Button variant="secondary" size="sm" onClick={onClearFilters}>
              Reset Filters
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
