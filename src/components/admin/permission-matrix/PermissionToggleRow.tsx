import { Check, Minus, ShieldAlert, Clock, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { isPrivilegedPermission, type InternalRoleKey } from "@/services/permission-catalog";
import { checkRoleStageAllowed } from "@/services/role-guardrails";
import type { StagedOp } from "@/hooks/useStagedPermissionChanges";
import { PermissionRiskBadge } from "./PermissionRiskBadge";

interface Props {
  role: InternalRoleKey;
  permissionKey: string;
  currentlyGranted: boolean;
  canManage: boolean;
  activeSuperAdminCount?: number;
  stagedOp?: StagedOp;
  onToggle: (role: InternalRoleKey, key: string, currentlyGranted: boolean) => void;
  tone?: "granted" | "denied" | "privileged";
}

export function PermissionToggleRow({
  role, permissionKey, currentlyGranted, canManage, activeSuperAdminCount,
  stagedOp, onToggle, tone = "granted",
}: Props) {
  const label = permissionKey.split(".")[1] ?? permissionKey;
  const module = permissionKey.split(".")[0];
  const privileged = isPrivilegedPermission(permissionKey);

  const desiredOp: StagedOp = currentlyGranted ? "revoke" : "grant";
  const guard = canManage ? checkRoleStageAllowed(role, permissionKey, desiredOp, { activeSuperAdminCount }) : { ok: true } as ReturnType<typeof checkRoleStageAllowed>;
  const disabled = !canManage || (guard as any).blocked === true;

  const effectivelyGranted = stagedOp
    ? stagedOp === "grant"
    : currentlyGranted;

  const shell =
    tone === "granted" ? "border-emerald-500/30 bg-emerald-500/5"
    : tone === "privileged" ? "border-amber-500/30 bg-amber-500/5"
    : "border-border bg-background/30";

  const IconLeft = tone === "privileged"
    ? ShieldAlert
    : effectivelyGranted ? Check : Minus;
  const iconColor = tone === "privileged"
    ? "text-amber-300"
    : effectivelyGranted ? "text-emerald-400" : "text-muted-foreground";

  const staged = !!stagedOp;

  return (
    <li className={cn("flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs", shell, staged && "ring-1 ring-primary/50")}>
      <IconLeft className={cn("h-3.5 w-3.5", iconColor)} />
      <span className="truncate" title={permissionKey}>{label}</span>
      <span className="ml-auto flex items-center gap-1.5">
        {privileged && <PermissionRiskBadge privileged size="xs" />}
        {staged && (
          <span className={cn(
            "inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase",
            stagedOp === "grant" ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300",
          )}>
            <Clock className="mr-0.5 h-2.5 w-2.5" />
            {stagedOp === "grant" ? "+ staged" : "− staged"}
          </span>
        )}
        <span className="font-mono text-[10px] text-muted-foreground">{module}</span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onToggle(role, permissionKey, currentlyGranted)}
          title={(guard as any).message ?? (canManage ? (effectivelyGranted ? "Stage revoke" : "Stage grant") : "Read-only")}
          className={cn(
            "inline-flex h-11 items-center gap-0.5 rounded-full border px-1.5 text-[10px] font-semibold transition",
            disabled && "cursor-not-allowed opacity-50",
            effectivelyGranted
              ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
              : "border-border bg-background hover:bg-muted",
          )}
        >
          {disabled && !canManage && <Lock className="h-2.5 w-2.5" />}
          {effectivelyGranted ? "ON" : "OFF"}
        </button>
      </span>
    </li>
  );
}