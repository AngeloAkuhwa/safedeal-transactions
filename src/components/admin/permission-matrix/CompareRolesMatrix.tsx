import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Check, X, AlertTriangle, ShieldAlert, GitCompare, ArrowRight,
  Copy, Wand2, CircleCheck, CircleAlert, Users, ShieldCheck, BellOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  INTERNAL_ROLES,
  PERMISSION_MODULES,
  ROLE_LABEL,
  getPermissionRisk,
  isPrivilegedPermission,
  isProtectedRole,
  type InternalRoleKey,
} from "@/services/permission-catalog";
import type { RoleGrantMap } from "@/services/permission-workspace.service";
import {
  computeRoleDiff, computeMissingDependencies, computeConflicts, isSodExempt,
} from "@/services/permission-dependencies";
import { permissionRepo, type ConflictAcknowledgementRow } from "@/services/permission-repository";
import { DEFAULT_ENVIRONMENT, type PermissionEnvironment } from "@/services/permission-repository";
import type { RoleMatrixFilters } from "@/hooks/useRoleMatrixFilters";
import type { StagedOp } from "@/hooks/useStagedPermissionChanges";
import { PermissionPanel } from "./PermissionPanel";
import { CopyPermissionsPreview } from "./CopyPermissionsPreview";
import { AcknowledgeConflictDialog } from "./AcknowledgeConflictDialog";
import { ADMIN_TONE } from "@/components/admin/palette";

interface Props {
  roleMap: RoleGrantMap;
  filters: RoleMatrixFilters;
  canWrite: boolean;
  environment?: PermissionEnvironment;
  onSetCompareRoles: (roles: InternalRoleKey[]) => void;
  onStageMany: (role: InternalRoleKey, changes: Array<{ permissionKey: string; op: StagedOp }>) => void;
}

function permLabel(key: string) {
  for (const m of PERMISSION_MODULES) {
    const p = m.permissions.find((x) => x.key === key);
    if (p) return { label: p.label, module: m.label };
  }
  return { label: key, module: "—" };
}

function riskChip(key: string) {
  const r = getPermissionRisk(key);
  const map = {
    critical: "border-rose-500/40 bg-rose-500/10 text-rose-300",
    high: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    medium: "border-sky-500/40 bg-sky-500/10 text-sky-300",
    low: "border-border/60 bg-muted/40 text-muted-foreground",
  } as const;
  return <span className={cn("rounded-full border px-1.5 py-0.5 text-xs font-bold uppercase", map[r])}>{r}</span>;
}

function riskDot(key: string) {
  const r = getPermissionRisk(key);
  const cls = r === "critical" ? "bg-rose-400"
    : r === "high" ? ADMIN_TONE.warning.dot
    : r === "medium" ? "bg-sky-400" : "bg-muted-foreground/50";
  return <span className={cn("inline-block h-1.5 w-1.5 rounded-full", cls)} aria-hidden />;
}

export function CompareRolesMatrix({ roleMap, filters, canWrite, environment = DEFAULT_ENVIRONMENT, onSetCompareRoles, onStageMany }: Props) {
  const selected = filters.compareRoles;
  const canAdd = selected.length < 4;
  const canRemove = selected.length > 2;

  const [copySource, setCopySource] = useState<InternalRoleKey | null>(selected[0] ?? null);
  const [copyTarget, setCopyTarget] = useState<InternalRoleKey | null>(selected[1] ?? null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [ackTarget, setAckTarget] = useState<{ role: InternalRoleKey; a: string; b: string } | null>(null);

  const qc = useQueryClient();
  const ackQuery = useQuery({
    queryKey: ["permission-conflict-acks", environment],
    queryFn: () => permissionRepo.listConflictAcknowledgements(environment),
    staleTime: 60_000,
  });
  const acks = ackQuery.data ?? [];

  const ackKey = (role: string, a: string, b: string) => {
    // Pair is directionless; match either order.
    return acks.find((r) =>
      r.role_key === role
      && ((r.a_key === a && r.b_key === b) || (r.a_key === b && r.b_key === a))
      && (!r.expires_at || new Date(r.expires_at) > new Date()),
    ) ?? null;
  };

  const ackMutation = useMutation({
    mutationFn: async (input: { role: string; a: string; b: string; reason: string; expiresAt: string | null }) => {
      await permissionRepo.acknowledgeConflict({
        role_key: input.role,
        a_key: input.a,
        b_key: input.b,
        reason: input.reason,
        expires_at: input.expiresAt,
        environment,
      });
    },
    onSuccess: () => {
      toast.success("Conflict acknowledged");
      qc.invalidateQueries({ queryKey: ["permission-conflict-acks", environment] });
      setAckTarget(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to acknowledge conflict"),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => permissionRepo.revokeConflictAcknowledgement(id),
    onSuccess: () => {
      toast.success("Acknowledgement revoked");
      qc.invalidateQueries({ queryKey: ["permission-conflict-acks", environment] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to revoke acknowledgement"),
  });

  const q = filters.search.trim().toLowerCase();
  const filterKey = (k: string): boolean => {
    if (filters.risks.length && !filters.risks.includes(getPermissionRisk(k))) return false;
    if (filters.privilegedOnly && !isPrivilegedPermission(k)) return false;
    if (filters.modules.length) {
      const mod = PERMISSION_MODULES.find((m) => m.permissions.some((p) => p.key === k));
      if (!mod || !filters.modules.includes(mod.key)) return false;
    }
    if (q) {
      const meta = permLabel(k);
      if (!(`${meta.label} ${k}`.toLowerCase()).includes(q)) return false;
    }
    return true;
  };

  const diff = useMemo(() => computeRoleDiff(selected, roleMap.map), [selected, roleMap]);
  const sharedFiltered = diff.shared.filter(filterKey);
  const differingFiltered = diff.differing.filter(filterKey);
  const privilegedDiffs = differingFiltered.filter(isPrivilegedPermission);

  // Exempt roles (Super Admin) hold every permission by design; skip SoD +
  // missing-dependency scans on them entirely so the noise doesn't hide real
  // findings on other roles.
  const perRoleAnalysis = selected.map((role) => {
    if (isSodExempt(role)) {
      return { role, missing: [], conflicts: [], exempt: true };
    }
    const bag = roleMap.map.get(role) ?? new Set<string>();
    return {
      role,
      missing: computeMissingDependencies(bag),
      conflicts: computeConflicts(bag),
      exempt: false,
    };
  });
  const exemptRolesInView = perRoleAnalysis.filter((x) => x.exempt).map((x) => x.role);

  const openCopyPreview = () => {
    if (!canWrite || !copySource || !copyTarget || copySource === copyTarget) return;
    setPreviewOpen(true);
  };

  const stageMissingDependency = (role: InternalRoleKey, needs: string) => {
    if (!canWrite || isProtectedRole(role)) return;
    onStageMany(role, [{ permissionKey: needs, op: "grant" }]);
  };

  return (
    <div className="space-y-4">
      {/* Role picker */}
      <PermissionPanel
        icon={<GitCompare className="h-4 w-4" />}
        title="Compare 2–4 roles"
        subtitle="Select the roles you want to compare side-by-side."
      >
        <div className="flex flex-wrap gap-2">
          {INTERNAL_ROLES.map((r) => {
            const on = selected.includes(r.key);
            const disabled = (on && !canRemove) || (!on && !canAdd);
            return (
              <button
                key={r.key}
                type="button"
                disabled={disabled}
                onClick={() => {
                  const next = on ? selected.filter((k) => k !== r.key) : [...selected, r.key];
                  onSetCompareRoles(next);
                }}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition min-h-11",
                  on
                    ? "border-primary/50 bg-primary/15 text-primary-foreground"
                    : "border-border/60 bg-background/40 text-muted-foreground hover:text-foreground",
                  disabled && "opacity-40",
                )}
              >
                {ROLE_LABEL[r.key]}
              </button>
            );
          })}
        </div>
      </PermissionPanel>

      {/* Copy permissions */}
      {canWrite && selected.length >= 2 && (
        <PermissionPanel
          icon={<Copy className="h-4 w-4" />}
          title="Copy permissions"
          subtitle="Preview adds and removes before anything is staged."
        >
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[180px] flex-1">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">From</label>
              <select
                value={copySource ?? ""}
                onChange={(e) => setCopySource(e.target.value as InternalRoleKey)}
                className="h-11 w-full rounded-md border border-border bg-background/60 px-3 text-xs outline-none focus:border-primary"
              >
                {selected.map((r) => (
                  <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                ))}
              </select>
            </div>
            <ArrowRight className="mb-2 h-4 w-4 text-muted-foreground" />
            <div className="min-w-[180px] flex-1">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">To</label>
              <select
                value={copyTarget ?? ""}
                onChange={(e) => setCopyTarget(e.target.value as InternalRoleKey)}
                className="h-11 w-full rounded-md border border-border bg-background/60 px-3 text-xs outline-none focus:border-primary"
              >
                {selected.filter((r) => r !== copySource).map((r) => (
                  <option key={r} value={r} disabled={isProtectedRole(r)}>
                    {ROLE_LABEL[r]}{isProtectedRole(r) ? " (protected)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              disabled={!copySource || !copyTarget || copySource === copyTarget || isProtectedRole(copyTarget ?? "" as InternalRoleKey)}
              onClick={openCopyPreview}
              className="inline-flex h-11 items-center gap-1.5 rounded-md bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Preview & stage
            </button>
          </div>
        </PermissionPanel>
      )}

      {/* Privileged differences */}
      <Section
        icon={<ShieldAlert className="h-4 w-4" />}
        tone="danger"
        title="Privileged permission differences"
        count={privilegedDiffs.length}
      >
        {privilegedDiffs.length === 0 ? (
          <EmptyRow icon={<CircleCheck className={`h-4 w-4 ${ADMIN_TONE.success.text}`} />}
            title="No privileged permission differences"
            body="Selected roles have identical high-risk access." />
        ) : (
          <DiffCardList keys={privilegedDiffs} selected={selected} roleMap={roleMap} />
        )}
      </Section>

      {/* Unique per role */}
      {selected.map((role) => {
        const unique = (diff.uniqueByRole.get(role) ?? []).filter(filterKey);
        return (
          <Section
            key={role}
            icon={<Users className="h-4 w-4" />}
            title={`Unique to ${ROLE_LABEL[role]}`}
            count={unique.length}
          >
            {unique.length === 0 ? (
              <EmptyRow title="None"
                body="Every permission this role holds is also held by at least one other selected role." />
            ) : (
              <ul className="grid grid-cols-1 gap-1 md:grid-cols-2">
                {unique.map((k) => (
                  <li key={k} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs hover:bg-muted/30">
                    {riskChip(k)}
                    <span className="min-w-0 flex-1 truncate font-medium">{permLabel(k).label}</span>
                    <code className="text-xs text-muted-foreground">{k}</code>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        );
      })}

      {/* Missing dependencies + conflicts */}
      <Section
        icon={<AlertTriangle className="h-4 w-4" />}
        tone="warn"
        title="Missing dependencies"
        count={perRoleAnalysis.reduce((n, x) => n + x.missing.length, 0)}
      >
        {perRoleAnalysis.every((x) => x.missing.length === 0) ? (
          <EmptyRow icon={<CircleCheck className={`h-4 w-4 ${ADMIN_TONE.success.text}`} />}
            title="All required dependencies are satisfied"
            body="Every write/approve permission on these roles has its matching view permission." />
        ) : (
          <div className="space-y-3">
            {perRoleAnalysis.filter((x) => x.missing.length > 0).map((x) => (
              <RoleSubGroup key={x.role} role={x.role} count={x.missing.length}>
                {x.missing.map((m, i) => {
                  const have = permLabel(m.have);
                  const needs = permLabel(m.needs);
                  const protectedRole = isProtectedRole(x.role);
                  return (
                    <li key={i} className="flex items-start gap-2.5 rounded-lg px-2 py-2 hover:bg-muted/30">
                      <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                      <div className="min-w-0 flex-1 text-xs">
                        <div className="text-foreground/90">
                          <span className="font-semibold">{have.label}</span>
                          <span className="text-muted-foreground"> requires </span>
                          <span className="font-semibold">{needs.label}</span>
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                          <code>{m.have}</code>
                          <span>→</span>
                          <code>{m.needs}</code>
                        </div>
                      </div>
                      {canWrite && !protectedRole && (
                        <button
                          type="button"
                          onClick={() => stageMissingDependency(x.role, m.needs)}
                          className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/60 px-2 py-1 text-xs font-semibold text-emerald-300 hover:border-emerald-500/40 min-h-11"
                        >
                          <Wand2 className="h-3 w-3" /> Fix by staging
                        </button>
                      )}
                    </li>
                  );
                })}
              </RoleSubGroup>
            ))}
          </div>
        )}
      </Section>

      <Section
        icon={<CircleAlert className="h-4 w-4" />}
        tone="danger"
        title="Conflicting financial responsibilities"
        count={perRoleAnalysis.reduce((n, x) => n + x.conflicts.length, 0)}
      >
        {exemptRolesInView.length > 0 && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-border/40 bg-background/40 p-2.5 text-xs text-muted-foreground">
            <ShieldCheck className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${ADMIN_TONE.success.text}`} />
            <span>
              <span className="font-semibold text-foreground/80">
                {exemptRolesInView.map((r) => ROLE_LABEL[r]).join(", ")}
              </span>{" "}
              {exemptRolesInView.length === 1 ? "is" : "are"} exempt from segregation-of-duties checks by design.
            </span>
          </div>
        )}
        {perRoleAnalysis.every((x) => x.conflicts.length === 0) ? (
          <EmptyRow icon={<CircleCheck className={`h-4 w-4 ${ADMIN_TONE.success.text}`} />}
            title="No segregation-of-duties conflicts detected"
            body="No selected role can both initiate and approve the same sensitive financial action." />
        ) : (
          <div className="space-y-3">
            {perRoleAnalysis.filter((x) => x.conflicts.length > 0).map((x) => (
              <RoleSubGroup key={x.role} role={x.role} count={x.conflicts.length} tone="danger">
                {x.conflicts.map((c, i) => {
                  const a = permLabel(c.a);
                  const b = permLabel(c.b);
                  const ack = ackKey(x.role, c.a, c.b);
                  return (
                    <li
                      key={i}
                      className={cn(
                        "flex items-start gap-2.5 rounded-lg px-2 py-2 hover:bg-muted/30",
                        ack && "opacity-70",
                      )}
                    >
                      <span className={cn(
                        "mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                        ack ? "bg-muted-foreground/50" : "bg-rose-400",
                      )} />
                      <div className="min-w-0 flex-1 text-xs">
                        <div className={cn("text-foreground/90", ack && "line-through decoration-muted-foreground/40")}>
                          <span className="font-semibold">{a.label}</span>
                          <span className="text-muted-foreground"> conflicts with </span>
                          <span className="font-semibold">{b.label}</span>
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                          <code>{c.a}</code>
                          <span>↔</span>
                          <code>{c.b}</code>
                          {ack && (
                            <span
                              title={ack.reason}
                              className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-xs font-semibold text-emerald-300"
                            >
                              <ShieldCheck className="h-3 w-3" /> Acknowledged
                            </span>
                          )}
                        </div>
                        {ack && (
                          <div className="mt-0.5 line-clamp-2 text-xs italic text-muted-foreground">
                            “{ack.reason}”
                          </div>
                        )}
                      </div>
                      {canWrite && (
                        ack ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`Revoke acknowledgement of "${a.label} ↔ ${b.label}" for ${ROLE_LABEL[x.role]}?`)) {
                                revokeMutation.mutate(ack.id);
                              }
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/60 px-2 py-1 text-xs font-semibold text-muted-foreground hover:border-rose-500/40 hover:text-rose-300 min-h-11"
                          >
                            <BellOff className="h-3 w-3" /> Revoke ack
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setAckTarget({ role: x.role, a: c.a, b: c.b })}
                            className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/60 px-2 py-1 text-xs font-semibold text-amber-300 hover:border-amber-500/40 min-h-11"
                          >
                            <ShieldCheck className="h-3 w-3" /> Acknowledge
                          </button>
                        )
                      )}
                    </li>
                  );
                })}
              </RoleSubGroup>
            ))}
          </div>
        )}
      </Section>

      {/* Shared */}
      <Section
        icon={<Check className="h-4 w-4" />}
        title="Shared by all selected roles"
        count={sharedFiltered.length}
        collapsedByDefault
      >
        {sharedFiltered.length === 0 ? (
          <EmptyRow title="No shared permissions" body="These roles do not share any common access." />
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {sharedFiltered.map((k) => (
              <span
                key={k}
                title={k}
                className="inline-flex items-center gap-1.5 rounded-full bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              >
                {riskDot(k)}
                {permLabel(k).label}
              </span>
            ))}
          </div>
        )}
      </Section>

      <CopyPermissionsPreview
        open={previewOpen}
        source={copySource}
        target={copyTarget}
        roleMap={roleMap}
        onClose={() => setPreviewOpen(false)}
        onStage={(t, changes) => onStageMany(t, changes)}
      />

      <AcknowledgeConflictDialog
        open={ackTarget !== null}
        role={ackTarget?.role ?? null}
        aKey={ackTarget?.a ?? null}
        bKey={ackTarget?.b ?? null}
        submitting={ackMutation.isPending}
        onClose={() => setAckTarget(null)}
        onSubmit={(reason, expiresAt) => {
          if (!ackTarget) return;
          ackMutation.mutate({ role: ackTarget.role, a: ackTarget.a, b: ackTarget.b, reason, expiresAt });
        }}
      />
    </div>
  );
}

function Section({
  title, count, children, tone, icon, collapsedByDefault,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
  tone?: "warn" | "danger";
  icon?: React.ReactNode;
  collapsedByDefault?: boolean;
}) {
  const [open, setOpen] = useState(!collapsedByDefault);
  const iconTone = tone === "danger"
    ? "bg-rose-500/15 text-rose-300"
    : tone === "warn"
    ? "bg-amber-500/15 text-amber-300"
    : "bg-primary/10 text-primary";
  return (
    <PermissionPanel>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 text-left"
      >
        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", iconTone)}>{icon}</span>
        <span className="min-w-0 flex-1 text-base font-semibold text-foreground">{title}</span>
        <span className="rounded-full bg-muted/60 px-2 py-0.5 text-xs font-medium text-muted-foreground">{count}</span>
      </button>
      {open && <div className="mt-4">{children}</div>}
    </PermissionPanel>
  );
}

function EmptyRow({ icon, title, body }: { icon?: React.ReactNode; title: string; body?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 rounded-xl bg-background/30 px-4 py-6 text-center">
      {icon}
      <div className="text-xs font-medium text-foreground/80">{title}</div>
      {body && <div className="max-w-md text-xs text-muted-foreground">{body}</div>}
    </div>
  );
}

function RoleSubGroup({
  role, count, tone, children,
}: { role: InternalRoleKey; count: number; tone?: "danger"; children: React.ReactNode }) {
  const chipCls = tone === "danger"
    ? "bg-rose-500/15 text-rose-200"
    : "bg-amber-500/15 text-amber-200";
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <span className="text-xs font-semibold text-foreground/90">{ROLE_LABEL[role]}</span>
        <span className={cn("rounded-full px-1.5 py-0.5 text-xs font-semibold", chipCls)}>{count}</span>
      </div>
      <ul className="space-y-0.5">{children}</ul>
    </div>
  );
}

function DiffCardList({ keys, selected, roleMap }: { keys: string[]; selected: InternalRoleKey[]; roleMap: RoleGrantMap }) {
  return (
    <div className="space-y-1">
      {/* Sub-header */}
      <div className="flex items-center gap-2 px-2 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <span className="flex-1">Permission</span>
        {selected.map((r) => (
          <span key={r} className="w-14 text-center">{ROLE_LABEL[r]}</span>
        ))}
      </div>
      {keys.map((k) => (
        <div key={k} className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-muted/30">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {riskChip(k)}
              <span className="truncate text-xs font-medium text-foreground/90">{permLabel(k).label}</span>
            </div>
            <code className="mt-0.5 block truncate text-xs text-muted-foreground">{k}</code>
          </div>
          {selected.map((r) => {
            const held = roleMap.map.get(r)?.has(k) ?? false;
            return (
              <div key={r} className="w-14 text-center">
                <span className={cn(
                  "inline-flex h-6 w-6 items-center justify-center rounded-full",
                  held ? "bg-emerald-500/15 text-emerald-300" : "bg-muted/40 text-muted-foreground/60",
                )}>
                  {held ? <Check className="h-3.5 w-3.5" /> : <X className="h-3 w-3" />}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}