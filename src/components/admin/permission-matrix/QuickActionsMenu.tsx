import { useState } from "react";
import { ChevronDown, History, RotateCcw, Download, BellRing, ShieldOff } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ExportConfigDialog } from "./ExportConfigDialog";
import { AlertSettingsDrawer } from "./AlertSettingsDrawer";
import { SuspendPermissionDialog } from "./SuspendPermissionDialog";
import { ResetRoleToDefaultDialog } from "./ResetRoleToDefaultDialog";
import type { RoleGrantMap } from "@/services/permission-workspace.service";
import type { PermissionEnvironment } from "@/services/permission-repository";
import { useAdminPermissions } from "@/context/AdminPermissionsContext";
import { INTERNAL_ROLES, ROLE_LABEL, type InternalRoleKey } from "@/services/permission-catalog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function QuickActionsMenu({
  environment,
  roleMap,
  activeFilter,
  onOpenHistory,
  onChanged,
}: {
  environment: string;
  roleMap: RoleGrantMap | undefined;
  activeFilter: { role: string; module: string };
  onOpenHistory: () => void;
  onChanged: () => void;
}) {
  const perms = useAdminPermissions();
  const canExport = perms.has("permissions.view");
  const canManage = perms.has("permissions.manage_permissions");

  const [exportOpen, setExportOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [resetPickerOpen, setResetPickerOpen] = useState(false);
  const [resetRole, setResetRole] = useState<InternalRoleKey | null>(null);
  const [suspendOpen, setSuspendOpen] = useState(false);

  const openResetPicker = () => {
    const preset = activeFilter.role !== "all"
      ? (INTERNAL_ROLES.find((r) => r.key === activeFilter.role)?.key ?? null)
      : null;
    setResetRole(preset);
    setResetPickerOpen(true);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-11 gap-1 text-xs">
            Quick actions <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="text-[12px] uppercase tracking-wide text-muted-foreground">Actions</DropdownMenuLabel>
          <DropdownMenuItem disabled={!canManage} onSelect={openResetPicker}>
            <RotateCcw className="mr-2 h-4 w-4" /> Reset role to default…
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!canExport} onSelect={() => setExportOpen(true)}>
            <Download className="mr-2 h-4 w-4" /> Export configuration…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onOpenHistory}>
            <History className="mr-2 h-4 w-4" /> View change history
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[12px] uppercase tracking-wide text-muted-foreground">Governance</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => setAlertsOpen(true)}>
            <BellRing className="mr-2 h-4 w-4" /> Alert settings…
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!canManage} onSelect={() => setSuspendOpen(true)} className="text-destructive focus:text-destructive">
            <ShieldOff className="mr-2 h-4 w-4" /> Suspend permission…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={resetPickerOpen} onOpenChange={setResetPickerOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Reset role to default</DialogTitle>
            <DialogDescription className="text-xs">
              Choose which role to reset in the <b>{environment}</b> environment. The next step shows the diff, impacted users, and requires a reason.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Select value={resetRole ?? ""} onValueChange={(v) => setResetRole(v as InternalRoleKey)}>
              <SelectTrigger><SelectValue placeholder="Pick a role…" /></SelectTrigger>
              <SelectContent>
                {INTERNAL_ROLES.map((r) => (
                  <SelectItem key={r.key} value={r.key}>{ROLE_LABEL[r.key] ?? r.key}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setResetPickerOpen(false)}>Cancel</Button>
            <Button size="sm" disabled={!resetRole} onClick={() => setResetPickerOpen(false)}>Continue…</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {resetRole && !resetPickerOpen && (
        <ResetRoleToDefaultDialog
          open={!!resetRole}
          onOpenChange={(v) => { if (!v) setResetRole(null); }}
          role={resetRole}
          environment={environment as PermissionEnvironment}
          onDone={() => { setResetRole(null); onChanged(); }}
        />
      )}
      <ExportConfigDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        roleMap={roleMap}
        environment={environment}
        activeFilter={activeFilter}
      />
      <AlertSettingsDrawer open={alertsOpen} onOpenChange={setAlertsOpen} />
      <SuspendPermissionDialog
        open={suspendOpen}
        onOpenChange={setSuspendOpen}
        roleMap={roleMap}
        onSuspended={onChanged}
      />
    </>
  );
}