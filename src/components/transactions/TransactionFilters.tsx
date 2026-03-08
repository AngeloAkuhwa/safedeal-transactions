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
    <div className="rounded-xl border bg-card p-5 sm:p-6 space-y-4">
      {/* Search + dropdowns grid */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
        {/* Search */}
        <div className="sm:col-span-5">
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Search Transactions
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by ID, item name, or seller..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Transaction Status */}
        <div className="sm:col-span-3">
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Transaction Status
          </label>
          <Select value={transactionStatus} onValueChange={onTransactionStatusChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              {transactionStatusOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Money Status */}
        <div className="sm:col-span-3">
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Money Status
          </label>
          <Select value={moneyStatus} onValueChange={onMoneyStatusChange}>
            <SelectTrigger className="w-full">
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
        </div>

        {/* Clear */}
        <div className="sm:col-span-1 flex items-end">
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClearFilters}
              className="h-10 w-10"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex flex-wrap gap-2 pt-1">
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
    </div>
  );
}
