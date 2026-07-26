import { cn } from "@/lib/utils";
import type { CellState } from "@/services/permission-workspace.service";

const STYLES: Record<CellState, string> = {
  full: "bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/30",
  partial: "bg-amber-500/15 text-amber-200 ring-1 ring-inset ring-amber-500/30",
  none: "bg-muted/30 text-muted-foreground ring-1 ring-inset ring-border/60",
};

const LABELS: Record<CellState, string> = {
  full: "Full",
  partial: "Limited",
  none: "None",
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
  const label = state === "partial" && granted != null && total != null
    ? `${granted}/${total}`
    : LABELS[state];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-7 min-w-[92px] w-full items-center justify-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold tracking-wide transition",
        STYLES[state],
        onClick && "hover:brightness-110 hover:ring-primary/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
      )}
      title={total != null ? `${granted}/${total} permissions granted` : LABELS[state]}
    >
      <span>{LABELS[state]}</span>
      {state === "partial" && total != null && (
        <span className="rounded-sm bg-amber-500/20 px-1 font-mono text-[10px] leading-none text-amber-100">
          {granted}/{total}
        </span>
      )}
    </button>
  );
}
