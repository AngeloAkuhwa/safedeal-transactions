import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, AlertTriangle, ShieldAlert, CheckCircle2, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  availabilityDot, availabilityLabel, availabilityTextColor, currencyFmt,
  humanize, initialsOf, isEligibleAvailability, nameOf, priorityBadgeClass,
} from "../helpers";
import type { AgentRosterEntry, UnassignedTask } from "@/services/task-orchestration.service";

export function AssignTaskDrawer({
  open, onOpenChange, task, bulkCount, roster, onConfirm, submitting,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  task: UnassignedTask | null;
  bulkCount?: number;
  roster: AgentRosterEntry[];
  onConfirm: (agentId: string, reason: string) => void;
  submitting: boolean;
}) {
  const [agentId, setAgentId] = useState("");
  const [reason, setReason] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    if (open) { setAgentId(task?.suggested_agent_id ?? ""); setReason(""); setSearch(""); }
  }, [open, task]);

  const isBulk = (bulkCount ?? 0) > 1;
  const requiredRole = task?.required_role ?? null;
  const initiator = (task as any)?.initiator_id ?? null;
  const originator = (task as any)?.originator_id ?? null;
  const isFinancial = task?.type === "payout_review" || task?.type === "escrow_release_review" || task?.type === "refund_authorization";

  const scored = useMemo(() => {
    const q = search.trim().toLowerCase();
    return roster
      .map(a => {
        const atCap = a.availability === "at_capacity" || a.active >= a.max_active;
        const ineligibleAvail = !isEligibleAvailability(a.availability);
        const skillGap = requiredRole ? !(a.skills ?? []).includes(requiredRole) : false;
        const sodBlock = isFinancial && (a.user_id === initiator || a.user_id === originator);
        return {
          agent: a, atCap, ineligibleAvail, skillGap, sodBlock,
          blocked: ineligibleAvail || sodBlock,
        };
      })
      .filter(({ agent }) => !q || nameOf(agent).toLowerCase().includes(q) || agent.email?.toLowerCase().includes(q))
      .sort((a, b) => {
        const rank = (r: typeof a) => (r.blocked ? 3 : r.skillGap ? 2 : r.atCap ? 1 : 0);
        return rank(a) - rank(b) || a.agent.active - b.agent.active;
      });
  }, [roster, search, requiredRole, isFinancial, initiator, originator]);

  const selected = scored.find(r => r.agent.user_id === agentId);
  const canConfirm = !!agentId && !selected?.blocked && !submitting;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isBulk ? `Assign ${bulkCount} tasks` : "Assign Task"}</SheetTitle>
          <SheetDescription>
            Pick an eligible agent. Rows warn about capacity, missing skills, and separation-of-duty blocks.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {task && !isBulk && (
            <div className="rounded-xl border border-border/60 bg-card/40 p-3 text-sm">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">#{task.task_code}</span>
                <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold", priorityBadgeClass(task.priority))}>
                  {humanize(task.priority)}
                </span>
                {requiredRole && (
                  <span className="inline-flex rounded-full bg-sky-500/10 px-2 py-0.5 text-xs font-semibold text-sky-300 ring-1 ring-inset ring-sky-500/30">
                    needs {humanize(requiredRole)}
                  </span>
                )}
                {isFinancial && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-300 ring-1 ring-inset ring-amber-500/30">
                    <ShieldAlert className="h-2.5 w-2.5" /> Financial · SoD active
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {humanize(task.type)} · {currencyFmt(task.amount, task.currency)}
              </div>
            </div>
          )}

          <div>
            <Label className="mb-1 block text-xs">Agent</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search agent…"
                className="h-11 bg-background/60 pl-7 text-xs"
              />
            </div>
            <div className="mt-2 max-h-[46vh] space-y-1 overflow-y-auto rounded-xl border border-border/60 bg-background/40 p-1.5">
              {scored.length === 0 && (
                <div className="p-6 text-center text-xs text-muted-foreground">No matching agents.</div>
              )}
              {scored.map(({ agent: a, atCap, ineligibleAvail, skillGap, sodBlock, blocked }) => {
                const selectedRow = agentId === a.user_id;
                const loadPct = a.max_active > 0 ? Math.min(100, Math.round((a.active / a.max_active) * 100)) : 0;
                const barTone = loadPct >= 100 ? "bg-rose-400" : loadPct >= 80 ? "bg-amber-400" : "bg-emerald-400";
                return (
                  <button
                    key={a.user_id} type="button"
                    disabled={blocked}
                    onClick={() => setAgentId(a.user_id)}
                    className={cn(
                      "w-full rounded-lg border p-2.5 text-left transition-all min-h-11",
                      selectedRow
                        ? "border-primary/60 bg-primary/[0.06] ring-1 ring-primary/30"
                        : "border-border/60 bg-card/30 hover:border-primary/40",
                      blocked && "cursor-not-allowed opacity-50",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="relative flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                          {a.avatar_url
                            ? <img src={a.avatar_url} alt="" className="h-full w-full rounded-full object-cover" />
                            : initialsOf(a)}
                          <span className={cn("absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-background", availabilityDot(a.availability))} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-xs font-medium text-foreground">{nameOf(a)}</span>
                            {selectedRow && <CheckCircle2 className="h-3 w-3 text-primary" />}
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className={cn("font-medium", availabilityTextColor(a.availability))}>
                              {availabilityLabel(a.availability)}
                            </span>
                            {a.role && <span className="text-muted-foreground">· {humanize(a.role)}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">Load</div>
                        <div className="text-xs font-semibold tabular-nums text-foreground">
                          {a.active}<span className="text-muted-foreground">/{a.max_active}</span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-border/60">
                      <div className={cn("h-full transition-all", barTone)} style={{ width: `${loadPct}%` }} />
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1 text-xs">
                      {(a.overdue ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-500/10 px-1.5 py-0.5 font-semibold text-rose-300 ring-1 ring-inset ring-rose-500/30">
                          <Flame className="h-2.5 w-2.5" /> {a.overdue} overdue
                        </span>
                      )}
                      {atCap && !ineligibleAvail && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/10 px-1.5 py-0.5 font-semibold text-amber-300 ring-1 ring-inset ring-amber-500/30">
                          At capacity
                        </span>
                      )}
                      {ineligibleAvail && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-muted/60 px-1.5 py-0.5 font-semibold text-muted-foreground ring-1 ring-inset ring-border">
                          Ineligible ({availabilityLabel(a.availability)})
                        </span>
                      )}
                      {skillGap && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/10 px-1.5 py-0.5 font-semibold text-amber-300 ring-1 ring-inset ring-amber-500/30">
                          <AlertTriangle className="h-2.5 w-2.5" /> Missing skill
                        </span>
                      )}
                      {sodBlock && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-500/10 px-1.5 py-0.5 font-semibold text-rose-300 ring-1 ring-inset ring-rose-500/30">
                          <ShieldAlert className="h-2.5 w-2.5" /> SoD conflict
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Label className="mb-1 block text-xs">Assignment reason (optional)</Label>
            <Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Why is this being assigned now?" rows={2} />
          </div>

          <div className="flex justify-end gap-2 border-t border-border/50 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={() => onConfirm(agentId, reason)} disabled={!canConfirm}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirm
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}