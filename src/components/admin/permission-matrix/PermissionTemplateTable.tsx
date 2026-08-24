import { useEffect, useMemo, useState } from "react";
import {
  INTERNAL_ROLES, PERMISSION_MODULES, ROLE_LABEL,
  isPrivilegedPermission, type InternalRoleKey,
} from "@/services/permission-catalog";
import {
  cloneRoleAsTemplate, deleteTemplate, listTemplates,
  computeApplyTemplateDiff, stageApplyTemplateToRole,
  fetchRoleUserCounts, fetchTemplateRoleUsage,
  type PermissionTemplate, type ApplyTemplateDiff,
} from "@/services/permission-workspace.service";
import { permissionRepo } from "@/services/permission-repository";
import { EmptyState } from "./EmptyState";
import { toast } from "@/hooks/use-toast";
import { Copy, Archive, Plus, Eye, GitCompare, Download, ArrowRightLeft, Lock, ShieldAlert } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useCurrentEnvironment } from "./EnvironmentSwitcher";
import { TemplateCompareDialog } from "./TemplateCompareDialog";
import { ADMIN_TONE } from "@/components/admin/palette";

export function PermissionTemplateTable({ canEdit }: { canEdit: boolean }) {
  const [templates, setTemplates] = useState<PermissionTemplate[]>([]);
  const [usage, setUsage] = useState<Map<string, string[]>>(new Map());
  const [scope, setScope] = useState<"all"|"system"|"custom">("all");
  const [statusFilter, setStatusFilter] = useState<"active"|"archived"|"all">("active");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<PermissionTemplate | null>(null);
  const [applyFor, setApplyFor] = useState<PermissionTemplate | null>(null);
  const [cloneFor, setCloneFor] = useState<PermissionTemplate | null>(null);
  const [compareFor, setCompareFor] = useState<PermissionTemplate | null>(null);
  const env = useCurrentEnvironment();

  const reload = () => {
    listTemplates().then(setTemplates).catch(() => setTemplates([]));
    fetchTemplateRoleUsage(env).then((m) => setUsage(m as Map<string, string[]>)).catch(() => setUsage(new Map()));
  };
  useEffect(() => { reload(); }, [env]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates.filter((t) => {
      if (scope === "system" && !t.is_system) return false;
      if (scope === "custom" && t.is_system) return false;
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (q && !`${t.name} ${t.description}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [templates, scope, statusFilter, search]);

  const modulesFor = (keys: string[]) => {
    const set = new Set<string>();
    for (const k of keys) set.add(k.split(".")[0]);
    return PERMISSION_MODULES.filter((m) => set.has(m.key)).map((m) => m.label);
  };

  const exportTemplate = (t: PermissionTemplate) => {
    const payload = {
      name: t.name, description: t.description, is_system: t.is_system,
      modules: modulesFor(t.permission_keys),
      permissions: t.permission_keys.sort(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${t.name.replace(/\s+/g, "-").toLowerCase()}.json`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  const archive = async (t: PermissionTemplate) => {
    if (t.is_system) return;
    try { await permissionRepo.archiveTemplate(t.id); toast({ title: "Template archived" }); reload(); }
    catch (e: any) { toast({ title: "Could not archive", description: e?.message, variant: "destructive" }); }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border/60 bg-card/40 p-3">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search templates…"
          className="h-11 min-w-[220px] flex-1 rounded-md border border-border bg-background px-3 text-sm" />
        <select value={scope} onChange={(e) => setScope(e.target.value as any)} className="h-9 rounded-md border border-border bg-background px-2 text-sm relative before:absolute before:-inset-2 before:content-['']">
          <option value="all">All scopes</option><option value="system">System</option><option value="custom">Custom</option>
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="h-9 rounded-md border border-border bg-background px-2 text-sm relative before:absolute before:-inset-2 before:content-['']">
          <option value="active">Active</option><option value="archived">Archived</option><option value="all">All statuses</option>
        </select>
        {canEdit && (
          <Button size="sm" onClick={() => setCloneFor({ id: "__new__" } as any)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> New from role
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No templates match" description="Adjust filters or seed system templates." icon={<Copy className="h-5 w-5" />} />
      ) : (
        <div className="rounded-2xl border border-border/50 bg-card/60 p-2">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-separate border-spacing-y-1 text-sm sd-stack">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2 text-left font-medium">Template</th>
                  <th className="px-4 py-2 text-left font-medium">Modules</th>
                  <th className="px-4 py-2 text-right font-medium">Perms</th>
                  <th className="px-4 py-2 text-right font-medium">Privileged</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                  <th className="px-4 py-2 text-left font-medium">Roles using</th>
                  <th className="px-4 py-2 text-left font-medium">Updated</th>
                  <th className="px-4 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => {
                  const mods = modulesFor(t.permission_keys);
                  const priv = t.permission_keys.filter(isPrivilegedPermission).length;
                  return (
                    <tr key={t.id} className="[&>td]:bg-background/30 [&>td:first-child]:rounded-l-lg [&>td:last-child]:rounded-r-lg">
                      <td className="px-4 py-3 align-top">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          {t.is_system && <Lock className="h-3 w-3 text-primary" />}{t.name}
                        </div>
                        {t.description && <div className="line-clamp-1 text-xs text-muted-foreground">{t.description}</div>}
                        {t.role_source && <div className="text-xs text-muted-foreground">Source: {ROLE_LABEL[t.role_source]}</div>}
                      </td>
                      <td className="px-4 py-3 align-top text-xs text-muted-foreground">
                        {mods.slice(0, 3).join(", ")}{mods.length > 3 ? ` +${mods.length - 3}` : ""}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs">{t.permission_keys.length}</td>
                      <td className="px-4 py-3 text-right text-xs">
                        {priv > 0 ? <span className="text-amber-300">{priv}</span> : <span className="text-muted-foreground">0</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full border px-2 py-0.5 text-xs uppercase ${t.status === "active" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-border bg-muted/40 text-muted-foreground"}`}>{t.status}</span>
                        {t.is_system && <span className="ml-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs uppercase text-primary">System</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {(() => {
                          const roles = usage.get(t.id) ?? [];
                          if (!roles.length) return <span className="italic text-muted-foreground/60">None</span>;
                          const label = (k: string) => (ROLE_LABEL as any)[k] ?? k;
                          return (
                            <span title={roles.map(label).join(", ")}>
                              {roles.length} · {roles.slice(0, 2).map(label).join(", ")}{roles.length > 2 ? ` +${roles.length - 2}` : ""}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(t.updated_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-wrap justify-end gap-1">
                          <IconBtn onClick={() => setView(t)} icon={<Eye className="h-3 w-3" />} label="View" />
                          <IconBtn onClick={() => setCompareFor(t)} icon={<GitCompare className="h-3 w-3" />} label="Compare" />
                          {canEdit && <IconBtn onClick={() => setApplyFor(t)} icon={<ArrowRightLeft className="h-3 w-3" />} label="Apply" />}
                          {canEdit && <IconBtn onClick={() => setCloneFor(t)} icon={<Copy className="h-3 w-3" />} label="Clone" />}
                          <IconBtn onClick={() => exportTemplate(t)} icon={<Download className="h-3 w-3" />} label="Export" />
                          {canEdit && !t.is_system && <IconBtn onClick={() => archive(t)} icon={<Archive className="h-3 w-3" />} label="Archive" />}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ViewTemplateSheet template={view} onOpenChange={(v) => !v && setView(null)} />
      <TemplateCompareDialog template={compareFor} open={!!compareFor} onOpenChange={(v) => !v && setCompareFor(null)} />
      <ApplyTemplateDialog template={applyFor} onOpenChange={(v) => !v && setApplyFor(null)} env={env} onDone={reload} />
      <CloneTemplateDialog request={cloneFor} onOpenChange={(v) => !v && setCloneFor(null)} onDone={reload} />
    </div>
  );
}

function IconBtn({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-muted min-h-11">
      {icon}{label}
    </button>
  );
}

function ViewTemplateSheet({ template, onOpenChange }: { template: PermissionTemplate | null; onOpenChange: (v: boolean) => void }) {
  const grouped = useMemo(() => {
    if (!template) return [];
    const byModule = new Map<string, string[]>();
    for (const k of template.permission_keys) {
      const m = k.split(".")[0];
      const bag = byModule.get(m) ?? []; bag.push(k); byModule.set(m, bag);
    }
    return PERMISSION_MODULES.filter((m) => byModule.has(m.key)).map((m) => ({ module: m.label, keys: (byModule.get(m.key) ?? []).sort() }));
  }, [template]);
  return (
    <Sheet open={!!template} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader><SheetTitle>{template?.name}</SheetTitle></SheetHeader>
        {template && (
          <div className="mt-3 space-y-4 text-sm">
            {template.description && <p className="text-muted-foreground">{template.description}</p>}
            <div className="text-xs text-muted-foreground">{template.permission_keys.length} permissions across {grouped.length} modules</div>
            {grouped.map((g) => (
              <div key={g.module}>
                <div className="mb-1 text-xs font-semibold">{g.module}</div>
                <ul className="grid gap-1 sm:grid-cols-2">
                  {g.keys.map((k) => (
                    <li key={k} className="flex items-center gap-2 rounded-md border border-border/50 bg-background/40 px-2 py-1 font-mono text-xs">
                      {isPrivilegedPermission(k) && <ShieldAlert className="h-3 w-3 text-amber-300" />}{k}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function ApplyTemplateDialog({ template, onOpenChange, env, onDone }: {
  template: PermissionTemplate | null; onOpenChange: (v: boolean) => void;
  env: any; onDone: () => void;
}) {
  const [role, setRole] = useState<InternalRoleKey>("support_agent");
  const [diff, setDiff] = useState<ApplyTemplateDiff | null>(null);
  const [counts, setCounts] = useState<Map<string, number> | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!template) return;
    computeApplyTemplateDiff(template.id, role, env).then(setDiff).catch(() => setDiff(null));
    fetchRoleUserCounts().then(setCounts).catch(() => setCounts(null));
  }, [template, role, env]);

  const submit = async () => {
    if (!template) return;
    setBusy(true);
    try {
      await stageApplyTemplateToRole(template.id, role, env, reason || undefined);
      toast({ title: "Change staged", description: `Applying ${template.name} to ${ROLE_LABEL[role]} is pending review.` });
      onDone(); onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Could not stage", description: e?.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={!!template} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Apply "{template?.name}" to role</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <label className="block">
            <span className="mb-1 block text-xs uppercase text-muted-foreground">Target role</span>
            <select value={role} onChange={(e) => setRole(e.target.value as InternalRoleKey)} className="h-11 w-full rounded-md border border-border bg-background px-2">
              {INTERNAL_ROLES.map((r) => <option key={r.key} value={r.key}>{ROLE_LABEL[r.key]}</option>)}
            </select>
          </label>
          {diff && (
            <div className="space-y-2 rounded-md border border-border/60 bg-background/40 p-3 text-xs">
              <div className="flex items-center justify-between">
                <span>Permissions added</span><span className={`font-mono ${ADMIN_TONE.success.text}`}>+{diff.add.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Permissions removed</span><span className="font-mono text-rose-400">−{diff.remove.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Privileged introduced</span><span className="font-mono text-amber-300">{diff.privileged_added.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Dependencies pulled in</span><span className="font-mono">{diff.dependencies_added.length}</span>
              </div>
              {diff.dependencies_added.length > 0 && (
                <details className="rounded-md border border-border/40 bg-background/40 p-2">
                  <summary className="cursor-pointer text-xs uppercase text-muted-foreground min-h-11 inline-flex items-center">Show dependencies</summary>
                  <ul className="mt-1 space-y-1">
                    {diff.dependencies_added.slice(0, 10).map((d) => (
                      <li key={d.key} className="font-mono text-xs">
                        <span className={ADMIN_TONE.success.text}>+ {d.key}</span>
                        <span className="text-muted-foreground"> · required by {d.from.join(", ")}</span>
                      </li>
                    ))}
                    {diff.dependencies_added.length > 10 && <li className="text-xs text-muted-foreground">…{diff.dependencies_added.length - 10} more</li>}
                  </ul>
                </details>
              )}
              <div className="flex items-center justify-between">
                <span>Users affected</span><span className="font-mono">{counts?.get(role) ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Approval required</span>
                <span className={diff.approval_required ? "text-amber-300" : "text-muted-foreground"}>{diff.approval_required ? "Yes" : "No"}</span>
              </div>
            </div>
          )}
          <label className="block">
            <span className="mb-1 block text-xs uppercase text-muted-foreground">Reason</span>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="w-full rounded-md border border-border bg-background p-2 text-xs" placeholder="Why this change?" />
          </label>
          <p className="text-xs text-muted-foreground">
            This will stage a change set. Nothing is applied to {String(env)} until it is reviewed and approved.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !diff}>Stage change</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CloneTemplateDialog({ request, onOpenChange, onDone }: {
  request: PermissionTemplate | null; onOpenChange: (v: boolean) => void; onDone: () => void;
}) {
  const isNew = request?.id === "__new__";
  const [name, setName] = useState("");
  const [role, setRole] = useState<InternalRoleKey>("support_agent");
  const [busy, setBusy] = useState(false);

  useEffect(() => { setName(isNew ? "" : `${request?.name ?? ""} (copy)`); }, [request, isNew]);

  const submit = async () => {
    if (!request) return;
    setBusy(true);
    try {
      if (isNew) {
        await cloneRoleAsTemplate(role, name || `${ROLE_LABEL[role]} template`);
      } else {
        await permissionRepo.cloneTemplate(request.id, name || `${request.name} (copy)`);
      }
      toast({ title: "Template created" });
      onDone(); onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Could not clone", description: e?.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={!!request} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{isNew ? "New template from role" : `Clone "${request?.name}"`}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          {isNew && (
            <label className="block">
              <span className="mb-1 block text-xs uppercase text-muted-foreground">Source role</span>
              <select value={role} onChange={(e) => setRole(e.target.value as InternalRoleKey)} className="h-11 w-full rounded-md border border-border bg-background px-2">
                {INTERNAL_ROLES.map((r) => <option key={r.key} value={r.key}>{ROLE_LABEL[r.key]}</option>)}
              </select>
            </label>
          )}
          <label className="block">
            <span className="mb-1 block text-xs uppercase text-muted-foreground">Template name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className="h-11 w-full rounded-md border border-border bg-background px-2" placeholder="Template name" />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
