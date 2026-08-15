import { cn } from "@/lib/utils";
import { Check, X, PlusCircle, MinusCircle, Clock, Ban } from "lucide-react";
import type { PermissionRowState } from "@/services/permission-catalog";
import { PERMISSION_ROW_STATE_LABEL } from "@/services/permission-catalog";

const STATE_STYLE: Record<PermissionRowState, { cls: string; Icon: typeof Check }> = {
  granted:          { cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300", Icon: Check },
  denied:           { cls: "border-muted-foreground/25 bg-muted/40 text-muted-foreground", Icon: X },
  override_granted: { cls: "border-sky-500/40 bg-sky-500/10 text-sky-300", Icon: PlusCircle },
  override_denied:  { cls: "border-rose-500/40 bg-rose-500/10 text-rose-300", Icon: MinusCircle },
  pending:          { cls: "border-amber-500/40 bg-amber-500/10 text-amber-300", Icon: Clock },
  restricted:       { cls: "border-rose-500/40 bg-rose-500/10 text-rose-300", Icon: Ban },
};

export function PermissionRowStateBadge({ state, size = "sm" }: { state: PermissionRowState; size?: "sm" | "xs" }) {
  const { cls, Icon } = STATE_STYLE[state];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium",
        size === "xs" ? "text-[12px]" : "text-xs",
        cls,
      )}
    >
      <Icon className="h-3 w-3" />
      {PERMISSION_ROW_STATE_LABEL[state]}
    </span>
  );
}