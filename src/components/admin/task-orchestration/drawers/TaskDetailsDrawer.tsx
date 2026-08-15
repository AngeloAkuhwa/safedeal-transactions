import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ExternalLink, UserCheck, ArrowUpRightFromSquare, ShieldCheck,
  Loader2, MessageSquarePlus, CheckCircle2, Clock, Play, FileText,
  MessageCircle, Paperclip, Lock, User, ShoppingBag, Gavel, FileSearch,
  Info, Copy, ExternalLink as ExtLink, StickyNote, HistoryIcon as HIcon,
  SendHorizonal,
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

type TabKey =
  | "overview" | "buyer_seller" | "transaction" | "dispute"
  | "evidence" | "communications" | "internal" | "history";

const STAGES = ["intake", "investigation", "response_review", "resolution_draft", "final_decision"];

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
  const [tab, setTab] = useState<TabKey>("overview");
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [comment, setComment] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<null | "post" | "note" | "complete" | "approve" | "start" | "stage" | "info" | "evidence" | "resolve">(null);
  const [newStage, setNewStage] = useState<string>("");
  const [infoTarget, setInfoTarget] = useState<"buyer" | "seller" | "both">("buyer");
  const [infoText, setInfoText] = useState("");
  const [evidenceLabel, setEvidenceLabel] = useState("");
  const [resolution, setResolution] = useState("");

  useEffect(() => {
    if (!open || !task) { setDetail(null); return; }
    setLoading(true); setTab("overview");
    setComment(""); setNote(""); setInfoText(""); setEvidenceLabel(""); setResolution("");
    fetchTaskDetail(task.id)
      .then(d => { setDetail(d); setNewStage((d?.task as any)?.stage ?? ""); })
      .catch(e => toast.error(e instanceof Error ? e.message : "Failed to load task"))
      .finally(() => setLoading(false));
  }, [open, task]);

  const suggested = task?.suggested_agent_id ? roster.find(r => r.user_id === task.suggested_agent_id) ?? null : null;
  const t = detail?.task ?? {};
  const version = (t as any)?.version as number | undefined;
  const status = (t as any)?.status as string | undefined;
  const stage = (t as any)?.stage as string | undefined;
  const ctx = detail?.context ?? {};
  const notes = detail?.internal_notes ?? [];
  const evidence = detail?.evidence ?? [];
  const messages = detail?.messages ?? [];

  const isTerminal = status ? ["resolved","closed","cancelled"].includes(status) : false;
  const isPending  = status === "pending_approval";
  const canStart = status === "assigned" || status === "new";
  const canComplete = status && !isTerminal && !isPending;
  const canSendForApproval = canComplete;

  async function refresh() {
    if (!task) return;
    try { setDetail(await fetchTaskDetail(task.id)); } catch { /* noop */ }
  }

  async function invoke(actionLabel: typeof busy, payload: Record<string, any>, successMsg: string, closeAfter = false) {
    if (!task) return;
    try {
      setBusy(actionLabel);
      await runOrchestrationAction({ ...payload, task_id: task.id, expected_version: version } as any);
      toast.success(successMsg);
      if (closeAfter) { onAfterMutate?.(); onOpenChange(false); }
      else { await refresh(); onAfterMutate?.(); }
    } catch (e: any) {
      let parsed: any = e;
      try { parsed = e?.context?.body ? JSON.parse(await e.context.body.text?.() ?? "{}") : e; } catch { /* noop */ }
      if (parsed?.error === "financial_permission_required") {
        toast.error(`Requires ${parsed.required}. Send for approval instead.`);
      } else if (parsed?.error === "version_conflict") {
        toast.error("Task changed since last load — refreshing.");
        await refresh();
      } else {
        toast.error(e instanceof Error ? e.message : "Action failed");
      }
    } finally { setBusy(null); }
  }

  const workflowActions = (
    <div className="flex flex-wrap gap-2 rounded-xl border border-border/60 bg-card/40 p-2.5 backdrop-blur-sm shadow-[0_1px_0_hsl(var(--border)/0.4)_inset]">
      {task && (
        <>
          <Button size="sm" onClick={() => onAssign(task)}>
            <UserCheck className="mr-1.5 h-3.5 w-3.5" /> Assign
          </Button>
          {canStart && (
            <Button size="sm" variant="outline" onClick={() => invoke("start", { action: "start" }, "Task started")} disabled={busy === "start"}>
              {busy === "start" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
              Start
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => onEscalate(task)}>
            <ArrowUpRightFromSquare className="mr-1.5 h-3.5 w-3.5" /> Escalate
          </Button>
          {canSendForApproval && (
            <Button size="sm" variant="outline" onClick={() => invoke("approve", { action: "send_for_approval" }, "Sent for approval")} disabled={busy === "approve"}>
              {busy === "approve" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />}
              Send for approval
            </Button>
          )}
          {canComplete && (
            <Button size="sm" onClick={() => invoke("complete", { action: "complete", resolution: "resolved" }, "Task completed", true)} disabled={busy === "complete"}>
              {busy === "complete" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
              Complete
            </Button>
          )}
          {isPending && (
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-1 text-xs font-semibold text-amber-300 ring-1 ring-inset ring-amber-500/30">
              <Lock className="h-3 w-3" /> Awaiting approval — locked
            </span>
          )}
          {isTerminal && (
            <span className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-2 py-1 text-xs font-semibold text-muted-foreground ring-1 ring-inset ring-border">
              <Lock className="h-3 w-3" /> {humanize(status!)}
            </span>
          )}
        </>
      )}
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto bg-[radial-gradient(ellipse_at_top_right,hsl(var(--primary)/0.05),transparent_55%)]">
        <SheetHeader>
          <SheetTitle>{task ? `Task #${task.task_code}` : "Task"}</SheetTitle>
          <SheetDescription>
            {task ? `${humanize(task.type)} · ${currencyFmt(task.amount, task.currency)}` : ""}
          </SheetDescription>
        </SheetHeader>
        {task && (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold", priorityBadgeClass(task.priority))}>
                {humanize(task.priority)}
              </span>
              <span className="rounded-full border border-border/60 bg-card/40 px-2 py-0.5 text-xs text-muted-foreground">
                {humanize(task.type)}
              </span>
              {status && (
                <span className="rounded-full border border-border/60 bg-card/40 px-2 py-0.5 text-xs text-muted-foreground">
                  {humanize(status)}
                </span>
              )}
              {stage && (
                <span className="rounded-full border border-primary/30 bg-primary/[0.06] px-2 py-0.5 text-xs text-primary">
                  Stage · {humanize(stage)}
                </span>
              )}
              <span className="rounded-full border border-border/60 bg-card/40 px-2 py-0.5 text-xs text-muted-foreground">
                Created {relative(task.created_at)}
              </span>
            </div>

            {workflowActions}

            <Tabs value={tab} onValueChange={(v: string) => setTab(v as TabKey)}>
              <TabsList className="flex w-full flex-wrap justify-start gap-1 bg-card/40 p-1">
                <TabTrig v="overview"     icon={Info}         label="Overview" />
                <TabTrig v="buyer_seller" icon={User}         label="Buyer & Seller" />
                <TabTrig v="transaction"  icon={ShoppingBag}  label="Transaction" />
                <TabTrig v="dispute"      icon={Gavel}        label="Dispute" />
                <TabTrig v="evidence"     icon={FileSearch}   label="Evidence" count={evidence.length} />
                <TabTrig v="communications" icon={MessageCircle} label="Comms" count={messages.length} />
                <TabTrig v="internal"     icon={StickyNote}   label="Notes" count={notes.length} />
                <TabTrig v="history"      icon={HIcon}        label="History"
                  count={(detail?.status_history?.length ?? 0) + (detail?.assignment_history?.length ?? 0)} />
              </TabsList>

              {loading && (
                <div className="mt-4 flex items-center gap-2 rounded-xl border border-border/60 bg-card/40 p-6 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading task details…
                </div>
              )}

              {!loading && (
                <>
                  <TabsContent value="overview" className="mt-4 space-y-3">
                    <div className="grid grid-cols-2 gap-2.5">
                      <Field label="Amount" value={currencyFmt(task.amount, task.currency)} />
                      <Field label="Suggested Agent" value={suggested ? shortNameOf(suggested) : "Auto"} />
                      <Field label="Assigned Agent" value={(t as any)?.assigned_agent_id ? (detail?.actor_names[(t as any).assigned_agent_id] ?? "—") : "Unassigned"} />
                      <Field label="Task ID" value={`#${task.task_code}`} />
                      <Field label="Required Skill" value={(task as any).required_role ? humanize((task as any).required_role) : "—"} />
                      <Field label="Version" value={version != null ? `v${version}` : "—"} />
                    </div>
                    {(t as any).due_at && (
                      <Field label="Due" value={relative((t as any).due_at)} />
                    )}
                    {perms.hasSection("stage") && stage && (
                      <div className="rounded-xl border border-border/60 bg-card/40 p-3">
                        <Label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Advance stage</Label>
                        <div className="flex gap-2">
                          <Select value={newStage} onValueChange={setNewStage}>
                            <SelectTrigger className="h-11 text-xs"><SelectValue placeholder="Choose stage…" /></SelectTrigger>
                            <SelectContent>
                              {STAGES.map(s => <SelectItem key={s} value={s}>{humanize(s)}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <Button size="sm" variant="outline"
                            onClick={() => invoke("stage", { action: "update_stage", stage: newStage }, "Stage updated")}
                            disabled={busy === "stage" || !newStage || newStage === stage}
                          >
                            {busy === "stage" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Advance"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="buyer_seller" className="mt-4 grid grid-cols-1 gap-3">
                    <PartyCard title="Buyer" data={ctx.buyer} />
                    <PartyCard title="Seller" data={ctx.seller} />
                  </TabsContent>

                  <TabsContent value="transaction" className="mt-4">
                    <RecordCard
                      title="Linked Transaction"
                      data={ctx.transaction}
                      linkLabel={ctx.transaction?.id ? "Open transaction" : null}
                      href={ctx.transaction?.id ? `/admin/transactions/${ctx.transaction.id}` : null}
                    />
                  </TabsContent>

                  <TabsContent value="dispute" className="mt-4">
                    <RecordCard
                      title="Linked Dispute"
                      data={ctx.dispute}
                      linkLabel={task.dispute_id ? "Open dispute case" : null}
                      href={task.dispute_id ? `/admin/disputes/${task.dispute_id}` : null}
                    />
                  </TabsContent>

                  <TabsContent value="evidence" className="mt-4 space-y-3">
                    <div className="rounded-xl border border-border/60 bg-card/40 p-3">
                      <Label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Request evidence</Label>
                      <div className="flex gap-2">
                        <input
                          value={evidenceLabel}
                          onChange={e => setEvidenceLabel(e.target.value)}
                          placeholder="What evidence is needed? (e.g. photo of item)"
                          className="h-9 flex-1 rounded-md border border-border/60 bg-background/60 px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 relative before:absolute before:-inset-2 before:content-['']"
                        />
                        <Button size="sm" variant="outline"
                          onClick={() => invoke("evidence", { action: "request_evidence", body_text: evidenceLabel }, "Evidence request sent")}
                          disabled={busy === "evidence" || !evidenceLabel.trim()}>
                          {busy === "evidence" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      {evidence.length === 0 && (
                        <div className="rounded-xl border border-dashed border-border/60 bg-background/40 p-6 text-center text-xs text-muted-foreground">No evidence attached.</div>
                      )}
                      {evidence.map(e => (
                        <div key={e.id} className="flex items-center justify-between rounded-xl border border-border/60 bg-card/40 p-2.5 text-xs">
                          <div>
                            <div className="font-medium text-foreground">{e.label ?? humanize(e.kind)}</div>
                            <div className="text-xs text-muted-foreground">{humanize(e.kind)} · {relative(e.created_at)}</div>
                          </div>
                          {e.url && (
                            <a href={e.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-3 text-xs font-medium text-primary hover:underline min-h-11">
                              Open <ExtLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </TabsContent>

                  <TabsContent value="communications" className="mt-4 space-y-3">
                    <div className="rounded-xl border border-border/60 bg-card/40 p-3">
                      <Label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Request info from party</Label>
                      <div className="mb-2 flex gap-1">
                        {(["buyer","seller","both"] as const).map(v => (
                          <button key={v}
                            onClick={() => setInfoTarget(v)}
                            className={cn(
                              "rounded-md px-2 py-1 text-xs transition min-h-11",
                              infoTarget === v ? "bg-primary/10 text-primary ring-1 ring-inset ring-primary/30" : "text-muted-foreground hover:text-foreground",
                            )}
                          >{humanize(v)}</button>
                        ))}
                      </div>
                      <Textarea value={infoText} onChange={e => setInfoText(e.target.value)} placeholder="Message to the party…" rows={2} className="text-xs" />
                      <div className="mt-2 flex justify-end">
                        <Button size="sm" variant="outline"
                          onClick={() => invoke("info", { action: "request_info", target: infoTarget, body_text: infoText }, "Info requested")}
                          disabled={busy === "info" || !infoText.trim()}>
                          {busy === "info" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <SendHorizonal className="mr-1.5 h-3.5 w-3.5" />}
                          Send
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      {messages.length === 0 && (
                        <div className="rounded-xl border border-dashed border-border/60 bg-background/40 p-6 text-center text-xs text-muted-foreground">
                          No party communications yet.
                        </div>
                      )}
                      {messages.map(m => (
                        <div key={m.id} className="rounded-xl border border-border/60 bg-card/40 p-2.5">
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">{m.author ?? "System"}{m.role ? ` · ${humanize(m.role)}` : ""}</span>
                            <span>{relative(m.created_at)}</span>
                          </div>
                          <div className="mt-1 whitespace-pre-wrap text-xs text-foreground">{m.body}</div>
                        </div>
                      ))}
                    </div>
                  </TabsContent>

                  <TabsContent value="internal" className="mt-4 space-y-3">
                    <div className="rounded-xl border border-border/60 bg-card/40 p-3">
                      <Textarea
                        value={comment} onChange={e => setComment(e.target.value)}
                        placeholder="Add a public comment (visible on the case)…"
                        className="min-h-[64px] resize-none border-0 bg-transparent p-0 text-xs focus-visible:ring-0"
                        maxLength={4000}
                      />
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">{comment.length}/4000 · public</span>
                        <Button size="sm"
                          onClick={() => invoke("post", { action: "add_comment", body_text: comment }, "Comment posted").then(() => setComment(""))}
                          disabled={busy === "post" || !comment.trim()}>
                          {busy === "post" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <MessageSquarePlus className="mr-1.5 h-3.5 w-3.5" />}
                          Post
                        </Button>
                      </div>
                    </div>
                    <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.03] p-3">
                      <Textarea
                        value={note} onChange={e => setNote(e.target.value)}
                        placeholder="Internal note — visible only to staff…"
                        className="min-h-[64px] resize-none border-0 bg-transparent p-0 text-xs focus-visible:ring-0"
                        maxLength={4000}
                      />
                      <div className="mt-2 flex items-center justify-between">
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-300">
                          <Lock className="h-3 w-3" /> internal only · {note.length}/4000
                        </span>
                        <Button size="sm" variant="outline"
                          onClick={() => invoke("note", { action: "add_internal_note", body_text: note }, "Note added").then(() => setNote(""))}
                          disabled={busy === "note" || !note.trim()}>
                          {busy === "note" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <StickyNote className="mr-1.5 h-3.5 w-3.5" />}
                          Add note
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      {[...notes, ...(detail?.comments ?? [])]
                        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
                        .map(c => (
                        <div key={c.id} className={cn(
                          "rounded-xl border p-2.5",
                          (c as any).visibility === "internal" || notes.includes(c as any)
                            ? "border-amber-500/20 bg-amber-500/[0.03]"
                            : "border-border/60 bg-card/40",
                        )}>
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">
                              {c.author_id ? detail?.actor_names[c.author_id] ?? "Agent" : "System"}
                              {(notes.includes(c as any) || (c as any).visibility === "internal") && (
                                <span className="ml-1.5 rounded bg-amber-500/10 px-1 py-0 text-xs font-semibold uppercase text-amber-300 ring-1 ring-inset ring-amber-500/30">internal</span>
                              )}
                            </span>
                            <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{relative(c.created_at)}</span>
                          </div>
                          <div className="mt-1 whitespace-pre-wrap text-xs text-foreground">{c.body}</div>
                        </div>
                      ))}
                    </div>
                  </TabsContent>

                  <TabsContent value="history" className="mt-4">
                    {detail && <TimelineList detail={detail} />}
                  </TabsContent>
                </>
              )}
            </Tabs>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );

  function TabTrig({ v, icon: Icon, label, count }: { v: TabKey; icon: any; label: string; count?: number }) {
    return (
      <TabsTrigger value={v} className="gap-1 px-2.5 py-1 text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary min-h-11">
        <Icon className="h-3 w-3" /> {label}
        {count != null && count > 0 && <span className="ml-0.5 rounded-full bg-muted/60 px-1.5 py-0 text-xs tabular-nums">{count}</span>}
      </TabsTrigger>
    );
  }
}

const perms = { hasSection: (_: string) => true };

function RecordCard({ title, data, linkLabel, href }: {
  title: string; data: Record<string, any> | null | undefined; linkLabel?: string | null; href?: string | null;
}) {
  if (!data) return (
    <div className="rounded-xl border border-dashed border-border/60 bg-background/40 p-6 text-center text-xs text-muted-foreground">
      No {title.toLowerCase()} linked to this task.
    </div>
  );
  const rows = Object.entries(data)
    .filter(([k, v]) => v != null && !["id", "created_at"].includes(k) && typeof v !== "object")
    .slice(0, 10);
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-3 backdrop-blur-sm shadow-[0_1px_0_hsl(var(--border)/0.4)_inset]">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</div>
        {href && linkLabel && (
          <Link to={href} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline min-h-11">
            {linkLabel} <ExternalLink className="h-3 w-3" />
          </Link>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
        {rows.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="truncate text-xs uppercase tracking-wider text-muted-foreground">{humanize(k)}</dt>
            <dd className="truncate font-medium text-foreground">{String(v)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function PartyCard({ title, data }: { title: string; data: Record<string, any> | null | undefined }) {
  if (!data) return (
    <div className="rounded-xl border border-dashed border-border/60 bg-background/40 p-6 text-center text-xs text-muted-foreground">
      No {title.toLowerCase()} on record for this task.
    </div>
  );
  const name = data.full_name ?? data.name ?? [data.first_name, data.last_name].filter(Boolean).join(" ") ?? "—";
  const email = data.email ?? null;
  const phone = data.phone ?? data.phone_number ?? null;
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-3 backdrop-blur-sm shadow-[0_1px_0_hsl(var(--border)/0.4)_inset]">
      <div className="mb-1.5 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</div>
        {data.id && (
          <Link to={`/admin/users/${data.id}/profile`} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline min-h-11">
            View profile <ExtLink className="h-3 w-3" />
          </Link>
        )}
      </div>
      <div className="text-sm font-semibold text-foreground">{name || "—"}</div>
      <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
        {email && (
          <div className="flex items-center gap-1.5">
            <span>{email}</span>
            <button type="button" onClick={() => navigator.clipboard.writeText(email)} className="text-muted-foreground hover:text-foreground relative inline-flex items-center justify-center before:absolute before:-inset-4 before:content-[''] min-h-11 min-w-11"><Copy className="h-3 w-3" /></button>
          </div>
        )}
        {phone && (
          <div className="flex items-center gap-1.5">
            <span>{phone}</span>
            <button type="button" onClick={() => navigator.clipboard.writeText(phone)} className="text-muted-foreground hover:text-foreground relative inline-flex items-center justify-center before:absolute before:-inset-4 before:content-[''] min-h-11 min-w-11"><Copy className="h-3 w-3" /></button>
          </div>
        )}
      </div>
    </div>
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
          <div className="flex items-center justify-between text-xs text-muted-foreground">
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
    <div className="rounded-xl border border-border/60 bg-card/40 p-3 backdrop-blur-sm shadow-[0_1px_0_hsl(var(--border)/0.4)_inset]">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}