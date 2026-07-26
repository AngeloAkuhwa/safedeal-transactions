import { cn } from "@/lib/utils";
import type { CellState } from "@/services/permission-workspace.service";

const STYLES: Record<CellState, string> = {
  full: "bg-emerald-500 text-white",
  partial: "bg-amber-500 text-white",
  none: "bg-muted text-muted-foreground",
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
        "inline-flex h-8 w-full items-center justify-center rounded-md text-xs font-semibold transition",
        STYLES[state],
        onClick && "hover:opacity-90 hover:ring-2 hover:ring-primary/40",
      )}
      title={total != null ? `${granted}/${total} permissions granted` : LABELS[state]}
    >
      {state === "partial" ? "Limited" : LABELS[state]}
      {state === "partial" && total != null && (
        <span className="ml-1 opacity-80">({granted}/{total})</span>
      )}
    </button>
  );
}
