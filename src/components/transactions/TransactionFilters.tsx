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

const transactionStatusOptions = [
  { value: "all", label: "All Statuses" },
  { value: "processing", label: "Processing" },
  { value: "in_transit", label: "In Transit" },
  { value: "delivered", label: "Delivered" },
  { value: "completed", label: "Completed" },
  { value: "disputed", label: "In Dispute" },
  { value: "cancelled", label: "Cancelled" },
];

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
    <div className="rounded-lg border bg-card p-2.5 space-y-2.5">
      {/* Search + dropdowns row */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search by ID, item, or seller..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8 h-11 text-xs"
          />
        </div>

        <Select value={transactionStatus} onValueChange={onTransactionStatusChange}>
          <SelectTrigger className="h-11 text-xs sm:w-44">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            {transactionStatusOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={moneyStatus} onValueChange={onMoneyStatusChange}>
          <SelectTrigger className="h-11 text-xs sm:w-48">
            <SelectValue placeholder="All Money Statuses" />
          </SelectTrigger>
          <SelectContent>
            {moneyStatusOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
            className="h-11 text-xs gap-1.5 text-muted-foreground"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </Button>
        )}
      </div>

      {/* Status chips */}
      <div className="flex flex-wrap gap-1.5">
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
                "inline-flex min-h-11 items-center gap-1 rounded-full px-3 py-2 text-xs font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              {tab.label}
              <span
                className={cn(
                  "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[12px]",
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
    </div>
  );
}
