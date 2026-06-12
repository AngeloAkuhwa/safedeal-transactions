import { cn } from "@/lib/utils";
import type { PayoutTab, PayoutSummary } from "@/services/admin-payouts.service";

const TABS: { value: PayoutTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending_release", label: "Pending Release" },
  { value: "blocked", label: "Blocked" },
  { value: "processing", label: "Processing" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "reversed", label: "Reversed" },
  { value: "on_hold", label: "Disputed / On Hold" },
];

interface Props {
  active: PayoutTab;
  onChange: (t: PayoutTab) => void;
  summary: PayoutSummary | null;
}

export function PayoutTabs({ active, onChange, summary }: Props) {
  return (
    <div className="flex gap-1 overflow-x-auto flex-1 min-w-0">
      {TABS.map((t) => {
        const isActive = active === t.value;
        return (
          <button
            key={t.value}
            type="button"
            onClick={() => onChange(t.value)}
            className={cn(
              "px-3 sm:px-4 py-2 rounded-md text-xs sm:text-sm font-medium whitespace-nowrap transition-colors",
              isActive
                ? "bg-emerald-500 text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}