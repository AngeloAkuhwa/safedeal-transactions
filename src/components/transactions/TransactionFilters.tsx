import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { StatusCounts } from "@/services/transactions.service";

interface TransactionFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  transactionStatus: string;
  onTransactionStatusChange: (value: string) => void;
  moneyStatus: string;
  onMoneyStatusChange: (value: string) => void;
  statusCounts: StatusCounts | null;
  onClearFilters: () => void;
  hasActiveFilters: boolean;
}

const statusTabs = [
  { key: "all", label: "All" },
  { key: "processing", label: "Processing" },
  { key: "in_transit", label: "In Transit" },
  { key: "delivered", label: "Delivered" },
  { key: "completed", label: "Completed" },
  { key: "disputed", label: "In Dispute" },
  { key: "cancelled", label: "Cancelled" },
] as const;

const moneyStatusOptions = [
  { value: "all", label: "All Money Statuses" },
  { value: "not_secured", label: "Not Secured" },
  { value: "payment_pending", label: "Payment Pending" },
  { value: "funds_held_in_escrow", label: "Funds Held in Escrow" },
  { value: "funds_frozen", label: "Funds Frozen" },
  { value: "funds_releasing", label: "Funds Releasing" },
  { value: "funds_released", label: "Funds Released" },
  { value: "refund_pending", label: "Refund Pending" },
  { value: "refund_issued", label: "Refund Issued" },
];

export function TransactionFilters({
  search,
  onSearchChange,
  transactionStatus,
  onTransactionStatusChange,
  moneyStatus,
  onMoneyStatusChange,
  statusCounts,
  onClearFilters,
  hasActiveFilters,
}: TransactionFiltersProps) {
  return (
    <div className="space-y-4">
      {/* Status tabs */}
      <div className="flex flex-wrap gap-2">
        {statusTabs.map((tab) => {
          const count = statusCounts
            ? statusCounts[tab.key as keyof StatusCounts]
            : 0;
          const isActive = transactionStatus === tab.key;

          return (
            <button
              key={tab.key}
              onClick={() => onTransactionStatusChange(tab.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              {tab.label}
              <span
                className={cn(
                  "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs",
                  isActive
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-background text-muted-foreground"
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search + dropdowns */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by transaction ID, item name, or seller..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={moneyStatus} onValueChange={onMoneyStatusChange}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="All Money Statuses" />
          </SelectTrigger>
          <SelectContent>
            {moneyStatusOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={onClearFilters} className="gap-1.5">
            <X className="h-4 w-4" />
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
