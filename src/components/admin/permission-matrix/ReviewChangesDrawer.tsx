import { useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ShieldAlert, CheckCircle2, XCircle, Loader2, AlertTriangle, Users } from "lucide-react";
import type { ApprovalRow, HistoryRow, RoleGrantMap } from "@/services/permission-workspace.service";
import { HISTORY_ACTION_LABEL } from "@/services/permission-workspace.service";
import type { StagedChange } from "@/hooks/useStagedPermissionChanges";
import { ROLE_LABEL, type InternalRoleKey } from "@/services/permission-catalog";
import { evaluateApproval, changeStateTone } from "@/services/permission-approval-rules";
import { permissionRepo, type PermissionEnvironment, DEFAULT_ENVIRONMENT } from "@/services/permission-repository";
import { PermissionDiffTable, type DiffRow } from "./PermissionDiffTable";
import { toast } from "sonner";

interface StagedProps {
  mode: "staged";
  open: boolean;
  onOpenChange: (v: boolean) => void;
  changes: StagedChange[];
  roleMap: RoleGrantMap;
  environment?: PermissionEnvironment;
  userImpactByRole?: Map<string, number>;
  dependenciesByKey?: Map<string, string[]>;
  conflictsByKey?: Map<string, string[]>;
  onSubmitted: () => void;
  onDiscard: () => void;
}

interface LegacyProps {
  mode?: undefined;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  approval?: ApprovalRow | null;
  history?: HistoryRow | null;
}

export function ReviewChangesDrawer(props: StagedProps | LegacyProps) {
  if ((props as StagedProps).mode === "staged") return <StagedReview {...(props as StagedProps)} />;
  return <LegacyReview {...(props as LegacyProps)} />;
}

function LegacyReview({ approval, history, open, onOpenChange }: LegacyProps) {
  const title = approval ? "Change request" : history ? (HISTORY_ACTION_LABEL[history.action_type] ?? history.action_type) : "Change";
  const payload = approval?.payload ?? history?.metadata ?? null;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-md overflow-y-auto sm:max-w-xl">
        <SheetHeader><SheetTitle>{title}</SheetTitle></SheetHeader>
        <div className="mt-4 space-y-3 text-sm">
          {approval && (<>
            <Field label="Target user" value={approval.target_user_name} />
            <Field label="Requested by" value={approval.requested_by_name} />
            <Field label="Reason" value={approval.reason ?? "—"} />
          </>)}
          {history && (<>
            <Field label="Actor" value={history.actor_name ?? "System"} />
            <Field label="Target" value={history.target_user_name ?? "—"} />
            <Field label="Summary" value={history.summary ?? "—"} />
          </>)}
          <div>
            <div className="mb-1 text-xs uppercase text-muted-foreground">Payload</div>
            <pre className="max-h-[400px] overflow-auto rounded-md border border-border bg-background/70 p-3 text-xs leading-relaxed text-muted-foreground">
              {payload ? JSON.stringify(payload, null, 2) : "—"}
            </pre>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (<div><div className="text-xs uppercase text-muted-foreground">{label}</div><div className="text-sm">{value}</div></div>);
}

function StagedReview({ open, onOpenChange, changes, roleMap, environment = DEFAULT_ENVIRONMENT, userImpactByRole, dependenciesByKey, conflictsByKey, onSubmitted, onDiscard }: StagedProps) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const byRole = useMemo(() => {
    const map = new Map<InternalRoleKey, StagedChange[]>();
    for (const c of changes) {
      const bag = map.get(c.role) ?? [];
      bag.push(c);
      map.set(c.role, bag);
    }
    return map;
  }, [changes]);

  const targetEval = useMemo(() => {
    const out: Array<{ role: InternalRoleKey; adds: string[]; removes: string[]; requires: boolean; hits: string[] }> = [];
    for (const [role, list] of byRole) {
      const adds = list.filter((c) => c.op === "grant").map((c) => c.permissionKey);
      const removes = list.filter((c) => c.op === "revoke").map((c) => c.permissionKey);
      const r = evaluateApproval({ targetScope: "role", targetKey: role, addedKeys: adds, removedKeys: removes });
      out.push({ role, adds, removes, requires: r.requires, hits: r.hits.map((h) => h.message) });
    }
    return out;
  }, [byRole]);

  const anyRequires = targetEval.some((t) => t.requires);
  const reasonOk = reason.trim().length >= 20;

  const doSubmit = async (autoApply: boolean) => {
    if (!reasonOk) return;
    setBusy(true);
    try {
      const inputs = Array.from(byRole.entries()).map(([role, list]) => {
        const before = Array.from(roleMap.map.get(role) ?? []).sort();
        const after = new Set(before);
        for (const c of list) { if (c.op === "grant") after.add(c.permissionKey); else after.delete(c.permissionKey); }
        const adds = list.filter((c) => c.op === "grant").map((c) => c.permissionKey);
        const removes = list.filter((c) => c.op === "revoke").map((c) => c.permissionKey);
        const requires = evaluateApproval({ targetScope: "role", targetKey: role, addedKeys: adds, removedKeys: removes }).requires;
        return {
          target_scope: "role" as const,
          target_key: role,
          before: { permission_keys: before },
          after: { permission_keys: Array.from(after).sort() },
          reason: reason.trim(),
          environment,
          requires_approval: requires,
          autoApply: autoApply && !requires,
        };
      });
      await permissionRepo.submitChangeSets(inputs);
      toast.success(autoApply && !anyRequires ? `Applied ${inputs.length} change set(s)` : `Submitted ${inputs.length} change set(s) for approval`);
      onSubmitted();
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message || "Failed to submit changes");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-md overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            Review changes
            <span className={`ml-2 rounded px-2 py-0.5 text-xs uppercase ${changeStateTone("draft").bg} ${changeStateTone("draft").text}`}>Draft</span>
          </SheetTitle>
          <div className="text-xs text-muted-foreground">
            {changes.length} change{changes.length === 1 ? "" : "s"} across {byRole.size} role{byRole.size === 1 ? "" : "s"} · env <span className="font-mono">{environment}</span>
          </div>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {targetEval.map(({ role, adds, removes, requires, hits }) => {
            const rows: DiffRow[] = [
              ...adds.map((k) => ({ permissionKey: k, op: "grant" as const, impactedUsers: userImpactByRole?.get(role) ?? null, dependencies: dependenciesByKey?.get(k) ?? [], conflicts: conflictsByKey?.get(k) ?? [] })),
              ...removes.map((k) => ({ permissionKey: k, op: "revoke" as const, impactedUsers: userImpactByRole?.get(role) ?? null, dependencies: dependenciesByKey?.get(k) ?? [], conflicts: conflictsByKey?.get(k) ?? [] })),
            ];
            return (
              <div key={role} className="rounded-xl border border-border/60 bg-background/40 p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <div className="text-sm font-semibold">Role · {ROLE_LABEL[role]}</div>
                  <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-xs font-medium text-emerald-300">+{adds.length}</span>
                  <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-xs font-medium text-rose-300">−{removes.length}</span>
                  {(userImpactByRole?.get(role) ?? 0) > 0 && (
                    <span className="ml-auto inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      <Users className="h-3 w-3" /> {userImpactByRole?.get(role)} users
                    </span>
                  )}
                </div>
                <PermissionDiffTable rows={rows} />
                {requires ? (
                  <div className="mt-2 flex items-start gap-2 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-200">
                    <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <div>
                      <div className="font-medium">Approval required</div>
                      <ul className="ml-3 list-disc">{hits.map((h) => <li key={h}>{h}</li>)}</ul>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 flex items-center gap-2 rounded border border-emerald-500/30 bg-emerald-500/5 p-2 text-xs text-emerald-200">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Non-privileged change: you can apply directly.
                  </div>
                )}
              </div>
            );
          })}

          <div className="rounded-xl border border-border/60 bg-background/40 p-3">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Reason for change <span className="text-rose-300">*</span>
            </label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this change is needed. Minimum 20 characters."
              rows={3}
              className="text-sm"
            />
            <div className={`mt-1 text-xs ${reasonOk ? "text-emerald-300" : "text-muted-foreground"}`}>
              {reason.trim().length}/20 characters
            </div>
          </div>

          {anyRequires && (
            <div className="flex items-start gap-2 rounded border border-sky-500/30 bg-sky-500/5 p-2 text-xs text-sky-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Submission goes to a separate approver. You cannot approve your own request.
            </div>
          )}
        </div>

        <div className="sticky bottom-0 mt-4 flex flex-wrap items-center gap-2 border-t border-border/60 bg-card/95 py-3 backdrop-blur">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Return to editing</Button>
          <Button
            variant="outline"
            onClick={() => { onDiscard(); onOpenChange(false); }}
            disabled={busy}
            className="text-rose-300 hover:text-rose-200"
          >
            <XCircle className="mr-1 h-4 w-4" /> Discard changes
          </Button>
          <div className="flex-1" />
          {anyRequires ? (
            <Button onClick={() => doSubmit(false)} disabled={busy || !reasonOk}>
              {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Submit for approval
            </Button>
          ) : (
            <Button onClick={() => doSubmit(true)} disabled={busy || !reasonOk}>
              {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Apply changes
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
