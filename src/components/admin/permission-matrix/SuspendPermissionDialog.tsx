import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronsUpDown, ShieldOff, ShieldCheck } from "lucide-react";
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
 * Flips permissions.assignable so the permission is no longer offered in
 * pickers (matrix "grant", override drawer). Existing role_permissions and
 * user_permission_overrides remain in place so the underlying product feature
 * stays available until explicitly removed. Requires an approver-eligible
 * reason and writes to admin_actions for audit. Reversible via the same
 * dialog when the target permission is already non-assignable.
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
  const [assignableByKey, setAssignableByKey] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open) { setPermKey(""); setReason(""); }
  }, [open]);

  // Load current assignable flags so the dialog can render either "Suspend" or
  // "Un-suspend" for the selected permission.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from("permissions")
        .select("key,assignable");
      if (cancelled || !data) return;
      const map: Record<string, boolean> = {};
      for (const row of data as Array<{ key: string; assignable: boolean | null }>) {
        map[row.key] = row.assignable !== false;
      }
      setAssignableByKey(map);
    })();
    return () => { cancelled = true; };
  }, [open]);

  const options = useMemo(() => {
    return getAllPermissionKeys().map((k) => {
      const e = findPermissionEntry(k);
      return {
        key: k,
        label: e?.label ?? k,
        module: e?.moduleLabel ?? "",
        status: e?.status ?? "active",
        assignable: assignableByKey[k] !== false,
      };
    }).filter((o) => o.status === "active");
  }, [open, assignableByKey]);

  const usage = useMemo(() => {
    if (!permKey || !roleMap) return [] as string[];
    const roles: string[] = [];
    for (const r of INTERNAL_ROLES) {
      if (roleMap.map.get(r.key)?.has(permKey)) roles.push(ROLE_LABEL[r.key] ?? r.key);
    }
    return roles;
  }, [permKey, roleMap]);

  const currentlyAssignable = permKey ? assignableByKey[permKey] !== false : true;
  const nextAssignable = !currentlyAssignable; // toggle
  const actionLabel = currentlyAssignable ? "Suspend assignment" : "Un-suspend assignment";

  const submit = async () => {
    if (!canManage) return;
    if (!permKey) { toast.error("Choose a permission"); return; }
    if (reason.trim().length < 20) { toast.error("Reason must be at least 20 characters"); return; }
    setBusy(true);
    try {
      await permissionRepo.setPermissionAssignable(permKey, nextAssignable, reason.trim());
      invalidateRoleGrantMap();
      toast.success(
        nextAssignable ? "Permission is now assignable again" : "New assignment suspended",
        {
          description: nextAssignable
            ? "The permission is available in role and override pickers again."
            : (usage.length
                ? `${usage.length} role(s) still hold this permission; existing grants remain until removed.`
                : "No roles currently hold this permission; new grants are blocked."),
        },
      );
      setAssignableByKey((m) => ({ ...m, [permKey]: nextAssignable }));
      onSuspended?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const selectedLabel = permKey ? (findPermissionEntry(permKey)?.label ?? permKey) : "Select a permission…";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {currentlyAssignable ? <ShieldOff className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
            {currentlyAssignable ? "Suspend permission assignment" : "Un-suspend permission assignment"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Prevents new assignment of this permission. Existing grants remain
            in place and the underlying product feature stays available. This
            action is audited and reversible.
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
                              <span className="flex items-center gap-2">
                                {!o.assignable && (
                                  <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-xs uppercase tracking-wider text-amber-300">Suspended</span>
                                )}
                                <span className="text-xs text-muted-foreground">{o.key}</span>
                              </span>
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
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-muted-foreground">Assignable</span>
                  <span className={`rounded-full border px-1.5 py-0.5 text-xs uppercase tracking-wider ${currentlyAssignable ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-amber-500/30 bg-amber-500/10 text-amber-300"}`}>
                    {currentlyAssignable ? "Yes" : "No"}
                  </span>
                </div>
                <div className="text-muted-foreground">Currently held by</div>
                <div className="mt-1 font-medium">
                  {usage.length === 0 ? "No roles" : usage.join(", ")}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs uppercase text-muted-foreground">Reason (min 20 chars, audited)</Label>
              <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder={currentlyAssignable ? "Why is new assignment being suspended?" : "Why is this permission being reinstated?"} />
              <div className="text-xs text-muted-foreground">{reason.trim().length}/20</div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            size="sm"
            variant={currentlyAssignable ? "destructive" : "default"}
            disabled={!canManage || busy || !permKey || reason.trim().length < 20}
            onClick={submit}
          >
            {busy ? "Working…" : actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}