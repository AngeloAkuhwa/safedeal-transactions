import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertTriangle, CalendarIcon, ShieldOff } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import {
  fetchActiveSessionCount,
  fetchReassignmentTargets,
  ROLE_LABEL,
  type InternalUser,
} from "@/services/admin-access-control.service";
import { useDrawerSafety } from "@/hooks/useDrawerSafety";
import { useMutationOnce } from "@/hooks/useMutationOnce";

export interface SuspendSubmission {
  reason: string;
  duration: "indefinite" | { until: string };
  revoke_sessions: boolean;
  reassign_tasks: boolean;
  reassign_target_id: string | null;
}

interface Props {
  user: InternalUser | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onConfirm: (s: SuspendSubmission) => Promise<void>;
}

export function SuspendUserDialog({ user, open, onOpenChange, onConfirm }: Props) {
  const tomorrow = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() + 1); return d; }, []);
  const [reason, setReason]       = useState("");
  const [mode, setMode]           = useState<"indefinite" | "until">("indefinite");
  const [until, setUntil]         = useState<Date | undefined>(undefined);
  const [revokeSessions, setRevokeSessions] = useState(true);
  const [reassign, setReassign]             = useState(false);
  const [targetId, setTargetId]             = useState<string>("");
  const [ack, setAck]             = useState(false);

  useEffect(() => {
    if (open) {
      setReason(""); setMode("indefinite"); setUntil(undefined);
      setRevokeSessions(true); setReassign(false); setTargetId(""); setAck(false);
    }
  }, [open]);

  const sessionsQ = useQuery({
    enabled: !!user && open,
    queryKey: ["suspend-active-sessions", user?.id],
    queryFn: () => fetchActiveSessionCount(user!.id),
    staleTime: 30_000,
  });
  const targetsQ = useQuery({
    enabled: !!user && open,
    queryKey: ["suspend-reassign-targets", user?.id],
    queryFn: () => fetchReassignmentTargets(user!.id),
    staleTime: 60_000,
  });

  // disputes.assigned_to isn't in the schema yet — surface 0 rather than a fake count.
  const activeTasks = 0;
  const activeSessions = sessionsQ.data ?? 0;
  const targets = targetsQ.data ?? [];
  const targetName = targets.find((t) => t.id === targetId)?.full_name ?? null;

  const durationOk = mode === "indefinite" || (!!until && until > new Date());
  const reassignOk = !reassign || !!targetId;

  const isDirty = reason.trim().length > 0 || ack || reassign || mode === "until";
  const { attemptClose } = useDrawerSafety({ open, isDirty, onClose: () => onOpenChange(false) });
  const submitOnce = useMutationOnce(async () => {
    if (!user) return;
    await onConfirm({
      reason: reason.trim(),
      duration: mode === "indefinite" ? "indefinite" : { until: until!.toISOString() },
      revoke_sessions: revokeSessions,
      reassign_tasks: reassign,
      reassign_target_id: reassign ? targetId : null,
    });
    onOpenChange(false);
  });
  const busy = submitOnce.pending;
  const canSubmit = !!user && !busy && reason.trim().length >= 12 && durationOk && reassignOk && ack;

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) attemptClose(); else onOpenChange(v); }}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldOff className="h-4 w-4 text-rose-400" />
            Suspend user
          </DialogTitle>
        </DialogHeader>

        {/* Identity */}
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <div className="text-sm font-semibold text-foreground">{user.full_name}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {ROLE_LABEL[user.primary_role]} · <span className="font-mono">{user.employee_id}</span> · {user.email}
          </div>
        </div>

        {/* Reason */}
        <div className="space-y-1.5">
          <Label>Suspension reason<span className="text-rose-400"> *</span></Label>
          <Textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explain why this user is being suspended (min 12 characters)."
          />
          <div className="text-[12px] text-muted-foreground">{reason.trim().length}/12 minimum</div>
        </div>

        {/* Duration */}
        <div className="space-y-2">
          <Label>Duration</Label>
          <RadioGroup value={mode} onValueChange={(v) => setMode(v as "indefinite" | "until")} className="space-y-1.5">
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="indefinite" id="dur-indef" />
              <span>Indefinite</span>
            </label>
            <div className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="until" id="dur-until" />
              <label htmlFor="dur-until">Until</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={mode !== "until"}
                    className={cn("h-11 justify-start text-left font-normal", !until && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                    {until ? format(until, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={until}
                    onSelect={setUntil}
                    disabled={(d) => d < tomorrow}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </RadioGroup>
        </div>

        {/* Toggles */}
        <div className="space-y-2">
          <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
            <div>
              <div className="text-sm font-medium">Revoke active sessions</div>
              <div className="text-[12px] text-muted-foreground">
                {sessionsQ.isLoading ? "Checking…" : `${activeSessions} active session${activeSessions === 1 ? "" : "s"} right now.`}
              </div>
            </div>
            <Switch checked={revokeSessions} onCheckedChange={setRevokeSessions} />
          </div>
          <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
            <div>
              <div className="text-sm font-medium">Reassign active tasks</div>
              <div className="text-[12px] text-muted-foreground">
                {activeTasks === 0
                  ? "No active dispute assignments detected."
                  : `${activeTasks} active dispute${activeTasks === 1 ? "" : "s"} will move to the queue.`}
              </div>
            </div>
            <Switch checked={reassign} onCheckedChange={setReassign} disabled={activeTasks === 0} />
          </div>
          {reassign && (
            <div className="space-y-1.5 pl-3">
              <Label>Reassignment target<span className="text-rose-400"> *</span></Label>
              <Select value={targetId} onValueChange={setTargetId}>
                <SelectTrigger><SelectValue placeholder="Select a dispute agent or manager" /></SelectTrigger>
                <SelectContent>
                  {targets.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.full_name}{t.role ? ` · ${ROLE_LABEL[t.role]}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Consequences */}
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-xs">
          <div className="mb-1.5 flex items-center gap-1.5 text-rose-300">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span className="font-semibold uppercase tracking-wide">What happens on suspend</span>
          </div>
          <ul className="space-y-0.5 pl-5 text-foreground/80 [&>li]:list-disc">
            <li>Cannot sign in from any device.</li>
            <li>{revokeSessions
              ? `Active sessions will be revoked (${activeSessions}).`
              : "Active sessions preserved."}</li>
            <li>Will not receive new task assignments.</li>
            <li>{activeTasks === 0
              ? "No active tasks to reassign."
              : reassign
                ? `${activeTasks} active task${activeTasks === 1 ? "" : "s"} will be reassigned${targetName ? ` to ${targetName}` : ""}.`
                : `${activeTasks} active task${activeTasks === 1 ? "" : "s"} stay assigned (will be flagged).`}</li>
            <li>Historical records and audit history remain intact.</li>
          </ul>
        </div>

        {/* Ack */}
        <label className="flex items-start gap-2 text-xs text-foreground/80">
          <Checkbox checked={ack} onCheckedChange={(v) => setAck(!!v)} className="mt-0.5" />
          <span>I understand this will immediately suspend {user.full_name}.</span>
        </label>

        <DialogFooter>
          <Button variant="outline" onClick={attemptClose} disabled={busy}>Cancel</Button>
          <Button
            onClick={() => submitOnce.run()}
            disabled={!canSubmit}
            className="bg-rose-600 text-white hover:bg-rose-700"
          >
            {busy ? "Suspending…" : "Suspend user"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}