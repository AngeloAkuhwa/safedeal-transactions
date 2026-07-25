import { CheckCircle2, ShieldAlert, ShieldCheck, Sparkles, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  ACCESS_LABEL,
  INTERNAL_ROLES,
  PERMISSION_MODULES,
  deriveAccessLevel,
  isProtectedRole,
  type InternalRoleKey,
} from "@/services/permission-catalog";

interface Props {
  role: InternalRoleKey | null;
  rolePermissions: string[] | undefined;
}

const KEY_ACTIONS = ["approve", "manage_permissions", "configure", "suspend"];

const LEVEL_BADGE: Record<string, string> = {
  full:     "bg-rose-500/15 text-rose-300 border-rose-500/40",
  high:     "bg-amber-500/15 text-amber-300 border-amber-500/40",
  standard: "bg-sky-500/15 text-sky-300 border-sky-500/40",
  limited:  "bg-slate-500/15 text-slate-300 border-slate-500/40",
};

/**
 * Right-column context panel for AddUserDrawer / ChangeRoleDrawer. Shows what
 * the currently-selected primary role can do, its derived access level, and
 * whether it needs approval when assigned.
 */
export function RoleSummaryCard({ role, rolePermissions }: Props) {
  if (!role) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center">
        <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-muted/60">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="text-sm font-medium text-foreground/80">No role selected</div>
        <div className="mt-1 text-xs text-muted-foreground">
          Pick a role to preview its access footprint.
        </div>
      </div>
    );
  }
  const def = INTERNAL_ROLES.find((r) => r.key === role);
  const perms = rolePermissions ?? [];
  const level = deriveAccessLevel(perms, [role]);
  const requiresApproval = isProtectedRole(role) || level === "full" || level === "high";

  const moduleKeys = new Set(perms.map((p) => p.split(".")[0]));
  const modules = PERMISSION_MODULES.filter((m) => moduleKeys.has(m.key));
  const key = perms.filter((p) => KEY_ACTIONS.some((a) => p.endsWith(`.${a}`))).slice(0, 6);
  const restricted = PERMISSION_MODULES
    .flatMap((m) => m.permissions)
    .filter((p) => p.action === "manage_permissions" || p.action === "approve" || p.action === "configure")
    .filter((p) => !perms.includes(p.key))
    .slice(0, 4);

  return (
    <div className="animate-in fade-in-50 rounded-xl border border-border bg-card p-4 shadow-sm space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-base font-semibold text-foreground">{def?.name ?? role}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{def?.description}</div>
        </div>
        <Badge variant="outline" className={`shrink-0 ${LEVEL_BADGE[level] ?? ""}`}>
          {ACCESS_LABEL[level]}
        </Badge>
      </div>

      {requiresApproval && (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-300">
          <ShieldAlert className="h-3.5 w-3.5" /> Requires approval before activation.
        </div>
      )}

      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Modules</div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {modules.length === 0 && <span className="text-xs text-muted-foreground">No module access.</span>}
          {modules.map((m) => (
            <span key={m.key} className="rounded-md border border-border bg-muted/60 px-2 py-0.5 text-[11px] text-foreground/80">
              {m.label}
            </span>
          ))}
        </div>
      </div>

      <div className="border-t border-border/60 pt-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Important permissions</div>
        <div className="mt-1.5 space-y-1">
          {key.length === 0 && <div className="text-xs text-muted-foreground">Read-only access.</div>}
          {key.map((p) => (
            <div key={p} className="flex items-center gap-1.5 text-xs text-foreground/80">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              <span className="font-mono">{p}</span>
            </div>
          ))}
        </div>
      </div>

      {restricted.length > 0 && (
        <div className="border-t border-border/60 pt-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Notable restrictions</div>
          <div className="mt-1.5 space-y-1">
            {restricted.map((p) => (
              <div key={p.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <XCircle className="h-3.5 w-3.5 text-rose-400/80" />
                <span className="font-mono">{p.key}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-1.5 border-t border-border pt-3 text-[11px] text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5" />
        Access changes are logged to the audit trail.
      </div>
    </div>
  );
}