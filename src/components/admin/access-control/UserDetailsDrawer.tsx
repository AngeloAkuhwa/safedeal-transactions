import { useQuery } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Ban, Undo2, KeyRound, RefreshCcw, ShieldCheck } from "lucide-react";
import type { InternalUser } from "@/services/admin-access-control.service";
import { fetchAccessAudit, relativeTime } from "@/services/admin-access-control.service";
import { AccessLevelPill, InitialsAvatar, RoleBadge, StatusBadge } from "./badges";

interface Props {
  user: InternalUser | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onChangeRole: (u: InternalUser) => void;
  onReviewPermissions: (u: InternalUser) => void;
  onSuspend: (u: InternalUser) => void;
  onReactivate: (u: InternalUser) => void;
}

const SEVERITY_TINT: Record<string, string> = {
  info: "bg-blue-500/10 text-blue-300 border-blue-500/30",
  warning: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  critical: "bg-red-500/10 text-red-300 border-red-500/40",
};

export function UserDetailsDrawer({
  user, open, onOpenChange,
  onChangeRole, onReviewPermissions, onSuspend, onReactivate,
}: Props) {
  const { data: audit } = useQuery({
    queryKey: ["access-audit", user?.id],
    queryFn: () => fetchAccessAudit(user!.id),
    enabled: !!user,
  });

  if (!user) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader><SheetTitle>User details</SheetTitle></SheetHeader>

        <div className="mt-4 flex items-center gap-3">
          <InitialsAvatar name={user.full_name} ring={user.access_level === "full" ? "critical" : user.access_level === "elevated" ? "elevated" : "none"} />
          <div className="min-w-0">
            <div className="truncate text-base font-semibold text-foreground">{user.full_name}</div>
            <div className="text-xs text-muted-foreground">#{user.display_id} · {user.email}</div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <div className="text-xs text-muted-foreground">Role</div>
            <div className="mt-1"><RoleBadge role={user.role} /></div>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <div className="text-xs text-muted-foreground">Access</div>
            <div className="mt-1"><AccessLevelPill level={user.access_level} /></div>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <div className="text-xs text-muted-foreground">Status</div>
            <div className="mt-1"><StatusBadge status={user.status} /></div>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <div className="text-xs text-muted-foreground">Last active</div>
            <div className="mt-1 text-foreground/90">{relativeTime(user.last_active_at)}</div>
          </div>
          <div className="col-span-2 flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            <ShieldCheck className={`h-4 w-4 ${user.two_factor_enabled ? "text-emerald-400" : "text-amber-400"}`} />
            {user.two_factor_enabled ? "Two-factor authentication enabled" : "Two-factor authentication NOT enabled"}
          </div>
        </div>

        <Separator className="my-5" />

        <div>
          <h4 className="mb-2 text-sm font-semibold text-foreground">Permissions ({user.permissions.length})</h4>
          <div className="flex flex-wrap gap-1.5">
            {user.permissions.length === 0 && (
              <span className="text-xs text-muted-foreground">No permissions assigned.</span>
            )}
            {user.permissions.map((p) => (
              <span key={p} className="rounded-md border border-border bg-muted/60 px-2 py-0.5 text-[11px] font-mono text-foreground/80">
                {p}
              </span>
            ))}
          </div>
        </div>

        <Separator className="my-5" />

        <div>
          <h4 className="mb-2 text-sm font-semibold text-foreground">Access history</h4>
          <div className="space-y-2">
            {(audit ?? []).length === 0 && (
              <div className="text-xs text-muted-foreground">No changes recorded.</div>
            )}
            {(audit ?? []).map((a) => (
              <div key={a.id} className={`rounded-lg border px-3 py-2 text-xs ${SEVERITY_TINT[a.severity]}`}>
                <div className="font-semibold text-foreground">{a.action.split("_").join(" ")}</div>
                <div>{a.detail}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {a.actor_name} · {relativeTime(a.created_at)}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="sticky bottom-0 -mx-6 mt-6 flex flex-wrap gap-2 border-t border-border bg-background/95 p-4 backdrop-blur">
          <Button size="sm" variant="outline" onClick={() => onChangeRole(user)}>
            <RefreshCcw className="mr-2 h-4 w-4" /> Change role
          </Button>
          <Button size="sm" variant="outline" onClick={() => onReviewPermissions(user)}>
            <KeyRound className="mr-2 h-4 w-4" /> Permissions
          </Button>
          {user.status === "suspended" ? (
            <Button size="sm" onClick={() => onReactivate(user)}>
              <Undo2 className="mr-2 h-4 w-4" /> Reactivate
            </Button>
          ) : (
            <Button size="sm" variant="destructive" onClick={() => onSuspend(user)}>
              <Ban className="mr-2 h-4 w-4" /> Suspend
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}