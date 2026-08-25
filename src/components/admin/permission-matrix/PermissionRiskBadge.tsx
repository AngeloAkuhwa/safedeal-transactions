import { ShieldAlert, ShieldCheck, ShieldX, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { ADMIN_TONE } from "@/components/admin/palette";
import type { PermissionRiskLevel } from "@/services/permission-catalog";

const RISK_STYLE: Record<PermissionRiskLevel, { cls: string; label: string; Icon: typeof Shield }> = {
  low:      { cls: `${ADMIN_TONE.success.panel} text-emerald-300`, label: "Low",      Icon: ShieldCheck },
  medium:   { cls: "border-sky-500/30 bg-sky-500/10 text-sky-300",             label: "Medium",   Icon: Shield },
  high:     { cls: "border-amber-500/40 bg-amber-500/10 text-amber-300",       label: "High",     Icon: ShieldAlert },
  critical: { cls: "border-rose-500/40 bg-rose-500/10 text-rose-300",          label: "Critical", Icon: ShieldX },
};

export function PermissionRiskBadge(
  props:
    | { risk: PermissionRiskLevel; size?: "sm" | "xs" }
    | { privileged: boolean; size?: "sm" | "xs" },
) {
  const size = props.size ?? "sm";
  const risk: PermissionRiskLevel =
    "risk" in props ? props.risk : props.privileged ? "high" : "low";
  const { cls, label, Icon } = RISK_STYLE[risk];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium",
        size === "xs" ? "text-xs" : "text-xs",
        cls,
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}
