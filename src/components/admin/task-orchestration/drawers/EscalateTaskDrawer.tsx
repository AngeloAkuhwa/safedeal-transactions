import { useEffect, useMemo, useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import type { AgentRosterEntry } from "@/services/task-orchestration.service";
import { ADMIN_TONE } from "@/components/admin/palette";
import { nameOf } from "../helpers";

const TARGET_QUEUES = [
  { value: "senior_pool",    label: "Senior Pool" },
  { value: "escalation",     label: "Escalation Queue" },
  { value: "disputes",       label: "Disputes" },
  { value: "refunds",        label: "Refunds (financial)" },
  { value: "escrow",         label: "Escrow (financial)" },
  { value: "payouts",        label: "Payouts (financial)" },
  { value: "compliance",     label: "Compliance" },
  { value: "fraud",          label: "Fraud" },
];

export interface EscalatePayload {
  reason: string;
  target_queue?: string;
  target_team?: string;
  escalate_priority: "high" | "critical";
  internal_note?: string;
  requested_reviewer_id?: string;
}

export function EscalateTaskDrawer({
  open, onOpenChange, count, roster, onConfirm, submitting, currentOwners,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  count: number;
  roster: AgentRosterEntry[];
  currentOwners?: string[];
  onConfirm: (p: EscalatePayload) => void;
  submitting: boolean;
}) {
  const [reason, setReason] = useState("");
  const [targetQueue, setTargetQueue] = useState("senior_pool");
  const [targetTeam, setTargetTeam] = useState("");
  const [priority, setPriority] = useState<"high" | "critical">("high");
  const [internalNote, setInternalNote] = useState("");
  const [reviewer, setReviewer] = useState<string>("");

  useEffect(() => {
    if (open) {
      setReason(""); setTargetQueue("senior_pool"); setTargetTeam("");
      setPriority("high"); setInternalNote(""); setReviewer("");
    }
  }, [open]);

  const financial = ["refunds", "escrow", "payouts", "compliance", "fraud"].includes(targetQueue);
  const short = reason.trim().length < 20;

  const ownerNames = useMemo(() => {
    if (!currentOwners?.length) return "—";
    return currentOwners
      .map((id) => {
        const r = roster.find((x) => x.user_id === id);
        return r ? nameOf(r) : id.slice(0, 8);
      })
      .join(", ");
  }, [currentOwners, roster]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Escalate {count} task{count === 1 ? "" : "s"}</SheetTitle>
          <SheetDescription>Move work to a senior/authorised queue. Every escalation is audited.</SheetDescription>
        </SheetHeader>

        <div className="mt-5 space-y-4">
          <div className="rounded-xl border border-border/60 bg-background/40 p-3">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Current owner</div>
                <div className="mt-0.5 text-foreground">{ownerNames}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">New target</div>
                <div className="mt-0.5 text-foreground">{TARGET_QUEUES.find((q) => q.value === targetQueue)?.label ?? targetQueue}</div>
              </div>
            </div>
            {financial && (
              <div className={`mt-3 flex items-start gap-2 rounded-lg border ${ADMIN_TONE.warning.panel} p-2 text-xs text-amber-200`}>
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5" />
                Financial / compliance target: only routable when the batch's task type matches the queue's authority.
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Target queue</Label>
              <Select value={targetQueue} onValueChange={setTargetQueue}>
                <SelectTrigger className="mt-1 h-11 bg-background/60"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TARGET_QUEUES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Escalation priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as any)}>
                <SelectTrigger className="mt-1 h-11 bg-background/60"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Team (optional)</Label>
              <Input className="mt-1 h-11 bg-background/60" value={targetTeam}
                onChange={(e) => setTargetTeam(e.target.value)} placeholder="e.g. financial-ops" />
            </div>
            <div>
              <Label className="text-xs">Requested reviewer (optional)</Label>
              <Select value={reviewer || "__any"} onValueChange={(v) => setReviewer(v === "__any" ? "" : v)}>
                <SelectTrigger className="mt-1 h-11 bg-background/60"><SelectValue placeholder="Any eligible" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__any">Any eligible</SelectItem>
                  {roster.map((a) => (
                    <SelectItem key={a.user_id} value={a.user_id}>{nameOf(a)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs">Escalation reason (required, min 20)</Label>
            <Textarea className="mt-1 min-h-[100px]" value={reason}
              onChange={(e) => setReason(e.target.value)} placeholder="Why is this being escalated?" />
            <div className="mt-1 text-xs text-muted-foreground">{reason.trim().length}/20</div>
          </div>

          <div>
            <Label className="text-xs">Internal note (staff-only, optional)</Label>
            <Textarea className="mt-1 min-h-[70px]" value={internalNote}
              onChange={(e) => setInternalNote(e.target.value)} placeholder="Context for the receiving reviewer" />
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary">SLA impact</Badge>
            <span>Escalation resets first-action clock; due date recomputed against new priority.</span>
          </div>
        </div>

        <SheetFooter className="mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onConfirm({
            reason,
            target_queue: targetQueue,
            target_team: targetTeam || undefined,
            escalate_priority: priority,
            internal_note: internalNote || undefined,
            requested_reviewer_id: reviewer || undefined,
          })} disabled={submitting || short}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Escalate
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}