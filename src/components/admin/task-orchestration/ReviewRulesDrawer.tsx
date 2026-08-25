import { useEffect, useMemo, useState } from "react";
import { Loader2, AlertTriangle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ADMIN_TONE } from "@/components/admin/palette";
import type { AssignmentRulesConfig, RuleVersionRow } from "@/services/task-orchestration.service";

function diffKeys(a: AssignmentRulesConfig, b: AssignmentRulesConfig): string[] {
  const keys = new Set<string>([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  return [...keys].filter((k) => JSON.stringify((a as any)?.[k]) !== JSON.stringify((b as any)?.[k]));
}

function fmt(v: unknown): string {
  if (v === undefined || v === null || v === "") return "—";
  if (typeof v === "boolean") return v ? "On" : "Off";
  return String(v);
}

export function ReviewRulesDrawer({
  open, onOpenChange, current, draft, impact, onConfirm, submitting,
  requiresApproval: requiresApprovalProp, serverError, readOnly, changeSetId,
  history,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  current: AssignmentRulesConfig;
  draft: AssignmentRulesConfig | null;
  impact: { pending: number; would_assign: number; unmatched: number } | null;
  onConfirm: (reason: string) => void;
  submitting: boolean;
  requiresApproval?: boolean;
  serverError?: string | null;
  /** Read-only review of an already-submitted change set (from the approvals queue). */
  readOnly?: boolean;
  changeSetId?: string | null;
  /** Recent rule versions, newest first. */
  history?: RuleVersionRow[];
}) {
  const [reason, setReason] = useState("");
  useEffect(() => { if (open) setReason(""); }, [open]);
  const diffs = useMemo(() => (draft ? diffKeys(current, draft) : []), [current, draft]);
  const warnings = useMemo(() => {
    const w: string[] = [];
    if (!draft) return w;
    if (draft.auto_escalate_stale && !draft.stale_escalation_queue) {
      w.push("Auto-escalate stale is on but no escalation queue is set.");
    }
    if ((draft.max_active_per_agent ?? 0) < (current.max_active_per_agent ?? 0)) {
      w.push("Max active per agent decreased: some agents may exceed the new cap.");
    }
    if (draft.priority_to_senior_pool && !draft.senior_pool_queue) {
      w.push("Priority-to-senior-pool is on but no senior pool queue is set.");
    }
    if (draft.super_admin_self_assign) {
      w.push("Super Admin self-assignment is enabled. Every use will be audited.");
    }
    return w;
  }, [current, draft]);
  const requiresApproval = requiresApprovalProp ?? (
    diffs.includes("mode") || (draft?.super_admin_self_assign && !current?.super_admin_self_assign)
  );
  const short = reason.trim().length < 20;

  const affectedQueues = [draft?.stale_escalation_queue, draft?.senior_pool_queue].filter(Boolean) as string[];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            {readOnly ? "Submitted rules change" : "Review and Save Rules"}
          </SheetTitle>
          <SheetDescription>
            {readOnly
              ? "This change is awaiting approval. Approve or reject it from Pending Approvals."
              : "Confirm changes before they take effect. All saves are audited."}
          </SheetDescription>
        </SheetHeader>

        {readOnly && changeSetId && (
          <div className="mt-4 rounded-xl border border-primary/30 bg-primary/10 p-3 text-xs text-primary">
            Change set <span className="font-mono">{changeSetId.slice(0, 8)}</span>: pending approval.
          </div>
        )}

        <div className="mt-5 space-y-5">
          <section>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Changes</div>
            <div className="overflow-hidden rounded-xl border border-border/60">
              <table className="w-full text-sm sd-stack">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr><th className="p-2 text-left">Rule</th><th className="p-2 text-left">Previous</th><th className="p-2 text-left">New</th></tr>
                </thead>
                <tbody>
                  {diffs.length === 0 && (
                    <tr><td colSpan={3} className="p-3 text-center text-xs text-muted-foreground">No changes detected.</td></tr>
                  )}
                  {diffs.map((k) => (
                    <tr key={k} className="border-t border-border/40">
                      <td className="p-2 font-medium">{k.replace(/_/g, " ")}</td>
                      <td className="p-2 text-muted-foreground">{fmt((current as any)[k])}</td>
                      <td className="p-2 text-foreground">{fmt((draft as any)?.[k])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border/60 bg-background/40 p-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Affected queues</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {affectedQueues.length === 0 ? <Badge variant="secondary">global</Badge> :
                  affectedQueues.map((q) => <Badge key={q} variant="secondary">{q}</Badge>)}
              </div>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/40 p-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Estimated impact</div>
              <div className="mt-1 text-xs text-foreground">
                {impact
                  ? `${impact.would_assign} of ${impact.pending} pending would be assigned · ${impact.unmatched} unmatched`
                  : "Calculating…"}
              </div>
            </div>
          </section>

          {warnings.length > 0 && (
            <section className={`rounded-xl border ${ADMIN_TONE.warning.panel} p-3`}>
              <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5" /> Warnings
              </div>
              <ul className="ml-4 list-disc space-y-0.5 text-xs text-amber-200/90">
                {warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </section>
          )}

          {requiresApproval && (
            <div className="rounded-xl border border-primary/30 bg-primary/10 p-3 text-xs text-primary">
              This change will be logged and may require additional approval per policy.
            </div>
          )}

          {serverError && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300">
              {serverError}
            </div>
          )}

          {!readOnly && (
          <section>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Reason for change (required)
            </div>
            <Textarea
              value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="Why are these rules changing? (min 20 characters)"
              className="min-h-[100px]"
            />
            <div className="mt-1 text-xs text-muted-foreground">{reason.trim().length}/20 minimum</div>
          </section>
          )}

          {(history?.length ?? 0) > 0 && (
            <section>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rules history</div>
              <div className="divide-y divide-border/40 overflow-hidden rounded-xl border border-border/60">
                {history!.map((v) => (
                  <div key={v.id} className="p-2.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-foreground">v{v.version}</span>
                      <span className="text-muted-foreground">{new Date(v.created_at).toLocaleString()}</span>
                    </div>
                    <div className="mt-0.5 text-muted-foreground">
                      Saved by {v.actor_name ?? "—"}
                      {v.note ? ` · ${v.note}` : ""}
                    </div>
                    {v.approved_by ? (
                      <div className="mt-0.5 text-emerald-300">
                        Approved by {v.approver_name ?? "admin"}
                        {v.approved_at ? ` · ${new Date(v.approved_at).toLocaleString()}` : ""}
                      </div>
                    ) : (
                      <div className="mt-0.5 text-muted-foreground/70">Direct save (no approval)</div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <SheetFooter className="mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {readOnly ? "Close" : "Back to Edit"}
          </Button>
          {!readOnly && (
            <Button onClick={() => onConfirm(reason)} disabled={submitting || short || diffs.length === 0}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {requiresApproval ? "Submit for approval" : "Save Rules"}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}