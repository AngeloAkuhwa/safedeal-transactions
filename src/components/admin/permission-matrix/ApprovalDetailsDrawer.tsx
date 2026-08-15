import { useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { CheckCircle2, XCircle, MessageSquareWarning, Loader2, ShieldAlert } from "lucide-react";
import type { PermissionApprovalItem } from "@/services/permission-workspace.service";
import { PermissionDiffTable, type DiffRow } from "./PermissionDiffTable";
import { permissionRepo } from "@/services/permission-repository";
import { canApproveChangeSet, changeStateTone, normalizeChangeState } from "@/services/permission-approval-rules";
import { useCurrentUserId } from "@/hooks/useCurrentUserId";
import { useAdminPermissions } from "@/context/AdminPermissionsContext";
import { getPermissionRisk, ROLE_LABEL, findPermissionEntry } from "@/services/permission-catalog";
import { computeMissingDependencies, computeConflicts } from "@/services/permission-dependencies";
import { format } from "date-fns";

export function ApprovalDetailsDrawer({
  item,
  open,
  onOpenChange,
  onChanged,
}: {
  item: PermissionApprovalItem | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChanged?: () => void;
}) {
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<null | "approve" | "reject" | "request">(null);
  const actorId = useCurrentUserId();
  const perms = useAdminPermissions();

  const diff: DiffRow[] = useMemo(() => {
    if (!item) return [];
    const rows: DiffRow[] = [];
    for (const k of item.added_keys) rows.push({ permissionKey: k, op: "grant" });
    for (const k of item.removed_keys) rows.push({ permissionKey: k, op: "revoke" });
    return rows;
  }, [item]);

  const projected = useMemo(() => {
    if (!item) return { deps: [] as Array<{ have: string; needs: string }>, conflicts: [] as Array<{ a: string; b: string; severity: string; rationale?: string | null }> };
    const after = new Set<string>(item.after_keys ?? []);
    return {
      deps: computeMissingDependencies(after),
      conflicts: computeConflicts(after),
    };
  }, [item]);

  const impactedRoleLabel = item?.target_scope === "role" ? (ROLE_LABEL[item.target_key as keyof typeof ROLE_LABEL] ?? item.target_key) : null;

  const guard = useMemo(() => {
    if (!item || !actorId) return { allowed: false, reason: "Loading actor…" };
    const actorKeys = new Set<string>(perms.permissions ?? []);
    return canApproveChangeSet(
      {
        id: item.id,
        requested_by: item.requested_by,
        target_scope: item.target_scope as any,
        target_key: item.target_key,
        added_keys: item.added_keys,
        removed_keys: item.removed_keys,
        risk: item.risk,
      },
      { id: actorId, roleKeys: (perms.roles ?? []) as any, effectivePermissionKeys: actorKeys },
    );
  }, [item, actorId, perms.permissions, perms.roles]);

  if (!item) return null;
  const tone = changeStateTone(normalizeChangeState(item.status));

  const doApprove = async () => {
    if (!guard.allowed) { toast.error(guard.reason ?? "Not allowed"); return; }
    setBusy("approve");
    try {
      await permissionRepo.approveChangeSet(item.id, comment || null, item.environment);
      toast.success("Change set approved and applied");
      onChanged?.(); onOpenChange(false);
    } catch (e: any) { toast.error(e?.message ?? "Approval failed"); }
    finally { setBusy(null); }
  };
  const doReject = async () => {
    if (comment.trim().length < 20) { toast.error("Rejection needs a comment of at least 20 characters"); return; }
    setBusy("reject");
    try {
      await permissionRepo.rejectChangeSet(item.id, comment, item.environment);
      toast.success("Change set rejected");
      onChanged?.(); onOpenChange(false);
    } catch (e: any) { toast.error(e?.message ?? "Reject failed"); }
    finally { setBusy(null); }
  };
  const doRequestChanges = async () => {
    if (comment.trim().length < 20) { toast.error("Requesting changes needs a comment of at least 20 characters"); return; }
    setBusy("request");
    try {
      await permissionRepo.requestChangesOnChangeSet(item.id, comment);
      toast.success("Sent back to requester");
      onChanged?.(); onOpenChange(false);
    } catch (e: any) { toast.error(e?.message ?? "Request-changes failed"); }
    finally { setBusy(null); }
  };

  const isTerminal = ["applied", "rejected", "cancelled", "failed"].includes(item.status);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            Approval details
            <span className={`inline-flex rounded-full px-2 py-0.5 text-[12px] font-semibold ring-1 ${tone.bg} ${tone.text} ${tone.ring}`}>{tone.label}</span>
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4 text-sm">
          <dl className="grid grid-cols-2 gap-3">
            <Meta label="Request ID" value={item.id} mono />
            <Meta label="Environment" value={item.environment} />
            <Meta label="Target" value={`${item.target_scope} · ${item.target_label}`} />
            <Meta label="Risk" value={item.risk} />
            <Meta label="Requested by" value={item.requested_by_name ?? "—"} />
            <Meta label="Required approver" value={item.required_approver ?? "Not required"} />
          </dl>

          <div>
            <div className="mb-1 text-xs uppercase text-muted-foreground">Reason</div>
            <div className="rounded-md border border-border/60 bg-background/40 p-3 text-xs">{item.reason ?? "—"}</div>
          </div>

          <div>
            <div className="mb-1 text-xs uppercase text-muted-foreground">Permission diff</div>
            <PermissionDiffTable rows={diff} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border border-border/60 bg-background/40 p-3">
              <div className="mb-1 text-[12px] uppercase text-muted-foreground">Impacted role</div>
              <div className="text-xs">{impactedRoleLabel ?? <span className="italic text-muted-foreground">n/a</span>}</div>
            </div>
            <div className="rounded-md border border-border/60 bg-background/40 p-3">
              <div className="mb-1 text-[12px] uppercase text-muted-foreground">Impacted users (est.)</div>
              <div className="text-xs">{(item as any).impacted_users ?? "—"}</div>
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs uppercase text-muted-foreground">Dependencies</div>
            {projected.deps.length === 0 ? (
              <div className="rounded-md border border-border/60 bg-background/40 p-3 text-xs text-muted-foreground">No missing dependencies after apply.</div>
            ) : (
              <ul className="space-y-1 text-xs">
                {projected.deps.map((d, i) => (
                  <li key={i} className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-amber-200">
                    <span className="font-mono">{d.have}</span> requires <span className="font-mono">{d.needs}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <div className="mb-1 text-xs uppercase text-muted-foreground">Conflicts &amp; security warnings</div>
            {projected.conflicts.length === 0 ? (
              <div className="rounded-md border border-border/60 bg-background/40 p-3 text-xs text-muted-foreground">No segregation-of-duty conflicts detected.</div>
            ) : (
              <ul className="space-y-1 text-xs">
                {projected.conflicts.map((c, i) => (
                  <li key={i} className="rounded border border-rose-500/40 bg-rose-500/10 p-2 text-rose-200">
                    <span className="font-mono">{c.a}</span> ⚠ <span className="font-mono">{c.b}</span>
                    <span className="ml-2 uppercase text-[12px]">{c.severity}</span>
                    {c.rationale && <div className="mt-1 text-[12px] opacity-80">{c.rationale}</div>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <div className="mb-1 text-xs uppercase text-muted-foreground">Approval history</div>
            <ul className="space-y-1 text-xs">
              <TimelineRow label="Submitted" when={(item as any).requested_at} who={item.requested_by_name} />
              {(item.review_comments ?? []).map((c: any, i: number) => (
                <TimelineRow key={i} label={c.action ?? "Reviewed"} when={c.at} who={c.actor_name ?? c.actor} comment={c.comment} />
              ))}
              {isTerminal && <TimelineRow label={item.status === "applied" ? "Applied" : item.status === "rejected" ? "Rejected" : "Closed"} when={(item as any).applied_at ?? null} who={null} />}
            </ul>
          </div>

          {item.review_comments?.length ? (
            <div>
              <div className="mb-1 text-xs uppercase text-muted-foreground">Review history</div>
              <ul className="space-y-1 text-xs">
                {item.review_comments.map((c: any, i: number) => (
                  <li key={i} className="rounded border border-border/40 bg-background/40 p-2">
                    <div className="font-medium">{c.action} · {c.actor_name ?? c.actor}</div>
                    <div className="text-muted-foreground">{c.comment}</div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {!isTerminal && (
            <div className="space-y-2 rounded-lg border border-border/60 bg-background/40 p-3">
              <div className="text-xs uppercase text-muted-foreground">Approver comment</div>
              <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder="Required for Reject / Request changes (≥ 20 chars)" />
              {!guard.allowed && (
                <div className="flex items-start gap-2 rounded-md bg-amber-500/10 p-2 text-[12px] text-amber-300">
                  <ShieldAlert className="mt-0.5 h-3.5 w-3.5" /> {guard.reason}
                </div>
              )}
              <div className="flex flex-wrap justify-end gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={doRequestChanges} disabled={!!busy}>
                  {busy === "request" ? <Loader2 className="h-3 w-3 animate-spin" /> : <MessageSquareWarning className="h-3 w-3" />} Request changes
                </Button>
                <Button variant="outline" size="sm" onClick={doReject} disabled={!!busy}>
                  {busy === "reject" ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />} Reject
                </Button>
                <Button size="sm" onClick={doApprove} disabled={!!busy || !guard.allowed}>
                  {busy === "approve" ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />} Approve & apply
                </Button>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[12px] uppercase text-muted-foreground">{label}</div>
      <div className={`text-xs ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

function TimelineRow({ label, when, who, comment }: { label: string; when: string | null; who: string | null | undefined; comment?: string }) {
  return (
    <li className="flex items-start gap-2 rounded border border-border/40 bg-background/40 p-2">
      <div className="mt-0.5 h-1.5 w-1.5 rounded-full bg-sky-400" />
      <div className="flex-1">
        <div className="text-[12px] font-medium capitalize">{label}{who ? <span className="ml-1 text-muted-foreground">· {who}</span> : null}</div>
        {when && <div className="text-[12px] text-muted-foreground">{format(new Date(when), "PPpp")}</div>}
        {comment && <div className="mt-1 text-[12px] text-muted-foreground">{comment}</div>}
      </div>
    </li>
  );
}