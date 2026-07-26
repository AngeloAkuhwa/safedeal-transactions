import { useState } from "react";
import { AgentLoadCard } from "./AgentLoadCard";
import { CARD_CLASS } from "./helpers";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { AgentRosterEntry } from "@/services/task-orchestration.service";

export function AgentRoster({ roster, onSelect }: { roster: AgentRosterEntry[]; onSelect: (a: AgentRosterEntry) => void }) {
  const online = roster.filter(a => a.availability !== "offline").length;
  const [saving, setSaving] = useState<null | "available" | "busy" | "offline">(null);
  const setMyStatus = async (status: "available" | "busy" | "offline") => {
    setSaving(status);
    try {
      const { error } = await supabase.functions.invoke("admin-agent-heartbeat", { body: { status } });
      if (error) throw error;
      toast.success(`You are now ${status}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not update availability");
    } finally {
      setSaving(null);
    }
  };
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
      <div className="mb-3 flex items-center gap-1.5 text-[11px]">
        <span className="text-muted-foreground">Set my status:</span>
        {(["available","busy","offline"] as const).map(s => (
          <button
            key={s}
            type="button"
            disabled={saving !== null}
            onClick={() => setMyStatus(s)}
            className="rounded-full border border-border/60 bg-background/40 px-2 py-0.5 capitalize text-muted-foreground hover:text-foreground hover:border-border disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>
      <div className="max-h-[480px] space-y-2.5 overflow-y-auto pr-1">
        {roster.length === 0 && (
          <div className="rounded-xl border border-dashed border-border/60 bg-background/40 p-6 text-center text-sm text-muted-foreground">
            No agents on shift yet. Sign in as an internal user or set your availability above to appear here.
          </div>
        )}
        {roster.map(a => <AgentLoadCard key={a.user_id} agent={a} onSelect={() => onSelect(a)} />)}
      </div>
    </section>
  );
}