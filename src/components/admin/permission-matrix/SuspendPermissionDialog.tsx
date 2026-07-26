import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronsUpDown, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAdminPermissions } from "@/context/AdminPermissionsContext";
import {
  getAllPermissionKeys,
  findPermissionEntry,
  INTERNAL_ROLES,
  ROLE_LABEL,
} from "@/services/permission-catalog";
import type { RoleGrantMap } from "@/services/permission-workspace.service";
import { permissionRepo } from "@/services/permission-repository";
import { invalidateRoleGrantMap } from "@/services/permission-workspace.service";

/**
 * Marks a permission's status = 'suspended'. Route/UI gates hide the
 * permission afterwards, but existing grants remain in place until they're
 * explicitly removed via the matrix. Requires an approver-eligible reason and
 * writes to admin_actions for audit.
 */
export function SuspendPermissionDialog({
  open,
  onOpenChange,
  roleMap,
  onSuspended,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  roleMap: RoleGrantMap | undefined;
  onSuspended?: () => void;
}) {
  const perms = useAdminPermissions();
  const canManage = perms.has("permissions.manage_permissions");

  const [permKey, setPermKey] = useState<string>("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (!open) { setPermKey(""); setReason(""); }
  }, [open]);

  const options = useMemo(() => {
    return getAllPermissionKeys().map((k) => {
      const e = findPermissionEntry(k);
      return { key: k, label: e?.label ?? k, module: e?.moduleLabel ?? "", status: e?.status ?? "active" };
    }).filter((o) => o.status === "active");
  }, [open]);

  const usage = useMemo(() => {
    if (!permKey || !roleMap) return [] as string[];
    const roles: string[] = [];
    for (const r of INTERNAL_ROLES) {
      if (roleMap.map.get(r.key)?.has(permKey)) roles.push(ROLE_LABEL[r.key] ?? r.key);
    }
    return roles;
  }, [permKey, roleMap]);

  const submit = async () => {
    if (!canManage) return;
    if (!permKey) { toast.error("Choose a permission"); return; }
    if (reason.trim().length < 20) { toast.error("Reason must be at least 20 characters"); return; }
    setBusy(true);
    try {
      await permissionRepo.updatePermission(permKey, { status: "suspended" });
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) {
        await supabase.from("admin_actions").insert({
          actor_id: session.user.id,
          action_type: "suspend_permission",
          resource: "permissions",
          resource_id: permKey,
          metadata: { permission_key: permKey, reason, roles_previously_holding: usage },
        } as any);
      }
      invalidateRoleGrantMap();
      toast.success("Permission suspended", {
        description: usage.length
          ? `${usage.length} role(s) still hold this permission; existing grants remain until removed.`
          : "No roles currently hold this permission.",
      });
      onSuspended?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to suspend");
    } finally {
      setBusy(false);
    }
  };

  const selectedLabel = permKey ? (findPermissionEntry(permKey)?.label ?? permKey) : "Select a permission…";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ShieldOff className="h-4 w-4" /> Suspend permission</DialogTitle>
          <DialogDescription className="text-xs">
            A suspended permission is hidden from role assignments and UI gates.
            Existing grants remain until removed. This action is audited and reversible.
          </DialogDescription>
        </DialogHeader>

        {!canManage ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            You need permissions.manage_permissions to suspend permissions.
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase text-muted-foreground">Permission</Label>
              <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between text-sm font-normal">
                    <span className="truncate">{selectedLabel}</span>
                    <ChevronsUpDown className="h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[460px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search permissions…" />
                    <CommandList>
                      <CommandEmpty>No matching permission.</CommandEmpty>
                      <CommandGroup>
                        {options.map((o) => (
                          <CommandItem key={o.key} value={`${o.label} ${o.key} ${o.module}`} onSelect={() => { setPermKey(o.key); setPickerOpen(false); }}>
                            <div className="flex w-full items-center justify-between gap-2">
                              <span className="truncate">{o.label}</span>
                              <span className="text-[10px] text-muted-foreground">{o.key}</span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {permKey && (
              <div className="rounded-md border border-border/60 bg-background/40 p-2 text-xs">
                <div className="text-muted-foreground">Currently held by</div>
                <div className="mt-1 font-medium">
                  {usage.length === 0 ? "No roles" : usage.join(", ")}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs uppercase text-muted-foreground">Reason (min 20 chars, audited)</Label>
              <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this permission being suspended?" />
              <div className="text-[10px] text-muted-foreground">{reason.trim().length}/20</div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" variant="destructive" disabled={!canManage || busy || !permKey || reason.trim().length < 20} onClick={submit}>
            {busy ? "Suspending…" : "Suspend permission"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}