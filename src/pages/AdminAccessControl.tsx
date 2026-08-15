import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { INTERNAL_ROLES, type InternalRoleKey } from "@/services/permission-catalog";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { toast } from "@/hooks/use-toast";
import {
  fetchAccessDirectory,
  inviteInternalUser,
  updateUserRoles,
  suspendUserAtomic,
  submitRoleChangeRequest,
  reactivateInternalUser,
  deactivateInternalUser,
  resendInternalUserInvite,
  deleteInvitedInternalUser,
  extendInternalUserAccess,
  type AccessFilter,
  type InternalUser,
} from "@/services/admin-access-control.service";
import { AccessSummaryCards } from "@/components/admin/access-control/AccessSummaryCards";
import { UserAccessFilters } from "@/components/admin/access-control/UserAccessFilters";
import type { AdvancedFilterState } from "@/components/admin/access-control/AdvancedFilters";
import { InternalUsersTable } from "@/components/admin/access-control/InternalUsersTable";
import { TableToolbar, type SortBy, type SortDir } from "@/components/admin/access-control/TableToolbar";
import { NoResultsState } from "@/components/admin/access-control/NoResultsState";
import { PermissionDeniedState } from "@/components/admin/access-control/PermissionDeniedState";
import { AddUserDrawer } from "@/components/admin/access-control/AddUserDrawer";
import { ChangeRoleDrawer } from "@/components/admin/access-control/ChangeRoleDrawer";
import { ReviewPermissionsDrawer } from "@/components/admin/access-control/ReviewPermissionsDrawer";
import { UserDetailsDrawer } from "@/components/admin/access-control/UserDetailsDrawer";
import { SuspendUserDialog } from "@/components/admin/access-control/SuspendUserDialog";
import { ReactivateUserDialog } from "@/components/admin/access-control/ReactivateUserDialog";
import { ActionConfirmDialog } from "@/components/admin/access-control/ActionConfirmDialog";
import { ExtendAccessDialog } from "@/components/admin/access-control/ExtendAccessDialog";
import { LoadingSkeleton } from "@/components/admin/access-control/LoadingSkeleton";
import { EmptyState } from "@/components/admin/access-control/EmptyState";
import { ErrorState } from "@/components/admin/access-control/ErrorState";

const EMPTY_ADVANCED: AdvancedFilterState = {
  role: null, department: null, status: null, access_level: null,
};

export default function AdminAccessControl() {
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const [filter, setFilter] = useState<AccessFilter>("all");
  const [q, setQ] = useState("");
  const [advanced, setAdvanced] = useState<AdvancedFilterState>(() => {
    const raw = searchParams.get("role");
    const role = raw && INTERNAL_ROLES.some((r) => r.key === raw) ? (raw as InternalRoleKey) : null;
    return { ...EMPTY_ADVANCED, role };
  });

  // Keep the role filter in sync with the `?role=` query param (e.g. when
  // navigating from the Role Detail panel's "View users" button).
  useEffect(() => {
    const raw = searchParams.get("role");
    if (!raw) return;
    if (!INTERNAL_ROLES.some((r) => r.key === raw)) return;
    if (raw === advanced.role) return;
    setAdvanced((a) => ({ ...a, role: raw as InternalRoleKey }));
    setPage(1);
  }, [searchParams]);
  const [sortBy, setSortBy] = useState<SortBy>("last_active");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [addOpen, setAddOpen] = useState(false);
  const [detailsUser, setDetailsUser] = useState<InternalUser | null>(null);
  const [historyUser, setHistoryUser] = useState<InternalUser | null>(null);
  const [changeRoleUser, setChangeRoleUser] = useState<InternalUser | null>(null);
  const [permsUser, setPermsUser] = useState<InternalUser | null>(null);
  const [suspendUser, setSuspendUser] = useState<InternalUser | null>(null);
  const [reactivateUser, setReactivateUser] = useState<InternalUser | null>(null);
  const [deactivateUser, setDeactivateUser] = useState<InternalUser | null>(null);
  const [resendUser, setResendUser] = useState<InternalUser | null>(null);
  const [deleteUser, setDeleteUser] = useState<InternalUser | null>(null);
  const [extendUser, setExtendUser] = useState<InternalUser | null>(null);

  // Search is debounced before it reaches the query key so typing costs one
  // request instead of one per keystroke.
  const [debouncedQ, setDebouncedQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const query = useMemo(() => ({
    filter,
    q: debouncedQ.trim() || undefined,
    role: advanced.role ?? undefined,
    department: advanced.department ?? undefined,
    status: advanced.status ?? undefined,
    access_level: advanced.access_level ?? undefined,
    sort_by: sortBy,
    sort_dir: sortDir,
    page, page_size: pageSize,
  }), [filter, debouncedQ, advanced, sortBy, sortDir, page, pageSize]);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-access-control", query],
    queryFn: () => fetchAccessDirectory(query),
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });

  // Deep-link support: `?user=<id>` (or `?userId=<id>`) auto-opens the
  // Details drawer for that user once they appear in the current directory
  // page. Falls back silently if the id is not in the current filter view.
  const deepLinkUserId = searchParams.get("userId") ?? searchParams.get("user");
  useEffect(() => {
    if (!deepLinkUserId || !data?.rows?.length) return;
    const target = data.rows.find((u) => u.id === deepLinkUserId);
    if (target && detailsUser?.id !== target.id) {
      setDetailsUser(target);
    }
  }, [deepLinkUserId, data, detailsUser?.id]);

  const isPermissionDenied = (err: unknown): boolean => {
    if (!err) return false;
    const anyErr = err as { code?: string; message?: string };
    if (anyErr.code === "42501") return true;
    return typeof anyErr.message === "string" && /permission denied/i.test(anyErr.message);
  };

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["admin-access-control"] });

  const handleFilterChange = (f: AccessFilter) => { setFilter(f); setPage(1); };
  const handleQueryChange = (v: string) => { setQ(v); setPage(1); };
  const handleAdvancedChange = (s: AdvancedFilterState) => { setAdvanced(s); setPage(1); };
  const clearAll = () => {
    setFilter("all"); setQ(""); setAdvanced(EMPTY_ADVANCED); setPage(1);
  };
  const hasAnyFilter =
    filter !== "all" || q.trim().length > 0 ||
    !!advanced.role || !!advanced.department || !!advanced.status || !!advanced.access_level;

  const failToast = (title: string) => (err: unknown) =>
    toast({ title, description: err instanceof Error ? err.message : "Please try again.", variant: "destructive" });

  const inviteMut = useMutation({
    mutationFn: inviteInternalUser,
    onSuccess: (u) => {
      const channel = (u as any).__email_channel as "resend" | "supabase_default" | "failed" | undefined;
      if (channel === "failed") {
        toast({
          title: "User created — email failed",
          description: `${u.full_name} was added, but the invite email could not be sent. Use "Resend invite" to retry.`,
          variant: "destructive",
        });
      } else {
        const suffix = channel === "supabase_default" ? " (using default provider)" : "";
        toast({
          title: "Invite sent",
          description: `${u.full_name} (${u.email}) will receive onboarding instructions${suffix}.`,
        });
      }
      invalidate();
    },
    onError: failToast("Could not send invite"),
  });

  const roleMut = useMutation({
    mutationFn: updateUserRoles,
    onSuccess: (res) => {
      toast({
        title: res.applied ? "Roles updated" : "Approval required",
        description: res.applied
          ? "Change was logged to audit trail."
          : "Protected-role changes were queued for review.",
      });
      invalidate();
    },
    onError: failToast("Could not update roles"),
  });

  const roleRequestMut = useMutation({
    mutationFn: submitRoleChangeRequest,
    onSuccess: () => {
      toast({ title: "Approval requested", description: "Role change queued for review." });
      invalidate();
    },
    onError: failToast("Could not submit role change"),
  });

  const suspendMut = useMutation({
    mutationFn: suspendUserAtomic,
    onSuccess: (r) => {
      toast({
        title: "User suspended",
        description: r.revoked_sessions > 0 ? `${r.revoked_sessions} session(s) revoked.` : undefined,
        variant: "destructive",
      });
      invalidate();
    },
    onError: failToast("Could not suspend user"),
  });

  const reactivateMut = useMutation({
    mutationFn: reactivateInternalUser,
    onSuccess: () => { toast({ title: "User reactivated" }); invalidate(); },
    onError: failToast("Could not reactivate user"),
  });

  const deactivateMut = useMutation({
    mutationFn: deactivateInternalUser,
    onSuccess: () => { toast({ title: "User deactivated", description: "Historical audit records are retained.", variant: "destructive" }); invalidate(); },
    onError: failToast("Could not deactivate user"),
  });

  const resendMut = useMutation({
    mutationFn: resendInternalUserInvite,
    onSuccess: () => { toast({ title: "Invitation resent" }); invalidate(); },
    onError: failToast("Could not resend invitation"),
  });

  const deleteMut = useMutation({
    mutationFn: deleteInvitedInternalUser,
    onSuccess: () => {
      toast({ title: "User deleted", description: "You can now re-invite with the same email." });
      invalidate();
    },
    onError: failToast("Could not delete user"),
  });

  const extendMut = useMutation({
    mutationFn: extendInternalUserAccess,
    onSuccess: () => {
      toast({ title: "Access updated", description: "Change recorded in audit trail." });
      invalidate();
    },
    onError: failToast("Could not update access expiry"),
  });

  return (
    <AdminLayout
      title="Access & Role Management"
      subtitle="Internal user permissions and access control"
    >
      {isLoading ? (
        <LoadingSkeleton />
      ) : isError && isPermissionDenied(error) ? (
        <PermissionDeniedState />
      ) : isError || !data ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (
        <div className="space-y-6">
          <AccessSummaryCards
            summary={data.summary}
            activeFilter={filter}
            onSelect={handleFilterChange}
          />
          <UserAccessFilters
            filter={filter}
            onFilter={handleFilterChange}
            q={q}
            onQuery={handleQueryChange}
            onAddUser={() => setAddOpen(true)}
            advanced={advanced}
            onAdvanced={handleAdvancedChange}
            departments={data.departments}
            onClearAll={clearAll}
            hasAnyFilter={hasAnyFilter}
          />
          {data.total === 0 ? (
            hasAnyFilter ? <NoResultsState onClear={clearAll} /> : <EmptyState />
          ) : (
            <>
              <InternalUsersTable
                rows={data.rows}
                onOpen={(u) => setDetailsUser(u)}
                onChangeRole={(u) => setChangeRoleUser(u)}
                onReviewPermissions={(u) => setPermsUser(u)}
                onViewHistory={(u) => setHistoryUser(u)}
                onSuspend={(u) => setSuspendUser(u)}
                onReactivate={(u) => setReactivateUser(u)}
                onDeactivate={(u) => setDeactivateUser(u)}
                onResendInvite={(u) => setResendUser(u)}
                onDeleteInvited={(u) => setDeleteUser(u)}
                onExtendAccess={(u) => setExtendUser(u)}
              />
              <TableToolbar
                total={data.total}
                page={data.page}
                pageSize={data.page_size}
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={(by, dir) => { setSortBy(by); setSortDir(dir); }}
                onPage={setPage}
                onPageSize={(n) => { setPageSize(n); setPage(1); }}
              />
            </>
          )}
        </div>
      )}

      <AddUserDrawer
        open={addOpen}
        onOpenChange={setAddOpen}
        onSubmit={async (input) => { await inviteMut.mutateAsync(input); }}
      />

      <ChangeRoleDrawer
        user={changeRoleUser}
        open={!!changeRoleUser}
        onOpenChange={(o) => { if (!o) setChangeRoleUser(null); }}
        onSubmit={async (s) => {
          if (!changeRoleUser) return;
          if (s.requiresApproval) {
            await roleRequestMut.mutateAsync({
              user_id: changeRoleUser.id,
              roles: s.roles,
              primary_role: s.primary,
              effective_at: s.effective_at,
              expires_at: s.expires_at,
              reason: s.reason,
            });
          } else {
            await roleMut.mutateAsync({
              user_id: changeRoleUser.id,
              roles: s.roles,
              primary_role: s.primary,
              reason: s.reason,
            });
          }
        }}
      />

      <ReviewPermissionsDrawer
        user={permsUser}
        open={!!permsUser}
        onOpenChange={(o) => { if (!o) setPermsUser(null); }}
      />

      <UserDetailsDrawer
        user={detailsUser ?? historyUser}
        open={!!(detailsUser ?? historyUser)}
        initialFocus={historyUser && !detailsUser ? "history" : undefined}
        onOpenChange={(o) => { if (!o) { setDetailsUser(null); setHistoryUser(null); } }}
        onChangeRole={(u) => { setDetailsUser(null); setHistoryUser(null); setChangeRoleUser(u); }}
        onReviewPermissions={(u) => { setDetailsUser(null); setHistoryUser(null); setPermsUser(u); }}
        onSuspend={(u) => { setDetailsUser(null); setHistoryUser(null); setSuspendUser(u); }}
        onReactivate={(u) => { setDetailsUser(null); setHistoryUser(null); setReactivateUser(u); }}
      />

      <SuspendUserDialog
        user={suspendUser}
        open={!!suspendUser}
        onOpenChange={(o) => { if (!o) setSuspendUser(null); }}
        onConfirm={async (s) => {
          if (!suspendUser) return;
          await suspendMut.mutateAsync({ user_id: suspendUser.id, ...s });
          setSuspendUser(null);
        }}
      />

      <ReactivateUserDialog
        user={reactivateUser}
        open={!!reactivateUser}
        onOpenChange={(o) => { if (!o) setReactivateUser(null); }}
        onConfirm={async (reason) => {
          if (!reactivateUser) return;
          await reactivateMut.mutateAsync({ user_id: reactivateUser.id, reason });
          setReactivateUser(null);
        }}
      />

      <ActionConfirmDialog
        open={!!deactivateUser}
        onOpenChange={(o) => { if (!o) setDeactivateUser(null); }}
        title="Deactivate internal user?"
        description={
          deactivateUser
            ? `${deactivateUser.full_name} will lose all access immediately. Audit records will be retained.`
            : ""
        }
        confirmLabel="Deactivate"
        variant="destructive"
        requireReason
        onConfirm={async (reason) => {
          if (!deactivateUser) return;
          await deactivateMut.mutateAsync({ user_id: deactivateUser.id, reason: reason ?? "Deactivated by admin" });
          setDeactivateUser(null);
        }}
      />

      <ActionConfirmDialog
        open={!!resendUser}
        onOpenChange={(o) => { if (!o) setResendUser(null); }}
        title="Resend invitation?"
        description={resendUser ? `A new onboarding email will be sent to ${resendUser.email}.` : ""}
        confirmLabel="Resend"
        onConfirm={async () => {
          if (!resendUser) return;
          await resendMut.mutateAsync({ user_id: resendUser.id, email: resendUser.email, full_name: resendUser.full_name });
          setResendUser(null);
        }}
      />

      <ActionConfirmDialog
        open={!!deleteUser}
        onOpenChange={(o) => { if (!o) setDeleteUser(null); }}
        title={deleteUser?.status === "invited" ? "Delete invited user?" : "Delete user?"}
        description={
          deleteUser
            ? `${deleteUser.full_name} (${deleteUser.email}) will be removed permanently. This is only allowed because the user is ${deleteUser.status}. You will be able to re-invite this email afterward.`
            : ""
        }
        confirmLabel="Delete"
        variant="destructive"
        requireReason
        onConfirm={async (reason) => {
          if (!deleteUser) return;
          await deleteMut.mutateAsync({
            user_id: deleteUser.id,
            reason: reason ?? "Deleted before onboarding",
          });
          setDeleteUser(null);
        }}
      />

      <ExtendAccessDialog
        user={extendUser}
        open={!!extendUser}
        onOpenChange={(o) => { if (!o) setExtendUser(null); }}
        onConfirm={async ({ new_expires_at, reason }) => {
          if (!extendUser) return;
          await extendMut.mutateAsync({ user_id: extendUser.id, new_expires_at, reason });
          setExtendUser(null);
        }}
      />
    </AdminLayout>
  );
}