import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ExternalLink, UserCheck, ArrowUpRightFromSquare, ShieldCheck,
  Loader2, MessageSquarePlus, CheckCircle2, Clock,
} from "lucide-react";
import { Link } from "react-router";
import {
  currencyFmt, humanize, priorityBadgeClass, relative, shortNameOf,
} from "../helpers";
import { cn } from "@/lib/utils";
import type { AgentRosterEntry, UnassignedTask } from "@/services/task-orchestration.service";
import {
  fetchTaskDetail, runOrchestrationAction, type TaskDetail,
} from "@/services/task-orchestration.service";

export function TaskDetailsDrawer({
  open, onOpenChange, task, roster, onAssign, onEscalate, onAfterMutate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  task: UnassignedTask | null;
  roster: AgentRosterEntry[];
  onAssign: (t: UnassignedTask) => void;
  onEscalate: (t: UnassignedTask) => void;
  onAfterMutate?: () => void;
}) {
  const [tab, setTab] = useState<"overview" | "timeline" | "comments">("overview");
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [comment, setComment] = useState("");
  const [posting, setPosting] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    if (!open || !task) { setDetail(null); return; }
    setLoading(true); setTab("overview");
    fetchTaskDetail(task.id)
      .then(setDetail)
      .catch(e => toast.error(e instanceof Error ? e.message : "Failed to load task"))
      .finally(() => setLoading(false));
  }, [open, task]);

  const suggested = task?.suggested_agent_id ? roster.find(r => r.user_id === task.suggested_agent_id) ?? null : null;
  const version = (detail?.task as any)?.version as number | undefined;
  const status = (detail?.task as any)?.status as string | undefined;
  const canComplete = status && !["resolved","closed","cancelled","pending_approval"].includes(status);
  const canSendForApproval = status && !["resolved","closed","cancelled","pending_approval"].includes(status);

  async function refresh() {
    if (!task) return;
    try { setDetail(await fetchTaskDetail(task.id)); } catch { /* noop */ }
  }

  async function submitComment() {
    if (!task || !comment.trim()) return;
    try {
      setPosting(true);
      await runOrchestrationAction({ action: "add_comment", task_id: task.id, body_text: comment });
      setComment("");
      await refresh();
      toast.success("Comment added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add comment");
    } finally { setPosting(false); }
  }

  async function complete() {
    if (!task) return;
    try {
      setCompleting(true);
      await runOrchestrationAction({
        action: "complete", task_id: task.id, expected_version: version,
        resolution: "resolved",
      });
      toast.success("Task completed");
      onAfterMutate?.();
      onOpenChange(false);
    } catch (e: any) {
      const err = e?.context?.body ? JSON.parse(await e.context.body.text?.() ?? "{}") : e;
      if (err?.error === "financial_permission_required") {
        toast.error(`Requires ${err.required}. Send for approval instead.`);
      } else if (err?.error === "version_conflict") {
        toast.error("Task changed since last load — refreshing.");
        await refresh();
      } else toast.error(e instanceof Error ? e.message : "Complete failed");
    } finally { setCompleting(false); }
  }

  async function sendForApproval() {
    if (!task) return;
    try {
      setApproving(true);
      await runOrchestrationAction({
        action: "send_for_approval", task_id: task.id, expected_version: version,
      });
      toast.success("Sent for approval");
      await refresh();
      onAfterMutate?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Send failed");
    } finally { setApproving(false); }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{task ? `Task #${task.task_code}` : "Task"}</SheetTitle>
          <SheetDescription>
            {task ? `${humanize(task.type)} · ${currencyFmt(task.amount, task.currency)}` : ""}
          </SheetDescription>
        </SheetHeader>
        {task && (
          <div className="mt-5">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold", priorityBadgeClass(task.priority))}>
                {humanize(task.priority)}
              </span>
              <span className="rounded-full border border-border/60 bg-card/40 px-2 py-0.5 text-[11px] text-muted-foreground">
                {humanize(task.type)}
              </span>
              {status && (
                <span className="rounded-full border border-border/60 bg-card/40 px-2 py-0.5 text-[11px] text-muted-foreground">
                  {humanize(status)}
                </span>
              )}
              <span className="rounded-full border border-border/60 bg-card/40 px-2 py-0.5 text-[11px] text-muted-foreground">
                Created {relative(task.created_at)}
              </span>
            </div>

            <Tabs value={tab} onValueChange={(v: string) => setTab(v as any)}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="timeline">
                  Timeline {detail ? `(${(detail.status_history?.length ?? 0) + (detail.assignment_history?.length ?? 0)})` : ""}
                </TabsTrigger>
                <TabsTrigger value="comments">
                  Comments {detail ? `(${detail.comments?.length ?? 0})` : ""}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-2.5">
                  <Field label="Amount" value={currencyFmt(task.amount, task.currency)} />
                  <Field label="Suggested Agent" value={suggested ? shortNameOf(suggested) : "Auto"} />
                  <Field label="Currency" value={task.currency} />
                  <Field label="Task ID" value={`#${task.task_code}`} />
                </div>
                {task.dispute_id && (
                  <div className="rounded-xl border border-border/60 bg-card/40 p-3">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Linked Dispute</div>
                    <Link
                      to={`/admin/disputes/${task.dispute_id}`}
                      className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                    >
                      #{task.dispute_id.slice(0, 8)} <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button onClick={() => onAssign(task)} className="flex-1 min-w-[140px]">
                    <UserCheck className="mr-2 h-4 w-4" /> Assign
                  </Button>
                  <Button variant="outline" onClick={() => onEscalate(task)}>
                    <ArrowUpRightFromSquare className="mr-2 h-4 w-4" /> Escalate
                  </Button>
                  {canSendForApproval && (
                    <Button variant="outline" onClick={sendForApproval} disabled={approving}>
                      {approving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                      Send for approval
                    </Button>
                  )}
                  {canComplete && (
                    <Button variant="default" onClick={complete} disabled={completing}>
                      {completing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                      Complete
                    </Button>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="timeline" className="mt-4">
                {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
                {!loading && detail && (
                  <TimelineList detail={detail} />
                )}
              </TabsContent>

              <TabsContent value="comments" className="mt-4 space-y-3">
                <div className="rounded-xl border border-border/60 bg-card/40 p-3">
                  <Textarea
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    placeholder="Add an internal note or update…"
                    className="min-h-[84px] resize-none border-0 bg-transparent p-0 focus-visible:ring-0"
                    maxLength={4000}
                  />
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">{comment.length}/4000</span>
                    <Button size="sm" onClick={submitComment} disabled={posting || !comment.trim()}>
                      {posting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageSquarePlus className="mr-2 h-4 w-4" />}
                      Post comment
                    </Button>
                  </div>
                </div>
                <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-1">
                  {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
                  {!loading && detail?.comments?.length === 0 && (
                    <div className="rounded-xl border border-dashed border-border/60 bg-background/40 p-6 text-center text-sm text-muted-foreground">
                      No comments yet.
                    </div>
                  )}
                  {detail?.comments?.map(c => (
                    <div key={c.id} className="rounded-xl border border-border/60 bg-card/40 p-3">
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {c.author_id ? detail.actor_names[c.author_id] ?? "Agent" : "System"}
                        </span>
                        <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{relative(c.created_at)}</span>
                      </div>
                      <div className="mt-1 whitespace-pre-wrap text-sm text-foreground">{c.body}</div>
                    </div>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function TimelineList({ detail }: { detail: TaskDetail }) {
  const rows = [
    ...detail.status_history.map(r => ({
      key: `s-${r.id}`, when: r.created_at,
      title: `Status: ${humanize(r.from_status ?? "new")} → ${humanize(r.to_status)}`,
      actor: r.actor_id ? detail.actor_names[r.actor_id] ?? "System" : "System",
      detail: r.reason ?? undefined,
    })),
    ...detail.assignment_history.map(r => ({
      key: `a-${r.id}`, when: r.created_at,
      title: r.from_agent_id
        ? `Reassigned: ${detail.actor_names[r.from_agent_id] ?? "Agent"} → ${detail.actor_names[r.to_agent_id ?? ""] ?? "Agent"}`
        : `Assigned to ${detail.actor_names[r.to_agent_id ?? ""] ?? "Agent"}`,
      actor: r.actor_id ? detail.actor_names[r.actor_id] ?? "System" : "System",
      detail: r.reason ?? `mode: ${r.mode}`,
    })),
  ].sort((a, b) => (a.when < b.when ? 1 : -1));

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 bg-background/40 p-6 text-center text-sm text-muted-foreground">
        No timeline events yet.
      </div>
    );
  }
  return (
    <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
      {rows.map(e => (
        <div key={e.key} className="rounded-xl border border-border/60 bg-card/40 p-3">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground">{e.title}</span>
            <span>{relative(e.when)}</span>
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">by {e.actor}</div>
          {e.detail && <div className="mt-1 text-xs text-foreground">{e.detail}</div>}
        </div>
      ))}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}