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
    <div className="flex bg-muted/40 rounded-lg p-1 overflow-x-auto min-w-max">
      {TABS.map((t) => {
        const count = summary?.tab_counts?.[t.value] ?? 0;
        const isActive = active === t.value;
        return (
          <button
            key={t.value}
            type="button"
            onClick={() => onChange(t.value)}
            className={cn(
              "px-3 sm:px-4 py-2 rounded text-xs sm:text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-2",
              isActive
                ? "bg-blue-600 text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <span>{t.label}</span>
            {count > 0 ? (
              <span className={cn(
                "text-[10px] sm:text-xs rounded px-1.5 py-0.5",
                isActive ? "bg-white/20" : "bg-muted text-foreground/80"
              )}>{count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}