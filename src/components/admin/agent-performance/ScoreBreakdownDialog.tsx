import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { INNER_CARD_CLASS, scoreTone } from "./helpers";
import { agentName, type AgentPerformanceRow } from "@/services/agent-performance.service";

/**
 * Read-only transparency view for a composite score. Scores are never editable
 * from this screen: the breakdown exists so a ranking can be challenged with
 * evidence, not overridden.
 */
export function ScoreBreakdownDialog({
  agent, open, onOpenChange,
}: { agent: AgentPerformanceRow | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const components = agent?.score_components ?? [];
  const penalties = agent?.score_penalties ?? [];
  const exclusions = agent?.score_exclusions ?? [];
  const penaltyTotal = penalties.reduce((s, p) => s + p.points, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        {agent && (
          <>
            <DialogHeader>
              <DialogTitle>Score breakdown · {agentName(agent)}</DialogTitle>
              <DialogDescription>
                Components, weights and penalties behind the composite score. Scores cannot be
                edited manually.
              </DialogDescription>
            </DialogHeader>

            <div className={cn(INNER_CARD_CLASS, "flex items-center justify-between")}>
              <div>
                <div className="text-xs text-muted-foreground">Composite score</div>
                <div className={cn("text-3xl font-bold", scoreTone(agent.score_band))}>
                  {agent.insufficient_data ? "—" : agent.score}
                </div>
                <div className="text-xs text-muted-foreground">{agent.score_band}</div>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <div>{agent.score_included_cases ?? 0} cases included</div>
                <div>{agent.score_excluded_cases ?? 0} cases excluded</div>
                <div>{agent.resolved} completed in scope</div>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-border/60">
              <table className="w-full text-left text-xs sd-stack">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Component</th>
                    <th className="px-3 py-2 font-medium">Weight</th>
                    <th className="px-3 py-2 font-medium">Raw</th>
                    <th className="px-3 py-2 font-medium">Normalised</th>
                    <th className="px-3 py-2 text-right font-medium">Contribution</th>
                  </tr>
                </thead>
                <tbody>
                  {components.length === 0 && (
                    <tr><td colSpan={5} className="px-3 py-4 text-muted-foreground">No component data returned.</td></tr>
                  )}
                  {components.map((c) => (
                    <tr key={c.key} className="border-t border-border/50">
                      <td className="px-3 py-2 text-foreground">
                        {c.label}
                        {!c.tracked && <span className="ml-2 text-xs text-muted-foreground">not tracked</span>}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">{c.weight}%</td>
                      <td className="px-3 py-2 text-muted-foreground">{c.raw_label}</td>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">
                        {c.normalised == null ? "—" : `${Math.round(c.normalised * 10) / 10}`}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-foreground">
                        {c.tracked ? `+${c.contribution}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className={INNER_CARD_CLASS}>
                <div className="mb-2 text-xs font-medium text-foreground">
                  Penalties {penaltyTotal > 0 && <span className="text-rose-300">−{Math.round(penaltyTotal * 10) / 10}</span>}
                </div>
                {penalties.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No penalties applied.</p>
                ) : (
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {penalties.map((p) => (
                      <li key={p.reason} className="flex items-center justify-between gap-3">
                        <span>{p.reason}</span>
                        <span className="tabular-nums text-rose-300">−{Math.round(p.points * 10) / 10}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className={INNER_CARD_CLASS}>
                <div className="mb-2 text-xs font-medium text-foreground">Excluded cases</div>
                {exclusions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No cases excluded from the calculation.</p>
                ) : (
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {exclusions.map((e) => (
                      <li key={e.reason} className="flex items-center justify-between gap-3">
                        <span>{e.reason}</span>
                        <span className="tabular-nums text-foreground">{e.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Waiting, paused, evidence-pending, manager-rebalanced and SLA-less cases never
                  attract penalties.
                </p>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
