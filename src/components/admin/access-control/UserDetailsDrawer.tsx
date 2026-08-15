import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Ban, Undo2, KeyRound, RefreshCcw, ShieldCheck, Lock, ExternalLink, ClipboardList, LineChart, FileClock } from "lucide-react";
import type { InternalUser } from "@/services/admin-access-control.service";
import { fetchAccessAudit, listAccessChangeRequests, relativeTime } from "@/services/admin-access-control.service";
import { AccessLevelPill, InitialsAvatar, RoleBadge, StatusBadge } from "./badges";
import { AccessHistoryTimeline } from "./AccessHistoryTimeline";
import { resolveDepartmentLabel } from "@/services/departments.catalog";
import { fetchAssignedWorkSummary } from "@/services/assigned-work.service";
import { canPerform, useInternalPermissions } from "@/hooks/useInternalPermissions";
import { ROLE_LABEL } from "@/services/permission-catalog";

type TabKey = "overview" | "role" | "work" | "activity" | "history";

interface Props {
  user: InternalUser | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onChangeRole: (u: InternalUser) => void;
  onReviewPermissions: (u: InternalUser) => void;
  onSuspend: (u: InternalUser) => void;
  onReactivate: (u: InternalUser) => void;
  initialFocus?: "history";
}

export function UserDetailsDrawer({
  user, open, onOpenChange,
  onChangeRole, onReviewPermissions, onSuspend, onReactivate, initialFocus,
}: Props) {
  const [tab, setTab] = useState<TabKey>("overview");

  const { data: audit } = useQuery({
    queryKey: ["access-audit", user?.id],
    queryFn: () => fetchAccessAudit(user!.id),
    enabled: !!user,
  });
  const { data: work } = useQuery({
    queryKey: ["assigned-work", user?.id],
    queryFn: () => fetchAssignedWorkSummary(user!.id),
    enabled: !!user,
  });
  const { data: myPerms } = useInternalPermissions();

  // Contextual navigation — surface a link to any pending approval that
  // targets this user so operators can jump straight to the queue.
  const { data: pendingReq } = useQuery({
    queryKey: ["access-approvals", "pending-for", user?.id],
    queryFn: async () => {
      const rows = await listAccessChangeRequests("pending");
      return rows.find((r) => r.target_user_id === user!.id) ?? null;
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  const isAgentTier = !!user && (
    user.roles.includes("support_agent") ||
    user.roles.includes("dispute_agent") ||
    user.roles.includes("identity_officer")
  );

  useEffect(() => {
    if (!open) return;
    setTab(initialFocus === "history" ? "history" : "overview");
  }, [open, initialFocus, user?.id]);

  const signInEvents = useMemo(
    () => (audit ?? []).filter((a) => /sign_in|login|logout|session/i.test(a.action)).slice(0, 8),
    [audit],
  );
  const generalActivity = useMemo(
    () => (audit ?? []).filter((a) => !/sign_in|login|logout|session/i.test(a.action)).slice(0, 12),
    [audit],
  );

  if (!user) return null;

  const canManageRoles     = canPerform(myPerms, "internal_users.manage");
  const canManagePerms     = canPerform(myPerms, "internal_users.manage_permissions") || canManageRoles;
  const canSuspend         = canPerform(myPerms, "internal_users.suspend") || canManageRoles;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader><SheetTitle>User details</SheetTitle></SheetHeader>

        <div className="mt-4 flex items-center gap-3">
          <InitialsAvatar name={user.full_name} ring={user.access_level === "full" ? "critical" : user.access_level === "high" ? "high" : "none"} />
          <div className="min-w-0">
            <div className="truncate text-base font-semibold text-foreground">{user.full_name}</div>
            <div className="text-xs text-muted-foreground">#{user.display_id} · {user.email}</div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <StatusBadge status={user.status} />
              <AccessLevelPill level={user.access_level} />
              {user.two_factor_enabled ? (
                <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[12px] text-emerald-300">
                  <ShieldCheck className="h-3 w-3" /> 2FA on
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[12px] text-amber-300">
                  <ShieldCheck className="h-3 w-3" /> 2FA off
                </span>
              )}
            </div>
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="mt-5">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="role">Role & Access</TabsTrigger>
            <TabsTrigger value="work">Assigned Work</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="history">Access History</TabsTrigger>
          </TabsList>

          {/* -------- Overview -------- */}
          <TabsContent value="overview" className="mt-4 space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <FieldCard label="Employee ID" value={<span className="font-mono">{user.display_id}</span>} readOnly />
              <FieldCard label="Work email"   value={user.email} />
              <FieldCard label="Department"   value={resolveDepartmentLabel(user.department)} />
              <FieldCard label="Team"         value={user.team ?? "—"} />
              <FieldCard label="Job title"    value={user.job_title ?? "—"} />
              <FieldCard
                label="Reporting manager"
                value={
                  user.reporting_manager_name
                    ? `${user.reporting_manager_name}${user.reporting_manager_role ? ` · ${ROLE_LABEL[user.reporting_manager_role]}` : ""}`
                    : "—"
                }
              />
              <FieldCard label="Last active"  value={relativeTime(user.last_active_at)} />
              <FieldCard label="Access expiry" value={user.access_expires_at ? new Date(user.access_expires_at).toLocaleDateString() : "No expiry"} />
            </div>
          </TabsContent>

          {/* -------- Role & Access -------- */}
          <TabsContent value="role" className="mt-4 space-y-4">
            <div className="rounded-lg border border-border bg-muted/40 p-3">
              <div className="text-xs text-muted-foreground">Roles</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {user.roles.map((r) => <RoleBadge key={r} role={r} />)}
                {user.roles.length === 0 && (
                  <span className="text-xs text-muted-foreground">No roles assigned</span>
                )}
              </div>
              <div className="mt-1 text-[12px] text-muted-foreground">
                Primary: {ROLE_LABEL[user.primary_role] ?? user.primary_role}
              </div>
            </div>
            <div>
              <h4 className="mb-2 text-sm font-semibold text-foreground">Permissions ({user.permissions.length})</h4>
              <div className="flex flex-wrap gap-1.5">
                {user.permissions.length === 0 && (
                  <span className="text-xs text-muted-foreground">No permissions assigned.</span>
                )}
                {user.permissions.map((p) => (
                  <span key={p} className="rounded-md border border-border bg-muted/60 px-2 py-0.5 text-[12px] font-mono text-foreground/80">
                    {p}
                  </span>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* -------- Assigned Work -------- */}
          <TabsContent value="work" className="mt-4 space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <FieldCard label="Active disputes" value={String(work?.active_disputes ?? "…")} />
              <FieldCard
                label="Open tasks"
                value={work?.task_orchestration_available ? String(work.open_tasks) : "Not wired yet"}
              />
            </div>
            {!work?.task_orchestration_available && (
              <div className="rounded-md border border-dashed border-border p-2 text-[12px] text-muted-foreground">
                Task orchestration surface isn't wired to this workspace yet — dispute assignment is used as a proxy.
              </div>
            )}
          </TabsContent>

          {/* -------- Activity -------- */}
          <TabsContent value="activity" className="mt-4 space-y-4">
            <div>
              <h4 className="mb-2 text-sm font-semibold text-foreground">Recent sign-in events</h4>
              {signInEvents.length === 0 ? (
                <div className="text-xs text-muted-foreground">No sign-in events recorded.</div>
              ) : (
                <ul className="space-y-1 text-xs">
                  {signInEvents.map((e) => (
                    <li key={e.id} className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-2 py-1">
                      <span className="text-foreground/80">{e.action.replace(/_/g, " ")}</span>
                      <span className="text-muted-foreground">{relativeTime(e.created_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h4 className="mb-2 text-sm font-semibold text-foreground">Recent actions</h4>
              <AccessHistoryTimeline entries={generalActivity} />
            </div>
          </TabsContent>

          {/* -------- Access history -------- */}
          <TabsContent value="history" className="mt-4">
            <AccessHistoryTimeline entries={audit} />
          </TabsContent>
        </Tabs>

        <div className="sticky bottom-0 -mx-6 mt-6 flex flex-wrap items-center gap-2 border-t border-border bg-background/95 p-4 backdrop-blur">
          {pendingReq && (
            <Button asChild size="sm" variant="outline">
              <Link to={`/admin/access-approvals?request=${pendingReq.id}`}>
                <FileClock className="mr-2 h-4 w-4" /> View approval request
              </Link>
            </Button>
          )}
          <Button asChild size="sm" variant="ghost">
            <Link to="/admin/task-orchestration">
              <ClipboardList className="mr-2 h-4 w-4" /> Assigned tasks
            </Link>
          </Button>
          {isAgentTier && (
            <Button asChild size="sm" variant="ghost">
              <Link to="/admin/agent-performance">
                <LineChart className="mr-2 h-4 w-4" /> Agent performance
              </Link>
            </Button>
          )}
          <Button asChild size="sm" variant="ghost">
            <Link to={`/admin/audit-logs?entity=internal_users:${user.id}`}>
              <ExternalLink className="mr-2 h-4 w-4" /> Audit logs
            </Link>
          </Button>
          {canManageRoles && (
            <Button size="sm" variant="outline" onClick={() => onChangeRole(user)}>
              <RefreshCcw className="mr-2 h-4 w-4" /> Change role
            </Button>
          )}
          {canManagePerms && (
            <Button size="sm" variant="outline" onClick={() => onReviewPermissions(user)}>
              <KeyRound className="mr-2 h-4 w-4" /> Permissions
            </Button>
          )}
          {canSuspend && (
            user.status === "suspended" ? (
              <Button size="sm" onClick={() => onReactivate(user)}>
                <Undo2 className="mr-2 h-4 w-4" /> Reactivate
              </Button>
            ) : (
              <Button size="sm" variant="destructive" onClick={() => onSuspend(user)}>
                <Ban className="mr-2 h-4 w-4" /> Suspend
              </Button>
            )
          )}
          {!canManageRoles && !canManagePerms && !canSuspend && (
            <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <Lock className="h-3 w-3" /> Read-only view — you don't have permission to make changes.
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function FieldCard({ label, value, readOnly }: { label: string; value: React.ReactNode; readOnly?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-3">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        {label}{readOnly && <Lock className="h-3 w-3" />}
      </div>
      <div className="mt-1 text-sm text-foreground/90 break-words">{value}</div>
    </div>
  );
}