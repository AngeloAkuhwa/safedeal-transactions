import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAdminPermissions } from "@/context/AdminPermissionsContext";
import type { RoleGrantMap } from "@/services/permission-workspace.service";
import {
  ROLE_LABEL,
  INTERNAL_ROLES,
  getAllPermissionKeys,
  findPermissionEntry,
  getPermissionRisk,
} from "@/services/permission-catalog";

type Format = "csv" | "json";
type Scope = "filtered" | "full";

function rolePermissionState(map: RoleGrantMap | undefined, role: string, key: string) {
  const set = map?.map.get(role);
  if (!set) return "no_access";
  return set.has(key) ? "granted" : "no_access";
}

export function ExportConfigDialog({
  open,
  onOpenChange,
  roleMap,
  environment,
  activeFilter,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  roleMap: RoleGrantMap | undefined;
  environment: string;
  activeFilter: { role: string; module: string };
}) {
  const perms = useAdminPermissions();
  const canExport = perms.has("permissions.view");
  const [format, setFormat] = useState<Format>("csv");
  const [scope, setScope] = useState<Scope>("filtered");
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => {
    const includeRole = (r: string) => scope === "full" || activeFilter.role === "all" || activeFilter.role === r;
    const includeModule = (m: string) => scope === "full" || activeFilter.module === "all" || activeFilter.module === m;
    const out: Array<Record<string, string>> = [];
    const keys = getAllPermissionKeys();
    for (const role of INTERNAL_ROLES) {
      if (!includeRole(role.key)) continue;
      for (const key of keys) {
        const entry = findPermissionEntry(key);
        if (!entry) continue;
        if (!includeModule(entry.module)) continue;
        out.push({
          role_key: role.key,
          role_label: ROLE_LABEL[role.key] ?? role.key,
          permission_key: key,
          module: entry.moduleLabel ?? entry.module,
          state: rolePermissionState(roleMap, role.key, key),
          environment,
          risk: getPermissionRisk(key),
          source: "role_permissions",
        });
      }
    }
    return out;
  }, [roleMap, environment, scope, activeFilter]);

  const download = (filename: string, mime: string, body: string) => {
    const blob = new Blob([body], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  const audit = async (rowCount: number) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return;
      await supabase.from("admin_actions").insert({
        actor_id: session.user.id,
        action_type: "export",
        resource: "permission_matrix",
        metadata: { scope, format, environment, row_count: rowCount, filter: activeFilter },
      } as any);
    } catch { /* audit best-effort */ }
  };

  const handleExport = async () => {
    if (!canExport) return;
    setBusy(true);
    try {
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      if (format === "json") {
        download(`permission-matrix-${environment}-${ts}.json`, "application/json", JSON.stringify({
          environment, scope, exported_at: ts, row_count: rows.length, rows,
        }, null, 2));
      } else {
        const header = ["role_key","role_label","permission_key","module","state","environment","risk","source"];
        const csv = [
          header.join(","),
          ...rows.map((r) => header.map((h) => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(",")),
        ].join("\n");
        download(`permission-matrix-${environment}-${ts}.csv`, "text/csv", csv);
      }
      await audit(rows.length);
      toast.success(`Exported ${rows.length} rows`);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Export configuration</DialogTitle>
          <DialogDescription className="text-xs">
            Downloads role × permission state for the <b>{environment}</b> environment. The export is recorded in Audit Logs.
          </DialogDescription>
        </DialogHeader>

        {!canExport ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            You do not have permission to export the matrix.
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs uppercase text-muted-foreground">Scope</Label>
              <RadioGroup value={scope} onValueChange={(v) => setScope(v as Scope)} className="mt-1 space-y-1">
                <div className="flex items-center gap-2"><RadioGroupItem value="filtered" id="s-f" /><Label htmlFor="s-f" className="text-sm">Filtered view (respects current role &amp; module filters)</Label></div>
                <div className="flex items-center gap-2"><RadioGroupItem value="full" id="s-a" /><Label htmlFor="s-a" className="text-sm">Full configuration (all roles &amp; modules)</Label></div>
              </RadioGroup>
            </div>
            <div>
              <Label className="text-xs uppercase text-muted-foreground">Format</Label>
              <RadioGroup value={format} onValueChange={(v) => setFormat(v as Format)} className="mt-1 space-y-1">
                <div className="flex items-center gap-2"><RadioGroupItem value="csv" id="f-c" /><Label htmlFor="f-c" className="text-sm">CSV</Label></div>
                <div className="flex items-center gap-2"><RadioGroupItem value="json" id="f-j" /><Label htmlFor="f-j" className="text-sm">JSON</Label></div>
              </RadioGroup>
            </div>
            <div className="rounded-md border border-border/60 bg-background/40 p-2 text-[12px] text-muted-foreground">
              {rows.length} rows will be exported.
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" disabled={!canExport || busy || rows.length === 0} onClick={handleExport}>
            {busy ? "Exporting…" : "Download"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}