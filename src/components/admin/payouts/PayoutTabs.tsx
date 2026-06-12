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
    <div className="flex bg-slate-800 rounded-lg p-1 min-w-max">
      {TABS.map((t) => {
        const isActive = active === t.value;
        return (
          <button
            key={t.value}
            type="button"
            onClick={() => onChange(t.value)}
            className={cn(
              "px-4 py-2 rounded text-sm font-medium whitespace-nowrap transition-all",
              isActive
                ? "bg-emerald-500 text-white"
                : "text-slate-400 hover:text-white"
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}