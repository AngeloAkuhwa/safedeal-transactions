import { useEffect, useState } from "react";
import { INTERNAL_ROLES, ROLE_LABEL, type InternalRoleKey } from "@/services/permission-catalog";
import { cloneRoleAsTemplate, deleteTemplate, listTemplates, type PermissionTemplate } from "@/services/permission-workspace.service";
import { EmptyState } from "./EmptyState";
import { Copy, Trash2, Plus } from "lucide-react";

export function PermissionTemplateTable({ canEdit }: { canEdit: boolean }) {
  const [templates, setTemplates] = useState<PermissionTemplate[]>([]);
  const [role, setRole] = useState<InternalRoleKey>("support_agent");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = () => setTemplates(listTemplates());
  useEffect(() => { reload(); }, []);

  const create = async () => {
    if (!canEdit) return;
    setBusy(true);
    try {
      await cloneRoleAsTemplate(role, name || `${ROLE_LABEL[role]} template`);
      setName("");
      reload();
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      {canEdit && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-3">
          <label className="min-w-[180px]">
            <span className="mb-1 block text-[11px] uppercase text-muted-foreground">Clone role</span>
            <select value={role} onChange={(e) => setRole(e.target.value as InternalRoleKey)} className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm">
              {INTERNAL_ROLES.map((r) => <option key={r.key} value={r.key}>{ROLE_LABEL[r.key]}</option>)}
            </select>
          </label>
          <label className="min-w-[220px] flex-1">
            <span className="mb-1 block text-[11px] uppercase text-muted-foreground">Template name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm" placeholder="e.g. Compliance analyst template" />
          </label>
          <button
            type="button"
            onClick={create}
            disabled={busy}
            className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" /> Save template
          </button>
        </div>
      )}
      {templates.length === 0 ? (
        <EmptyState
          title="No templates yet"
          description={canEdit ? "Clone any existing role to save a reusable permission bundle." : "Templates saved by admins will appear here."}
          icon={<Copy className="h-5 w-5" />}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs uppercase text-muted-foreground">
                <th className="px-4 py-2 text-left font-medium">Template</th>
                <th className="px-4 py-2 text-left font-medium">Source role</th>
                <th className="px-4 py-2 text-right font-medium">Permissions</th>
                <th className="px-4 py-2 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2">
                    <div className="text-sm font-medium">{t.name}</div>
                    {t.description && <div className="text-xs text-muted-foreground">{t.description}</div>}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{t.role_source ? ROLE_LABEL[t.role_source] : "—"}</td>
                  <td className="px-4 py-2 text-right font-mono text-xs">{t.permission_keys.length}</td>
                  <td className="px-4 py-2 text-right">
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => { deleteTemplate(t.id); reload(); }}
                        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" /> Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
