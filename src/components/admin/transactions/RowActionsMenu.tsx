import { Eye, StickyNote, MessageSquare, Clock, ListOrdered, Snowflake, Sun, Flag, ShieldAlert, MoreVertical } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { AdminTxRow } from "@/services/admin-transactions-monitor.service";

export interface RowActionHandlers {
  onView: () => void;
  onAddNote: () => void;
  onMessages: () => void;
  onTimeline: () => void;
  onLedger: () => void;
  onFreeze: () => void;
  onUnfreeze: () => void;
  onFlagForReview: () => void;
  onEscalateDispute: () => void;
}

function MenuItem({ icon: Icon, label, disabled, reason, onSelect, danger }: { icon: typeof Eye; label: string; disabled?: boolean; reason?: string | null; onSelect: () => void; danger?: boolean; }) {
  const item = (
    <DropdownMenuItem
      onSelect={(e) => { if (disabled) { e.preventDefault(); return; } onSelect(); }}
      className={`flex items-center gap-2 ${disabled ? "cursor-not-allowed opacity-50" : ""} ${danger && !disabled ? "text-red-400 focus:text-red-300" : ""}`}
      aria-disabled={disabled || undefined}
    >
      <Icon className="h-4 w-4" /><span>{label}</span>
    </DropdownMenuItem>
  );
  if (!disabled || !reason) return item;
  return (<Tooltip><TooltipTrigger asChild><div>{item}</div></TooltipTrigger><TooltipContent side="left">{reason}</TooltipContent></Tooltip>);
}

export function RowActionsMenu({ row, handlers, align = "end", trigger }: { row: AdminTxRow; handlers: RowActionHandlers; align?: "start" | "end" | "center"; trigger?: React.ReactNode; }) {
  const a = row.actionAvailability;
  const isFrozen = !!a.canUnfreeze;
  return (
    <TooltipProvider delayDuration={150}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {trigger ?? (
            <button
              type="button"
              aria-label="More actions"
              onClick={(e) => e.stopPropagation()}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground min-h-11 min-w-11 inline-flex items-center justify-center"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align={align}
          className="w-56"
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenuLabel className="text-xs">#{row.transactionCode}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <MenuItem icon={Eye} label="View Details" onSelect={handlers.onView} />
          <MenuItem icon={StickyNote} label="Add Internal Note" onSelect={handlers.onAddNote} />
          <MenuItem icon={MessageSquare} label="Open Messages" onSelect={handlers.onMessages} />
          <MenuItem icon={Clock} label="View Timeline" onSelect={handlers.onTimeline} />
          <MenuItem icon={ListOrdered} label="View Ledger" onSelect={handlers.onLedger} />
          <DropdownMenuSeparator />
          {isFrozen ? (
            <MenuItem icon={Sun} label="Unfreeze Transaction" onSelect={handlers.onUnfreeze} disabled={!a.canUnfreeze} reason={a.unfreezeReason} />
          ) : (
            <MenuItem icon={Snowflake} label="Freeze Transaction" onSelect={handlers.onFreeze} disabled={!a.canFreeze} reason={a.freezeReason} danger />
          )}
          <MenuItem icon={Flag} label="Flag for Review" onSelect={handlers.onFlagForReview} disabled={!a.canFlagForReview} reason={a.flagReason} />
          <MenuItem icon={ShieldAlert} label="Escalate Dispute" onSelect={handlers.onEscalateDispute} disabled={!a.canEscalateDispute} reason={a.escalateReason} danger />
        </DropdownMenuContent>
      </DropdownMenu>
    </TooltipProvider>
  );
}