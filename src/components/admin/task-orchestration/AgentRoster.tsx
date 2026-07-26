import { AgentLoadCard } from "./AgentLoadCard";
import { CARD_CLASS } from "./helpers";
import type { AgentRosterEntry } from "@/services/task-orchestration.service";

export function AgentRoster({ roster, onSelect }: { roster: AgentRosterEntry[]; onSelect: (a: AgentRosterEntry) => void }) {
  const online = roster.filter(a => a.availability !== "offline").length;
  return (
    <section className={CARD_CLASS}>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Agent Roster</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Availability &amp; live workload</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-300">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          {online} Online
        </div>
      </div>
      <div className="max-h-[480px] space-y-2.5 overflow-y-auto pr-1">
        {roster.length === 0 && (
          <div className="rounded-xl border border-dashed border-border/60 bg-background/40 p-6 text-center text-sm text-muted-foreground">
            No agents on shift.
          </div>
        )}
        {roster.map(a => <AgentLoadCard key={a.user_id} agent={a} onSelect={() => onSelect(a)} />)}
      </div>
    </section>
  );
}