import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import {
  fetchAccessDirectory,
  inviteInternalUser,
  changeRole,
  updatePermissions,
  suspendInternalUser,
  reactivateInternalUser,
  type AccessFilter,
  type InternalUser,
} from "@/services/admin-access-control.service";
import { AccessSummaryCards } from "@/components/admin/access-control/AccessSummaryCards";
import { UserAccessFilters } from "@/components/admin/access-control/UserAccessFilters";
import { InternalUsersTable } from "@/components/admin/access-control/InternalUsersTable";
import { AddUserDrawer } from "@/components/admin/access-control/AddUserDrawer";
import { ChangeRoleDrawer } from "@/components/admin/access-control/ChangeRoleDrawer";
import { ReviewPermissionsDrawer } from "@/components/admin/access-control/ReviewPermissionsDrawer";
import { UserDetailsDrawer } from "@/components/admin/access-control/UserDetailsDrawer";
import { ActionConfirmDialog } from "@/components/admin/transactions/ActionConfirmDialog";

export default function AdminAccessControl() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<AccessFilter>("all");
  const [q, setQ] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [detailsUser, setDetailsUser] = useState<InternalUser | null>(null);
  const [changeRoleUser, setChangeRoleUser] = useState<InternalUser | null>(null);
  const [permsUser, setPermsUser] = useState<InternalUser | null>(null);
  const [suspendUser, setSuspendUser] = useState<InternalUser | null>(null);

  const query = useMemo(() => ({ filter, q: q.trim() || undefined }), [filter, q]);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-access-control", query],
    queryFn: () => fetchAccessDirectory(query),
    staleTime: 15_000,
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["admin-access-control"] });

  const inviteMut = useMutation({
    mutationFn: inviteInternalUser,
    onSuccess: (u) => {
      toast({ title: "Invite sent", description: `${u.full_name} (${u.email}) will receive onboarding instructions.` });
      invalidate();
    },
  });

  const roleMut = useMutation({
    mutationFn: changeRole,
    onSuccess: () => { toast({ title: "Role updated", description: "Change was logged to audit trail." }); invalidate(); },
  });

  const permsMut = useMutation({
    mutationFn: updatePermissions,
    onSuccess: () => { toast({ title: "Permissions updated" }); invalidate(); },
  });

  const suspendMut = useMutation({
    mutationFn: suspendInternalUser,
    onSuccess: () => { toast({ title: "User suspended", variant: "destructive" }); invalidate(); },
  });

  const reactivateMut = useMutation({
    mutationFn: reactivateInternalUser,
    onSuccess: () => { toast({ title: "User reactivated" }); invalidate(); },
  });

  return (
    <AdminLayout
      title="Access & Role Management"
      subtitle="Internal user permissions and access control"
    >
      {isLoading || !data ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[128px] rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-[92px] rounded-xl" />
          <Skeleton className="h-[420px] rounded-xl" />
        </div>
      ) : (
        <div className="space-y-6">
          <AccessSummaryCards summary={data.summary} />
          <UserAccessFilters
            filter={filter}
            onFilter={setFilter}
            q={q}
            onQuery={setQ}
            onAddUser={() => setAddOpen(true)}
          />
          <InternalUsersTable
            rows={data.rows}
            onOpen={(u) => setDetailsUser(u)}
            onChangeRole={(u) => setChangeRoleUser(u)}
            onReviewPermissions={(u) => setPermsUser(u)}
            onSuspend={(u) => setSuspendUser(u)}
            onReactivate={(u) => reactivateMut.mutate({ user_id: u.id, reason: "Reactivated from access console" })}
          />
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
        onSubmit={async (role, level, reason) => {
          if (!changeRoleUser) return;
          await roleMut.mutateAsync({ user_id: changeRoleUser.id, role, access_level: level, reason });
        }}
      />

      <ReviewPermissionsDrawer
        user={permsUser}
        open={!!permsUser}
        onOpenChange={(o) => { if (!o) setPermsUser(null); }}
        onSubmit={async (permissions, reason) => {
          if (!permsUser) return;
          await permsMut.mutateAsync({ user_id: permsUser.id, permissions, reason });
        }}
      />

      <UserDetailsDrawer
        user={detailsUser}
        open={!!detailsUser}
        onOpenChange={(o) => { if (!o) setDetailsUser(null); }}
        onChangeRole={(u) => { setDetailsUser(null); setChangeRoleUser(u); }}
        onReviewPermissions={(u) => { setDetailsUser(null); setPermsUser(u); }}
        onSuspend={(u) => { setDetailsUser(null); setSuspendUser(u); }}
        onReactivate={(u) => { setDetailsUser(null); reactivateMut.mutate({ user_id: u.id, reason: "Reactivated from user drawer" }); }}
      />

      <ActionConfirmDialog
        open={!!suspendUser}
        onOpenChange={(o) => { if (!o) setSuspendUser(null); }}
        title={suspendUser ? `Suspend ${suspendUser.full_name}` : ""}
        description="Suspended internal users lose console access immediately. This action is logged."
        reasonLabel="Reason"
        reasonPlaceholder="Explain why this user is being suspended…"
        confirmLabel="Suspend user"
        confirmTone="danger"
        onConfirm={async (reason) => {
          if (!suspendUser) return;
          await suspendMut.mutateAsync({ user_id: suspendUser.id, reason });
          setSuspendUser(null);
        }}
      />
    </AdminLayout>
  );
}