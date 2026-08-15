import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { INTERNAL_ROLES, ROLE_LABEL, type InternalRoleKey } from "@/services/permission-catalog";
import { cloneRoleAsTemplate } from "@/services/permission-workspace.service";
import { toast } from "@/hooks/use-toast";

export function CloneRoleAsTemplateDialog({
  open, onOpenChange, role, onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  role: InternalRoleKey | null;
  onDone?: (templateId: string) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && role) {
      setName(`${ROLE_LABEL[role]} template`);
      setDescription("");
    }
  }, [open, role]);

  const submit = async () => {
    if (!role || !name.trim()) return;
    setBusy(true);
    try {
      const t = await cloneRoleAsTemplate(role, name.trim(), description.trim());
      toast({ title: "Template saved", description: `${t.name} · ${t.permission_keys.length} permissions` });
      onDone?.(t.id);
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Could not save", description: e?.message ?? String(e), variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Clone {role ? ROLE_LABEL[role] : "role"} as template</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-xs text-muted-foreground">
            Captures the current permission bag as a reusable custom template. Apply it to any role from the Permission Templates tab.
          </p>
          <label className="block">
            <span className="mb-1 block text-[11px] uppercase text-muted-foreground">Template name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className="h-11 w-full rounded-md border border-border bg-background px-2 text-sm" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] uppercase text-muted-foreground">Description</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full rounded-md border border-border bg-background p-2 text-xs" placeholder="Optional — where this template applies" />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !name.trim()}>Save template</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
