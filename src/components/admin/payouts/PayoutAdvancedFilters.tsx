import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PayoutTab } from "@/services/admin-payouts.service";

export type DateRangePreset = "all_time" | "last_7d" | "last_30d" | "last_3m" | "custom";
export type AmountRange = "any" | "0_10k" | "10k_100k" | "100k_1m" | "1m_plus";
export type BankStatus = "all" | "verified" | "unverified" | "pending";
export type QuickFilter = "none" | "failed_only" | "blocked_only" | "high_priority";

export interface PayoutFilterState {
  status: PayoutTab;
  dateRange: DateRangePreset;
  customFrom?: string; // ISO
  customTo?: string;   // ISO
  amount: AmountRange;
  bank: BankStatus;
  quick: QuickFilter;
}

export const DEFAULT_PAYOUT_FILTERS: PayoutFilterState = {
  status: "all",
  dateRange: "all_time",
  amount: "any",
  bank: "all",
  quick: "none",
};

const selectCls = "w-full p-3 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500";

interface Props {
  value: PayoutFilterState;
  onChange: (next: PayoutFilterState) => void;
  className?: string;
  variant?: "desktop" | "mobile";
}

export function PayoutAdvancedFilters({ value, onChange, className, variant = "desktop" }: Props) {
  const [open, setOpen] = useState(false);
  const set = <K extends keyof PayoutFilterState>(k: K, v: PayoutFilterState[K]) => onChange({ ...value, [k]: v });

  const customLabel =
    value.customFrom && value.customTo
      ? `${format(new Date(value.customFrom), "MMM d")} – ${format(new Date(value.customTo), "MMM d")}`
      : "Pick dates";

  const wrapperCls = variant === "mobile"
    ? cn("space-y-3", className)
    : cn("grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4", className);

  return (
    <div className={wrapperCls}>
      <div>
        <label className="text-slate-400 text-xs font-medium mb-2 block">Status</label>
        <select className={selectCls} value={value.status} onChange={(e) => set("status", e.target.value as PayoutTab)}>
          <option value="all">All Statuses</option>
          <option value="pending_release">Pending</option>
          <option value="processing">Processing</option>
          <option value="failed">Failed</option>
          <option value="completed">Completed</option>
          <option value="blocked">Blocked</option>
        </select>
      </div>
      <div>
        <label className="text-slate-400 text-xs font-medium mb-2 block">Date Range</label>
        <select className={selectCls} value={value.dateRange} onChange={(e) => set("dateRange", e.target.value as DateRangePreset)}>
          <option value="all_time">All time</option>
          <option value="last_7d">Last 7 days</option>
          <option value="last_30d">Last 30 days</option>
          <option value="last_3m">Last 3 months</option>
          <option value="custom">Custom Range</option>
        </select>
        {value.dateRange === "custom" && (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("mt-2 w-full justify-start text-left font-normal bg-slate-800 border-slate-700 text-white hover:bg-slate-700 hover:text-white")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {customLabel}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                selected={{
                  from: value.customFrom ? new Date(value.customFrom) : undefined,
                  to: value.customTo ? new Date(value.customTo) : undefined,
                }}
                onSelect={(range) => {
                  onChange({
                    ...value,
                    customFrom: range?.from ? range.from.toISOString() : undefined,
                    customTo: range?.to ? new Date(range.to.getTime() + 24*60*60*1000 - 1).toISOString() : undefined,
                  });
                  if (range?.from && range?.to) setOpen(false);
                }}
                numberOfMonths={2}
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
        )}
      </div>
      <div>
        <label className="text-slate-400 text-xs font-medium mb-2 block">Amount Range</label>
        <select className={selectCls} value={value.amount} onChange={(e) => set("amount", e.target.value as AmountRange)}>
          <option value="any">Any Amount</option>
          <option value="0_10k">₦0 - ₦10,000</option>
          <option value="10k_100k">₦10,000 - ₦100,000</option>
          <option value="100k_1m">₦100,000 - ₦1,000,000</option>
          <option value="1m_plus">₦1,000,000+</option>
        </select>
      </div>
      <div>
        <label className="text-slate-400 text-xs font-medium mb-2 block">Bank Verification</label>
        <select className={selectCls} value={value.bank} onChange={(e) => set("bank", e.target.value as BankStatus)}>
          <option value="all">All Accounts</option>
          <option value="verified">Verified</option>
          <option value="unverified">Unverified</option>
          <option value="pending">Pending Verification</option>
        </select>
      </div>
      <div>
        <label className="text-slate-400 text-xs font-medium mb-2 block">Quick Filters</label>
        <select className={selectCls} value={value.quick} onChange={(e) => set("quick", e.target.value as QuickFilter)}>
          <option value="none">None</option>
          <option value="failed_only">Failed Only</option>
          <option value="blocked_only">Blocked Only</option>
          <option value="high_priority">High Priority</option>
        </select>
      </div>
    </div>
  );
}

const AMOUNT_BOUNDS: Record<AmountRange, { min?: number; max?: number }> = {
  any: {},
  "0_10k": { min: 0, max: 10000 },
  "10k_100k": { min: 10000, max: 100000 },
  "100k_1m": { min: 100000, max: 1000000 },
  "1m_plus": { min: 1000000 },
};

export function filtersToQuery(f: PayoutFilterState) {
  const out: {
    date_from?: string;
    date_to?: string;
    amount_min?: number;
    amount_max?: number;
    bank_status?: "verified" | "unverified" | "pending";
    quick?: "failed_only" | "blocked_only" | "high_priority";
  } = {};
  const now = new Date();
  if (f.dateRange === "all_time") {
    // no date bounds
  }
  else if (f.dateRange === "last_7d") out.date_from = new Date(now.getTime() - 7*86400000).toISOString();
  else if (f.dateRange === "last_30d") out.date_from = new Date(now.getTime() - 30*86400000).toISOString();
  else if (f.dateRange === "last_3m") out.date_from = new Date(now.getTime() - 90*86400000).toISOString();
  else if (f.dateRange === "custom") {
    if (f.customFrom) out.date_from = f.customFrom;
    if (f.customTo) out.date_to = f.customTo;
  }
  const b = AMOUNT_BOUNDS[f.amount];
  if (typeof b.min === "number") out.amount_min = b.min;
  if (typeof b.max === "number") out.amount_max = b.max;
  if (f.bank !== "all") out.bank_status = f.bank;
  if (f.quick !== "none") out.quick = f.quick;
  return out;
}