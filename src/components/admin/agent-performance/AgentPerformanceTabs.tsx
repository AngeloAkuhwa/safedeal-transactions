import { cn } from "@/lib/utils";

export type AgentTab = "workload" | "performance" | "sla" | "rankings";

const TABS: { key: AgentTab; label: string; caption: string }[] = [
  { key: "workload", label: "Workload", caption: "Current active task burden across all agents" },
  { key: "performance", label: "Performance", caption: "Throughput, resolution speed and first-action times" },
  { key: "sla", label: "SLA Compliance", caption: "On-time versus breached case handling" },
  { key: "rankings", label: "Rankings", caption: "Composite leaderboard with movement vs the previous period" },
];

export function captionFor(tab: AgentTab): string {
  return TABS.find((t) => t.key === tab)?.caption ?? "";
}

export function AgentPerformanceTabs({
  value, onChange,
}: { value: AgentTab; onChange: (t: AgentTab) => void }) {
  return (
    <div>
      <div role="tablist" aria-label="Agent performance views" className="mb-2 inline-flex rounded-xl border border-border/70 bg-card/60 p-1 backdrop-blur-sm">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={value === t.key}
            onClick={() => onChange(t.key)}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-medium transition-colors min-h-11",
              value === t.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{captionFor(value)}</p>
    </div>
  );
}