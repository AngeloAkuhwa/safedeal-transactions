import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "./states/EmptyState";
import { slaTone } from "./helpers";
import { agentShortName, type AgentPerformanceRow } from "@/services/agent-performance.service";
import { Timer } from "lucide-react";

export function SLAComplianceTable({
  agents, onReviewSla,
}: { agents: AgentPerformanceRow[]; onReviewSla: (a: AgentPerformanceRow) => void }) {
  if (agents.length === 0) {
    return <EmptyState icon={Timer} title="No SLA data" hint="No cases were handled in this range." />;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[880px]">
        <thead>
          <tr className="border-b border-border/70">
            {["Agent", "On Time", "Overdue", "Breached", "Compliance", ""].map((h, i) => (
              <th key={h || i} className={cn("px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground", i === 0 ? "text-left" : i === 5 ? "text-right" : "text-center")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {agents.map((a) => (
            <tr key={a.user_id} className="border-b border-border/60 transition-colors hover:bg-card/50">
              <td className="px-4 py-3 text-sm font-medium text-foreground">{agentShortName(a)}</td>
              <td className="px-4 py-3 text-center text-sm text-emerald-300">{a.on_time}</td>
              <td className={cn("px-4 py-3 text-center text-sm", a.overdue > 0 ? "text-amber-300" : "text-muted-foreground")}>{a.overdue}</td>
              <td className={cn("px-4 py-3 text-center text-sm", a.breached > 0 ? "text-rose-300" : "text-muted-foreground")}>{a.breached}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <Progress value={a.sla_compliance} className="h-1.5 flex-1" />
                  <span className={cn("w-12 text-right text-sm font-semibold", slaTone(a.sla_compliance))}>
                    {a.sla_compliance}%
                  </span>
                </div>
              </td>
              <td className="px-4 py-3 text-right">
                <button
                  type="button"
                  onClick={() => onReviewSla(a)}
                  className="rounded-lg border border-border/70 bg-card/60 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  Review SLA
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}