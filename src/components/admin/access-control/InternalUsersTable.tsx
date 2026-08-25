import { KeyRound, MoreHorizontal, ShieldAlert, RefreshCcw, Ban, Undo2, Eye, History, MailPlus, UserMinus, Trash2, CalendarClock } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { InternalUser } from "@/services/admin-access-control.service";
import { relativeTime } from "@/services/admin-access-control.service";
import { AccessLevelPill, InitialsAvatar, RoleBadge, StatusBadge } from "./badges";
import { keyActivate } from "@/lib/a11y";
import { ADMIN_TONE } from "@/components/admin/palette";

interface Props {
  rows: InternalUser[];
  onOpen: (u: InternalUser) => void;
  onChangeRole: (u: InternalUser) => void;
  onReviewPermissions: (u: InternalUser) => void;
  onViewHistory: (u: InternalUser) => void;
  onSuspend: (u: InternalUser) => void;
  onReactivate: (u: InternalUser) => void;
  onDeactivate: (u: InternalUser) => void;
  onResendInvite: (u: InternalUser) => void;
  onDeleteInvited: (u: InternalUser) => void;
  onExtendAccess: (u: InternalUser) => void;
}

function ringFor(u: InternalUser): "critical" | "elevated" | "high" | "none" {
  if (u.access_level === "full") return "critical";
  if (u.access_level === "high") return "high";
  return "none";
}

export function InternalUsersTable({
  rows, onOpen, onChangeRole, onReviewPermissions, onViewHistory,
  onSuspend, onReactivate, onDeactivate, onResendInvite,
  onDeleteInvited, onExtendAccess,
}: Props) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border p-5">
        <h3 className=" text-base font-semibold text-foreground">Internal Access Management</h3>
        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          <ShieldAlert className={`h-3 w-3 ${ADMIN_TONE.warning.text}`} />
          Manage admin and agent permissions, roles, and access levels. Changes are logged and require approval
        </p>
      </div>

      <div className="divide-y divide-border lg:hidden">
        {rows.map((u) => (
          <article role="button" tabIndex={0} onKeyDown={keyActivate} key={u.id} className="space-y-3 p-4" onClick={() => onOpen(u)}>
            <div className="flex items-start gap-3"><InitialsAvatar name={u.full_name} ring={ringFor(u)} /><div className="min-w-0 flex-1"><p className="truncate font-medium">{u.full_name}</p><p className="truncate text-xs text-muted-foreground">{u.email}</p><p className="text-xs text-muted-foreground">#{u.display_id} · {u.department ?? "No team"} · Last active {relativeTime(u.last_active_at)}</p></div><div className="flex shrink-0 items-center gap-1"><StatusBadge status={u.status} /><span role="button" tabIndex={0} onKeyDown={keyActivate} onClick={(e) => e.stopPropagation()}><RowActionsMenu u={u} actions={{ onOpen, onChangeRole, onReviewPermissions, onViewHistory, onSuspend, onReactivate, onDeactivate, onResendInvite, onDeleteInvited, onExtendAccess }} /></span></div></div>
            <div className="flex flex-wrap gap-2"><RoleBadge role={u.primary_role} /><AccessLevelPill level={u.access_level} /></div>
            <button type="button" className="min-h-11 w-full rounded-md border border-border px-3 text-sm font-medium" onClick={(e) => { e.stopPropagation(); onOpen(u); }}>View access details</button>
          </article>
        ))}
      </div>
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-3">User</th>
              <th className="px-5 py-3">Employee ID</th>
              <th className="px-5 py-3">Email</th>
              <th className="px-5 py-3">Department / Team</th>
              <th className="px-5 py-3">Primary Role</th>
              <th className="px-5 py-3">
                <span className="inline-flex items-center gap-1">
                  <ShieldAlert className={`h-3 w-3 ${ADMIN_TONE.warning.text}`} /> Effective Access
                </span>
              </th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Last Active</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((u) => {
              const suspended = u.status === "suspended" || u.status === "locked";
              const deactivated = u.status === "deactivated";
              return (
                <tr role="button" tabIndex={0} onKeyDown={keyActivate}
                  key={u.id}
                  onClick={() => onOpen(u)}
                  className={`cursor-pointer transition-colors hover:bg-muted/40 ${
                    suspended ? "access-row-suspended" : ""
                  } ${deactivated ? "opacity-60" : ""}`}
                >
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <InitialsAvatar name={u.full_name} ring={ringFor(u)} />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{u.full_name}</p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 font-mono text-xs text-foreground/80">#{u.display_id}</td>
                  <td className="px-5 py-4 text-foreground/80">{u.email}</td>
                  <td className="px-5 py-4 text-foreground/80">{u.department ?? "—"}</td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-1">
                      <RoleBadge role={u.primary_role} />
                      {u.roles.length > 1 && (
                        <span className="rounded-full border border-border bg-muted/60 px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                          +{u.roles.length - 1}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4"><AccessLevelPill level={u.access_level} /></td>
                  <td className="px-5 py-4"><StatusBadge status={u.status} /></td>
                  <td className="px-5 py-4 text-xs text-muted-foreground">{relativeTime(u.last_active_at)}</td>
                  <td role="button" tabIndex={0} onKeyDown={keyActivate} className="px-5 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <RowActionsMenu u={u} actions={{ onOpen, onChangeRole, onReviewPermissions, onViewHistory, onSuspend, onReactivate, onDeactivate, onResendInvite, onDeleteInvited, onExtendAccess }} />
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-5 py-12 text-center text-sm text-muted-foreground">
                  No internal users match your current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}


type RowActions = Pick<
  Props,
  "onOpen" | "onChangeRole" | "onReviewPermissions" | "onViewHistory" | "onSuspend" |
  "onReactivate" | "onDeactivate" | "onResendInvite" | "onDeleteInvited" | "onExtendAccess"
>;

/**
 * The complete row action set. Shared by the desktop table cell and the mobile
 * card so no action is lost below the lg breakpoint.
 */
function RowActionsMenu({ u, actions }: { u: InternalUser; actions: RowActions }) {
  const suspended = u.status === "suspended" || u.status === "locked";
  const deactivated = u.status === "deactivated";
  const invited = u.status === "invited";
  const nowMs = Date.now();
  const expiresMs = u.access_expires_at ? new Date(u.access_expires_at).getTime() : null;
  const isExpired = expiresMs !== null && expiresMs < nowMs;
  const nearExpiry = expiresMs !== null && expiresMs - nowMs < 14 * 24 * 60 * 60 * 1000;
  const canResend = invited || (u as { invitation_status?: string }).invitation_status === "expired";
  const canExtend = expiresMs !== null && (isExpired || nearExpiry);
  const canHardDelete = invited || deactivated;
  const {
    onOpen, onChangeRole, onReviewPermissions, onViewHistory, onSuspend,
    onReactivate, onDeactivate, onResendInvite, onDeleteInvited, onExtendAccess,
  } = actions;
  return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title="Row actions"
            aria-label={`Actions for ${u.full_name}`}
             className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => onOpen(u)}>
            <Eye className="mr-2 h-4 w-4" /> View User
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onChangeRole(u)}>
            <RefreshCcw className="mr-2 h-4 w-4" /> Change Role
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onReviewPermissions(u)}>
            <KeyRound className="mr-2 h-4 w-4" /> Review Permissions
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onViewHistory(u)}>
            <History className="mr-2 h-4 w-4" /> View Access History
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {canResend && (
            <DropdownMenuItem onClick={() => onResendInvite(u)}>
              <MailPlus className="mr-2 h-4 w-4" /> Resend Invitation
            </DropdownMenuItem>
          )}
          {canExtend && (
            <DropdownMenuItem onClick={() => onExtendAccess(u)}>
              <CalendarClock className="mr-2 h-4 w-4" /> Extend Access
            </DropdownMenuItem>
          )}
          {suspended ? (
            <DropdownMenuItem onClick={() => onReactivate(u)}>
              <Undo2 className="mr-2 h-4 w-4" /> Reactivate User
            </DropdownMenuItem>
          ) : (
            u.status === "active" && (
              <DropdownMenuItem
                onClick={() => onSuspend(u)}
                className="text-red-500 focus:text-red-500"
              >
                <Ban className="mr-2 h-4 w-4" /> Suspend User
              </DropdownMenuItem>
            )
          )}
          {!deactivated && (
            <DropdownMenuItem
              onClick={() => onDeactivate(u)}
              className="text-red-500 focus:text-red-500"
            >
              <UserMinus className="mr-2 h-4 w-4" /> Deactivate User
            </DropdownMenuItem>
          )}
          {canHardDelete && (
            <DropdownMenuItem
              onClick={() => onDeleteInvited(u)}
              className="text-red-500 focus:text-red-500"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {invited ? "Delete Invited User" : "Delete User"}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
  );
}
