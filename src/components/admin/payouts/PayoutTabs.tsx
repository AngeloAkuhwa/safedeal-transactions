import { cn } from "@/lib/utils";
import type { PayoutTab, PayoutSummary } from "@/services/admin-payouts.service";

const TABS: { value: PayoutTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending_release", label: "Pending" },
  { value: "processing", label: "Processing" },
  { value: "failed", label: "Failed" },
  { value: "completed", label: "Completed" },
  { value: "blocked", label: "Blocked" },
  { value: "stuck", label: "Stuck" },
];

interface Props {
  active: PayoutTab;
  onChange: (t: PayoutTab) => void;
  summary: PayoutSummary | null;
}

export function PayoutTabs({ active, onChange, summary }: Props) {
  const counts = summary?.tab_counts;
  return (
    <div className="flex gap-1.5 overflow-x-auto lg:bg-slate-800 lg:rounded-lg lg:p-1 lg:min-w-max lg:gap-0 scrollbar-none">
      {TABS.map((t) => {
        const isActive = active === t.value;
        const c = counts?.[t.value];
        return (
          <button
            key={t.value}
            type="button"
            onClick={() => onChange(t.value)}
            className={cn(
              "px-3 py-2 rounded-lg lg:rounded text-xs lg:text-sm font-medium whitespace-nowrap transition-all inline-flex items-center justify-center gap-2 flex-shrink-0 min-h-11 min-w-11",
              isActive
                ? "bg-emerald-500 text-white"
                : "bg-slate-800 lg:bg-transparent text-slate-400 hover:text-white"
            )}
          >
            {t.label}
            {typeof c === "number" && c > 0 && (
              <span className={cn(
                "text-xs font-semibold px-1.5 py-0.5 rounded",
                isActive ? "bg-white/20 text-white" : "bg-slate-700 text-slate-300"
              )}>{c}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}