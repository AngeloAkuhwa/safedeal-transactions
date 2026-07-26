import { useMemo } from "react";
import { Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CARD_CLASS, humanize, initialsOf, relative, shortNameOf, slaBadgeClass, slaLabel,
} from "./helpers";
import type { AgentRosterEntry, LiveTask } from "@/services/task-orchestration.service";

export function LiveTaskProgression({
  tasks, roster, onView,
}: { tasks: LiveTask[]; roster: AgentRosterEntry[]; onView: (t: LiveTask) => void }) {
  const rosterById = useMemo(() => new Map(roster.map(r => [r.user_id, r])), [roster]);
  return (
    <section className={CARD_CLASS}>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Live Task Progression</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Active work across the floor</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/60 px-2.5 py-1 text-[11px] text-muted-foreground transition hover:text-foreground">
            <Filter className="h-3 w-3" /> Filter
          </button>
          <span className="text-xs font-medium text-primary">View All ({tasks.length})</span>
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border/60 bg-background/40">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="sticky top-0 bg-background/80 backdrop-blur">
            <tr className="border-b border-border/60 text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3 font-semibold">Task ID</th>
              <th className="px-2 py-3 font-semibold">Agent</th>
              <th className="px-2 py-3 font-semibold">Case Ref</th>
              <th className="px-2 py-3 font-semibold">Stage</th>
              <th className="px-2 py-3 font-semibold">Started</th>
              <th className="px-2 py-3 font-semibold">Last Updated</th>
              <th className="px-2 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 text-right font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {tasks.length === 0 && <tr><td colSpan={8} className="py-10 text-center text-sm text-muted-foreground">No active tasks.</td></tr>}
            {tasks.map(t => {
              const agent = t.assigned_agent_id ? rosterById.get(t.assigned_agent_id) : null;
              return (
                <tr key={t.id} className="border-b border-border/40 transition-colors hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium text-foreground">#{t.task_code}</td>
                  <td className="px-2 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                        {agent?.avatar_url
                          ? <img src={agent.avatar_url} className="h-full w-full rounded-full object-cover" alt="" />
                          : initialsOf(agent)}
                      </div>
                      <span className="text-xs text-muted-foreground">{shortNameOf(agent)}</span>
                    </div>
                  </td>
                  <td className="px-2 py-3 text-xs text-muted-foreground">{t.dispute_id ? `#${t.dispute_id.slice(0,8)}` : "—"}</td>
                  <td className="px-2 py-3 text-xs text-muted-foreground">{humanize(t.stage)}</td>
                  <td className="px-2 py-3 text-xs text-muted-foreground">{relative(t.started_at)}</td>
                  <td className="px-2 py-3 text-xs text-muted-foreground">{relative(t.updated_at)}</td>
                  <td className="px-2 py-3">
                    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold", slaBadgeClass(t.sla_status))}>
                      {slaLabel(t.sla_status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => onView(t)} className="text-xs font-medium text-primary transition-colors hover:text-foreground">
                      View
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}