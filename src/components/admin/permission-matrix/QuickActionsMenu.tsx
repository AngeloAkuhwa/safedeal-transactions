import { useState } from "react";
import { ChevronDown, History, RotateCcw, Download, BellRing, ShieldOff } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ExportConfigDialog } from "./ExportConfigDialog";
import { AlertSettingsDrawer } from "./AlertSettingsDrawer";
import { SuspendPermissionDialog } from "./SuspendPermissionDialog";
import { ResetRoleToDefaultDialog } from "./ResetRoleToDefaultDialog";
import type { RoleGrantMap } from "@/services/permission-workspace.service";
import { useAdminPermissions } from "@/context/AdminPermissionsContext";

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
  const [resetOpen, setResetOpen] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1 text-xs">
            Quick actions <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">Actions</DropdownMenuLabel>
          <DropdownMenuItem disabled={!canManage} onSelect={() => setResetOpen(true)}>
            <RotateCcw className="mr-2 h-4 w-4" /> Reset role to default…
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!canExport} onSelect={() => setExportOpen(true)}>
            <Download className="mr-2 h-4 w-4" /> Export configuration…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onOpenHistory}>
            <History className="mr-2 h-4 w-4" /> View change history
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">Governance</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => setAlertsOpen(true)}>
            <BellRing className="mr-2 h-4 w-4" /> Alert settings…
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!canManage} onSelect={() => setSuspendOpen(true)} className="text-destructive focus:text-destructive">
            <ShieldOff className="mr-2 h-4 w-4" /> Suspend permission…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ResetRoleToDefaultDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        onDone={onChanged}
      />
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