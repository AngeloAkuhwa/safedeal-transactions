import { cn } from "@/lib/utils";
import type { PayoutTab, PayoutSummary } from "@/services/admin-payouts.service";

const TABS: { value: PayoutTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending_release", label: "Pending" },
  { value: "processing", label: "Processing" },
  { value: "failed", label: "Failed" },
  { value: "completed", label: "Completed" },
  { value: "blocked", label: "Blocked" },
];

interface Props {
  active: PayoutTab;
  onChange: (t: PayoutTab) => void;
  summary: PayoutSummary | null;
}

export function PayoutTabs({ active, onChange, summary }: Props) {
  return (
    <div className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-border bg-slate-900/60 p-1">
      {TABS.map((t) => {
        const isActive = active === t.value;
        return (
          <button
            key={t.value}
            type="button"
            onClick={() => onChange(t.value)}
            className={cn(
              "px-3 sm:px-4 h-8 rounded-md text-xs sm:text-sm font-medium whitespace-nowrap transition-colors",
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