import { Ban, Eye, PencilLine, CheckCircle2, AlertTriangle, Download, ShieldAlert, ShieldCheck, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ADMIN_TONE } from "@/components/admin/palette";
import {
  ACCESS_LABEL,
  INTERNAL_ROLES,
  PERMISSION_MODULES,
  deriveAccessLevel,
  isProtectedRole,
  type InternalRoleKey,
  type PermissionAction,
  type PermissionEntry,
} from "@/services/permission-catalog";

interface Props {
  role: InternalRoleKey | null;
  rolePermissions: string[] | undefined;
}

const LEVEL_BADGE: Record<string, string> = {
  full:     "bg-rose-500/15 text-rose-300 border-rose-500/40",
  high:     "bg-amber-500/15 text-amber-300 border-amber-500/40",
  standard: "bg-sky-500/15 text-sky-300 border-sky-500/40",
  limited:  "bg-slate-500/15 text-slate-300 border-slate-500/40",
};

type BucketKey = "read" | "write" | "approve" | "destructive" | "export";

const BUCKETS: {
  key: BucketKey;
  label: string;
  icon: LucideIcon;
  actions: PermissionAction[];
  fill: string;   // progress fill
  dot: string;    // dot / accent
  text: string;   // text accent
}[] = [
  { key: "read",        label: "Read",        icon: Eye,           actions: ["view"],
    fill: "bg-emerald-500/70", dot: "bg-emerald-400", text: "text-emerald-300" },
  { key: "write",       label: "Write",       icon: PencilLine,    actions: ["create", "update", "assign", "reassign"],
    fill: "bg-sky-500/70",     dot: "bg-sky-400",     text: "text-sky-300" },
  { key: "approve",     label: "Approve",     icon: CheckCircle2,  actions: ["approve", "reject", "resolve", "escalate", "configure"],
    fill: "bg-amber-500/70",   dot: ADMIN_TONE.warning.dot,   text: ADMIN_TONE.warning.text },
  { key: "destructive", label: "Destructive", icon: AlertTriangle, actions: ["suspend", "manage_permissions"],
    fill: "bg-rose-500/70",    dot: "bg-rose-400",    text: "text-rose-300" },
  { key: "export",      label: "Export",      icon: Download,      actions: ["export"],
    fill: "bg-violet-500/70",  dot: "bg-violet-400",  text: "text-violet-300" },
];

function statusWord(granted: number, total: number): string {
  if (total === 0) return "n/a";
  if (granted === 0) return "blocked";
  if (granted === total) return "full";
  if (granted / total >= 0.6) return "broad";
  return "limited";
}

const ACTION_WORD: Record<PermissionAction, string> = {
  view: "view", create: "create", update: "update", assign: "assign",
  reassign: "reassign", approve: "approve", reject: "reject", resolve: "resolve",
  escalate: "escalate", suspend: "suspend", reactivate: "reactivate", export: "export", configure: "configure",
  manage_permissions: "manage perms",
  view_assigned: "view assigned", add_internal_note: "add note",
  request_information: "request info", request_evidence: "request evidence",
  update_status: "update status", resolve_assigned: "resolve assigned",
  resolve_all: "resolve any", remove_flag: "remove flag",
  release: "release funds", issue: "issue", flag: "flag",
};

const ALL_PERMISSIONS: PermissionEntry[] =
  PERMISSION_MODULES.flatMap((m) => m.permissions);

const MODULE_LABEL: Record<string, string> =
  Object.fromEntries(PERMISSION_MODULES.map((m) => [m.key, m.label]));

/**
 * Right-column context panel for AddUserDrawer / ChangeRoleDrawer. Shows what
 * the currently-selected primary role can do, grouped by capability bucket
 * (Read / Write / Approve / Destructive / Export), plus notable restrictions.
 */
export function RoleSummaryCard({ role, rolePermissions }: Props) {
  if (!role) {
    return (
      <div className="rounded-2xl border border-dashed border-border/70 bg-gradient-to-b from-card to-card/60 p-6 text-center shadow-sm ring-1 ring-border/30">
        <Sparkles className="mx-auto mb-2 h-6 w-6 text-muted-foreground/40" />
        <div className="text-sm font-medium text-foreground/80">No role selected</div>
        <div className="mt-1 text-xs text-muted-foreground">
          Pick a role to preview its access footprint.
        </div>
      </div>
    );
  }

  const def = INTERNAL_ROLES.find((r) => r.key === role);
  const perms = rolePermissions ?? [];
  const permSet = new Set(perms);
  const level = deriveAccessLevel(perms, [role]);
  const requiresApproval = isProtectedRole(role) || level === "full" || level === "high";

  const moduleKeys = new Set(perms.map((p) => p.split(".")[0]));
  const modules = PERMISSION_MODULES.filter((m) => moduleKeys.has(m.key));
  const MODULES_VISIBLE = 6;
  const shownModules = modules.slice(0, MODULES_VISIBLE);
  const extraModules = Math.max(0, modules.length - shownModules.length);

  // Per-bucket stats + granted permission list
  const bucketStats = BUCKETS.map((b) => {
    const inBucket = ALL_PERMISSIONS.filter((p) => b.actions.includes(p.action));
    const granted = inBucket.filter((p) => permSet.has(p.key));
    // group granted by module → list of action words
    const byModule = new Map<string, PermissionAction[]>();
    for (const p of granted) {
      const arr = byModule.get(p.module) ?? [];
      arr.push(p.action);
      byModule.set(p.module, arr);
    }
    return {
      ...b,
      total: inBucket.length,
      grantedCount: granted.length,
      byModule,
    };
  });

  // Notable restrictions: high-signal permissions the user does NOT have.
  const RESTRICTED_VISIBLE = 5;
  const restrictedAll = ALL_PERMISSIONS
    .filter((p) =>
      p.action === "manage_permissions" ||
      p.action === "approve" ||
      p.action === "configure" ||
      p.action === "suspend",
    )
    .filter((p) => !permSet.has(p.key));
  const restricted = restrictedAll.slice(0, RESTRICTED_VISIBLE);
  const extraRestricted = Math.max(0, restrictedAll.length - restricted.length);

  return (
    <div
      key={role}
      className="animate-in fade-in-50 slide-in-from-right-1 rounded-2xl border border-border/70 bg-gradient-to-b from-card to-card/60 p-5 shadow-sm ring-1 ring-border/30 space-y-4"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-base font-semibold text-foreground">{def?.name ?? role}</div>
          <div className="mt-0.5 text-xs leading-snug text-muted-foreground">{def?.description}</div>
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

      {/* Capability overview: bucket bars */}
      <section className="space-y-2">
        <SectionLabel>Capability overview</SectionLabel>
        <div className="space-y-1.5">
          {bucketStats.map((b) => {
            const Icon = b.icon;
            const pct = b.total === 0 ? 0 : (b.grantedCount / b.total) * 100;
            const word = statusWord(b.grantedCount, b.total);
            const muted = b.grantedCount === 0;
            return (
              <div key={b.key} className="grid grid-cols-[6.25rem_1fr_auto] items-center gap-2">
                <div className={`flex items-center gap-1.5 text-xs ${muted ? "text-muted-foreground" : b.text}`}>
                  <Icon className="h-3 w-3" />
                  {b.label}
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted/40">
                  <div className={`h-full ${b.fill} transition-all`} style={{ width: `${pct}%` }} />
                </div>
                <div className="text-xs tabular-nums text-muted-foreground">
                  <span className={muted ? "" : "text-foreground/80"}>{b.grantedCount}</span>
                  <span>/{b.total}</span>
                  <span className="ml-1.5">· {word}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Modules in scope */}
      <section className="space-y-1.5 border-t border-border/60 pt-3">
        <SectionLabel>Modules in scope</SectionLabel>
        <div className="flex flex-wrap gap-1.5">
          {modules.length === 0 && <span className="text-xs text-muted-foreground">No module access.</span>}
          {shownModules.map((m) => (
            <span
              key={m.key}
              className="rounded-md border border-border bg-muted/60 px-2 py-0.5 text-xs text-foreground/80 transition-colors hover:bg-muted"
            >
              {m.label}
            </span>
          ))}
          {extraModules > 0 && (
            <span className="rounded-md border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground">
              +{extraModules} more
            </span>
          )}
        </div>
      </section>

      {/* What this user can do */}
      <section className="space-y-1.5 border-t border-border/60 pt-3">
        <SectionLabel>What this user can do</SectionLabel>
        <div className="space-y-1.5">
          {bucketStats.map((b) => {
            const modulesGranted = Array.from(b.byModule.entries());
            return (
              <div key={b.key} className="grid grid-cols-[5.5rem_1fr] items-start gap-2 text-xs">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className={`h-1.5 w-1.5 rounded-full ${b.dot}`} />
                  <span>{b.label}</span>
                </div>
                <div className="text-foreground/80">
                  {modulesGranted.length === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <span className="leading-snug">
                      {modulesGranted.map(([mod, actions], i) => (
                        <span key={mod}>
                          {i > 0 && <span className="text-muted-foreground">, </span>}
                          <span>{MODULE_LABEL[mod] ?? mod}</span>
                          {actions.length > 0 && (
                            <span className="text-muted-foreground">
                              {" "}({actions.map((a) => ACTION_WORD[a]).join(", ")})
                            </span>
                          )}
                        </span>
                      ))}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Restricted */}
      {restricted.length > 0 && (
        <section className="space-y-1.5 border-t border-border/60 pt-3">
          <SectionLabel>Restricted</SectionLabel>
          <div className="space-y-1">
            {restricted.map((p) => (
              <div
                key={p.key}
                title={p.label}
                className="flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                <Ban className="h-3 w-3 text-rose-400/80" />
                <span className="font-mono">{p.key}</span>
              </div>
            ))}
            {extraRestricted > 0 && (
              <div className="pl-4 text-xs text-muted-foreground">+{extraRestricted} more restricted</div>
            )}
          </div>
        </section>
      )}

      <div className="flex items-center gap-1.5 border-t border-border/60 pt-3 text-xs text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5 text-emerald-400/70" />
        Access changes are logged to the audit trail.
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      {children}
    </div>
  );
}