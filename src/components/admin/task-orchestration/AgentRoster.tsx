import { useMemo, useState } from "react";
import { AgentLoadCard } from "./AgentLoadCard";
import { CARD_CLASS, availabilityDot } from "./helpers";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { AgentRosterEntry } from "@/services/task-orchestration.service";

type Filter = "all" | "online" | "available" | "busy" | "offline" | "on_leave" | "suspended";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all",       label: "All" },
  { key: "online",    label: "Online" },
  { key: "available", label: "Available" },
  { key: "busy",      label: "Busy" },
  { key: "offline",   label: "Offline" },
  { key: "on_leave",  label: "On Leave" },
  { key: "suspended", label: "Suspended" },
];

export function AgentRoster({ roster, onSelect }: { roster: AgentRosterEntry[]; onSelect: (a: AgentRosterEntry) => void }) {
  const online = roster.filter(a => !["offline","on_leave","suspended"].includes(a.availability)).length;
  const [saving, setSaving] = useState<null | "available" | "busy" | "offline">(null);
  const [filter, setFilter] = useState<Filter>("all");

  const counts = useMemo(() => {
    const c: Record<Filter, number> = {
      all: roster.length,
      online: 0, available: 0, busy: 0, offline: 0, on_leave: 0, suspended: 0,
    };
    for (const a of roster) {
      if (!["offline","on_leave","suspended"].includes(a.availability)) c.online += 1;
      if (a.availability === "available") c.available += 1;
      else if (a.availability === "busy" || a.availability === "at_capacity" || a.availability === "active") c.busy += 1;
      else if (a.availability === "offline") c.offline += 1;
      else if (a.availability === "on_leave") c.on_leave += 1;
      else if (a.availability === "suspended") c.suspended += 1;
    }
    return c;
  }, [roster]);

  const filtered = useMemo(() => roster.filter(a => {
    switch (filter) {
      case "all":       return true;
      case "online":    return !["offline","on_leave","suspended"].includes(a.availability);
      case "available": return a.availability === "available";
      case "busy":      return a.availability === "busy" || a.availability === "at_capacity" || a.availability === "active";
      case "offline":   return a.availability === "offline";
      case "on_leave":  return a.availability === "on_leave";
      case "suspended": return a.availability === "suspended";
    }
  }), [roster, filter]);

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
    <section className={cn(CARD_CLASS, "shadow-[0_1px_0_hsl(var(--border)/0.4)_inset]")}>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">Agent Roster</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Availability &amp; live workload</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="tabular-nums">{online}</span> Online
        </div>
      </div>

      <div className="mb-3 -mx-1 flex items-center gap-1 overflow-x-auto px-1 pb-1">
        {FILTERS.map(f => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition backdrop-blur-sm min-h-11",
                active
                  ? "border-primary/40 bg-primary/10 text-primary shadow-[0_1px_0_hsl(var(--primary)/0.2)_inset]"
                  : "border-border/60 bg-card/40 text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              {f.key !== "all" && f.key !== "online" && (
                <span className={cn("h-1.5 w-1.5 rounded-full", availabilityDot(f.key))} />
              )}
              {f.label}
              <span className="rounded-full bg-background/60 px-1.5 py-0 text-xs font-semibold tabular-nums text-muted-foreground">
                {counts[f.key]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mb-3 flex items-center gap-1.5 text-xs">
        <span className="text-muted-foreground">Set my status:</span>
        {(["available","busy","offline"] as const).map(s => (
          <button
            key={s}
            type="button"
            disabled={saving !== null}
            onClick={() => setMyStatus(s)}
            className="rounded-full border border-border/60 bg-background/40 px-2 py-0.5 capitalize text-muted-foreground transition hover:text-foreground hover:border-border disabled:opacity-50 min-h-11"
          >
            {s}
          </button>
        ))}
      </div>

      <div className="max-h-[480px] space-y-2.5 overflow-y-auto pr-1">
        {filtered.length === 0 && (
          <div className="rounded-xl border border-dashed border-border/60 bg-background/40 p-6 text-center text-sm text-muted-foreground">
            {roster.length === 0
              ? "No agents on shift yet. Sign in as an internal user or set your availability above to appear here."
              : `No agents match the “${FILTERS.find(f => f.key === filter)?.label}” filter.`}
          </div>
        )}
        {filtered.map(a => <AgentLoadCard key={a.user_id} agent={a} onSelect={() => onSelect(a)} />)}
      </div>
    </section>
  );
}