import { useState } from "react";
import { Bolt, UserCheck, RotateCw, UserPlus, ArrowLeftRight, ArrowUpRightFromSquare, Download, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { TONE } from "./helpers";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import type { OrchestrationPerms } from "@/hooks/useOrchestrationPerms";

interface Action {
  id: string;
  icon: any;
  label: string;
  desc: string;
  onClick: () => void;
  primary?: boolean;
  tone?: "primary" | "warning" | "muted";
  disabled?: boolean;
  title?: string;
}

export function AssignmentQuickActions({
  onAssignSelected, onAutoAssign, onAssignToMe, onRebalance, onEscalate, onBulkExport,
  isSenior, perms, selectedCount, busy, selfAssignEnabled,
}: {
  onAssignSelected: () => void;
  onAutoAssign: () => void;
  onAssignToMe: (reason: string) => void;
  onRebalance: () => void;
  onEscalate: () => void;
  onBulkExport: () => void;
  isSenior: boolean;
  perms?: OrchestrationPerms;
  selectedCount: number;
  busy: string | null;
  selfAssignEnabled?: boolean;
}) {
  // Prefer granular flags when provided; fall back to the isSenior gate.
  const gate = (flag: boolean | undefined) => (perms ? !flag : !isSenior);
  const [selfOpen, setSelfOpen] = useState(false);
  const [selfReason, setSelfReason] = useState("");
  const selfBlocked = gate(perms?.canAssignSelf) || selfAssignEnabled === false;
  const actions: Action[] = [
    { id: "assign_selected", icon: UserCheck, label: `Assign Selected${selectedCount ? ` (${selectedCount})` : ""}`, desc: "Manually assign checked tasks to chosen agent", onClick: onAssignSelected, primary: true, disabled: gate(perms?.canBulkAssign ?? perms?.canAssign) || selectedCount === 0 },
    { id: "auto_assign", icon: RotateCw, label: "Auto Assign", desc: "Distribute using active assignment mode", onClick: onAutoAssign, disabled: gate(perms?.canAssign) },
    {
      id: "assign_to_me", icon: UserPlus, label: "Assign To Me",
      desc: "Take ownership of selected tasks",
      onClick: () => { setSelfReason(""); setSelfOpen(true); },
      disabled: selfBlocked || selectedCount === 0,
      title: selfAssignEnabled === false
        ? "Self-assignment is disabled in the current assignment rules"
        : gate(perms?.canAssignSelf) ? "You do not have the self-assign permission" : undefined,
    },
    { id: "rebalance", icon: ArrowLeftRight, label: "Rebalance", desc: "Redistribute load across all agents", onClick: onRebalance, disabled: gate(perms?.canRebalance) },
    { id: "escalate", icon: ArrowUpRightFromSquare, label: "Escalate", desc: "Move to senior agent pool", onClick: onEscalate, tone: "warning", disabled: gate(perms?.canEscalate) || selectedCount === 0 },
    { id: "bulk_export", icon: Download, label: "Bulk Export", desc: "Export assignment data & logs", onClick: onBulkExport, disabled: gate(perms?.canExport) },
  ];
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-4 lg:col-span-2">
      <div className="mb-4 flex items-center gap-2">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${TONE.success}`}>
          <Bolt className="h-4 w-4" />
        </div>
        <div>
          <div className="text-sm font-semibold text-foreground">Quick Actions</div>
          <div className="text-xs text-muted-foreground">Execute assignment operations</div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {actions.map(a => (
          <button
            key={a.id}
            type="button"
            onClick={a.onClick}
            disabled={a.disabled}
            title={a.disabled ? a.title : undefined}
            className={cn(
              "group flex min-h-11 flex-col items-start gap-1 rounded-xl border px-4 py-3 text-left text-sm font-medium backdrop-blur-sm transition",
              a.primary
                ? "border-primary/40 bg-primary/15 text-primary-foreground hover:bg-primary/25"
                : a.tone === "warning"
                ? "border-amber-500/30 bg-amber-500/10 text-amber-100 hover:bg-amber-500/15"
                : "border-border/60 bg-background/60 text-foreground hover:border-primary/40 hover:bg-card/80",
              a.disabled && "cursor-not-allowed opacity-50 hover:bg-inherit",
            )}
          >
            <div className="flex items-center gap-2">
              {busy === a.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <a.icon className="h-4 w-4" />}
              <span>{a.label}</span>
            </div>
            <span className={cn("text-[11px] font-normal", a.primary ? "text-primary-foreground/80" : "text-muted-foreground")}>
              {a.desc}
            </span>
          </button>
        ))}
      </div>

      <Dialog open={selfOpen} onOpenChange={setSelfOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign {selectedCount} task{selectedCount === 1 ? "" : "s"} to yourself</DialogTitle>
            <DialogDescription>Self-assignment is audited. Give a reason (min 8 characters).</DialogDescription>
          </DialogHeader>
          <div>
            <Label className="text-xs">Reason</Label>
            <Textarea
              className="mt-1 min-h-[90px]"
              value={selfReason}
              onChange={(e) => setSelfReason(e.target.value)}
              placeholder="Why are you taking ownership of this work?"
            />
            <div className="mt-1 text-[11px] text-muted-foreground">{selfReason.trim().length}/8</div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelfOpen(false)}>Cancel</Button>
            <Button
              disabled={selfReason.trim().length < 8}
              onClick={() => { setSelfOpen(false); onAssignToMe(selfReason.trim()); }}
            >
              Assign to me
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}