import { cn } from "@/lib/utils";
import type { CellState } from "@/services/permission-workspace.service";

const STYLES: Record<CellState, string> = {
  full: "bg-emerald-500/15 text-emerald-300",
  partial: "bg-amber-500/15 text-amber-200",
  none: "bg-muted/40 text-muted-foreground",
};

const BADGE_STYLES: Record<CellState, string> = {
  full: "bg-emerald-500/25 text-emerald-100",
  partial: "bg-amber-500/25 text-amber-100",
  none: "bg-muted-foreground/15 text-muted-foreground",
};

const LABELS: Record<CellState, string> = {
  full: "Full Access",
  partial: "Partial Access",
  none: "No Access",
};

export function PermissionStateCell({
  state,
  granted,
  total,
  onClick,
}: {
  state: CellState;
  granted?: number;
  total?: number;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-11 min-w-[110px] items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[12px] font-semibold tracking-wide transition",
        STYLES[state],
        onClick && "hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
      )}
      title={total != null ? `${granted}/${total} permissions granted` : LABELS[state]}
    >
      <span>{LABELS[state]}</span>
      {state === "partial" && total != null && (
        <span
          className={cn(
            "ml-1 rounded-md px-1.5 py-0.5 font-mono text-[12px] leading-none",
            BADGE_STYLES[state],
          )}
        >
          {granted}/{total}
        </span>
      )}
    </button>
  );
}
