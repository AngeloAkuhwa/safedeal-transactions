import { Info, Lock } from "lucide-react";
import { AssignmentModeSelector } from "./AssignmentModeSelector";
import { AssignmentQuickActions } from "./AssignmentQuickActions";
import { CARD_CLASS } from "./helpers";
import type { OrchestrationPerms } from "@/hooks/useOrchestrationPerms";

export function AssignmentControlPanel(props: {
  mode: string;
  onModeChange: (v: string) => void;
  onAssignSelected: () => void;
  onAutoAssign: () => void;
  onAssignToMe: (reason: string) => void;
  selfAssignEnabled?: boolean;
  onRebalance: () => void;
  onEscalate: () => void;
  onBulkExport: () => void;
  isSenior: boolean;
  perms?: OrchestrationPerms;
  selectedCount: number;
  busy: string | null;
}) {
  return (
    <section className={CARD_CLASS}>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Assignment Control Panel</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Senior admin workforce control · Direct task distribution</p>
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[12px] font-medium text-amber-300">
          <Lock className="h-3 w-3" /> Senior Admin Only
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <AssignmentModeSelector value={props.mode} onChange={props.onModeChange} disabled={!props.isSenior} />
        <AssignmentQuickActions
          onAssignSelected={props.onAssignSelected}
          onAutoAssign={props.onAutoAssign}
          onAssignToMe={props.onAssignToMe}
          selfAssignEnabled={props.selfAssignEnabled}
          onRebalance={props.onRebalance}
          onEscalate={props.onEscalate}
          onBulkExport={props.onBulkExport}
          isSenior={props.isSenior}
          perms={props.perms}
          selectedCount={props.selectedCount}
          busy={props.busy}
        />
      </div>

      <div className="mt-5 flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3.5">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
        <div className="text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium text-primary">Assignment Control:</span> Select tasks from the queue below, choose an
          assignment mode, then execute. Auto-assign follows configured rules; Rebalance redistributes when agents are overloaded.
          Escalation moves work to the senior agent pool with an audited reason.
        </div>
      </div>
    </section>
  );
}