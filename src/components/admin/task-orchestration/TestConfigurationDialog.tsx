import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import type { TestConfigResult, AgentRosterEntry } from "@/services/task-orchestration.service";
import { nameOf } from "./helpers";

export function TestConfigurationDialog({
  open, onOpenChange, result, running, roster, onBackToEdit, onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  result: TestConfigResult | null;
  running: boolean;
  roster: AgentRosterEntry[];
  onBackToEdit: () => void;
  onSave: () => void;
}) {
  const nameFor = (id: string | null) => {
    if (!id) return "—";
    const r = roster.find((a) => a.user_id === id);
    return r ? nameOf(r) : id.slice(0, 8);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Test Configuration — dry run</DialogTitle>
          <DialogDescription>Simulation only. Nothing was assigned or modified.</DialogDescription>
        </DialogHeader>

        {running && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Simulating…
          </div>
        )}
        {!running && result && (
          <Tabs defaultValue="summary" className="mt-2">
            <TabsList>
              <TabsTrigger value="summary">Summary</TabsTrigger>
              <TabsTrigger value="sample">Sample ({result.sample.length})</TabsTrigger>
              <TabsTrigger value="unassigned">Unassigned ({result.unassigned.length})</TabsTrigger>
              <TabsTrigger value="capacity">Capacity ({result.capacity_impact.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="summary" className="space-y-3 pt-4">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {[
                  { l: "Mode", v: result.mode },
                  { l: "Pending", v: result.pending },
                  { l: "Would assign", v: result.would_assign },
                  { l: "Per-agent avg", v: result.distribution_summary.per_agent_average },
                ].map((c) => (
                  <div key={c.l} className="rounded-lg border border-border/60 bg-background/40 p-3">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">{c.l}</div>
                    <div className="mt-1 text-xl font-semibold">{c.v}</div>
                  </div>
                ))}
              </div>
            </TabsContent>
            <TabsContent value="sample" className="pt-4">
              <div className="overflow-hidden rounded-lg border border-border/60">
                <table className="w-full text-sm sd-stack">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="p-2 text-left">Task</th>
                      <th className="p-2 text-left">Priority</th>
                      <th className="p-2 text-left">Proposed agent</th>
                      <th className="p-2 text-left">Rule</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.sample.map((s) => (
                      <tr key={s.task_id} className="border-t border-border/40">
                        <td className="p-2 font-mono text-xs">{s.task_code}</td>
                        <td className="p-2"><Badge variant="secondary">{s.priority}</Badge></td>
                        <td className="p-2">{nameFor(s.proposed_agent)}</td>
                        <td className="p-2 text-muted-foreground">{s.rule_used}</td>
                      </tr>
                    ))}
                    {result.sample.length === 0 && (
                      <tr><td colSpan={4} className="p-3 text-center text-xs text-muted-foreground">No tasks would be assigned.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>
            <TabsContent value="unassigned" className="pt-4">
              <div className="overflow-hidden rounded-lg border border-border/60">
                <table className="w-full text-sm sd-stack">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr><th className="p-2 text-left">Task</th><th className="p-2 text-left">Reason</th></tr>
                  </thead>
                  <tbody>
                    {result.unassigned.map((u) => (
                      <tr key={u.task_id} className="border-t border-border/40">
                        <td className="p-2 font-mono text-xs">{u.task_code}</td>
                        <td className="p-2 text-muted-foreground">{u.reason}</td>
                      </tr>
                    ))}
                    {result.unassigned.length === 0 && (
                      <tr><td colSpan={2} className="p-3 text-center text-xs text-muted-foreground">Everything eligible was placed.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>
            <TabsContent value="capacity" className="pt-4">
              <div className="overflow-hidden rounded-lg border border-border/60">
                <table className="w-full text-sm sd-stack">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="p-2 text-left">Agent</th>
                      <th className="p-2 text-right">Current</th>
                      <th className="p-2 text-right">Projected</th>
                      <th className="p-2 text-right">Max</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.capacity_impact.map((c) => (
                      <tr key={c.agent_id} className="border-t border-border/40">
                        <td className="p-2">{nameFor(c.agent_id)}</td>
                        <td className="p-2 text-right tabular-nums">{c.current}</td>
                        <td className="p-2 text-right tabular-nums text-primary">{c.projected}</td>
                        <td className="p-2 text-right tabular-nums text-muted-foreground">{c.max}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          </Tabs>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onBackToEdit}>Back to Edit</Button>
          <Button onClick={onSave} disabled={running || !result}>Review and Save Rules</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}