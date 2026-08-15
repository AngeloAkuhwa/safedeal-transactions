import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import {
  INTERNAL_ROLES, PERMISSION_MODULES, ROLE_LABEL,
  findPermissionEntry,
  type PermissionAction, type PermissionRiskLevel,
} from "@/services/permission-catalog";
import { permissionRepo, type PermissionEnvironment } from "@/services/permission-repository";
import { Lock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

const ENVS: PermissionEnvironment[] = ["production", "staging", "development"];
const RISKS: PermissionRiskLevel[] = ["low", "medium", "high", "critical"];
const ACTIONS: PermissionAction[] = [
  "view","view_assigned","create","update","approve","reject","escalate","resolve",
  "assign","reassign","export","configure","manage_permissions","suspend","reactivate","remove_flag",
] as PermissionAction[];

export function RegisterPermissionDialog({
  open,
  onOpenChange,
  editingKey,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editingKey?: string | null;
  onSaved?: () => void;
}) {
  const qc = useQueryClient();
  const editing = editingKey ? findPermissionEntry(editingKey) : null;

  const [moduleKey, setModuleKey] = useState(editing?.module ?? PERMISSION_MODULES[0]?.key ?? "");
  const [action, setAction] = useState<PermissionAction>((editing?.action ?? "view") as PermissionAction);
  const [label, setLabel] = useState(editing?.label ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [risk, setRisk] = useState<PermissionRiskLevel>(editing?.risk ?? "low");
  const [approvalRequired, setApprovalRequired] = useState<boolean>(!!editing?.approval_required);
  const [ownerRole, setOwnerRole] = useState<string>(editing?.owner_role ?? "");
  const [status, setStatus] = useState<"active"|"suspended"|"deprecated">((editing?.status ?? "active") as any);
  const [envs, setEnvs] = useState<PermissionEnvironment[]>(["production","staging","development"]);
  const [deps, setDeps] = useState<string[]>([]);
  const [conflicts, setConflicts] = useState<string[]>([]);

  const depsQuery = useQuery({
    queryKey: ["register-perm", "deps", editingKey],
    queryFn: async () => editingKey ? (await permissionRepo.listPermissionDependencies()).filter((d) => d.permission_key === editingKey).map((d) => d.requires_key) : [],
    enabled: open && !!editingKey,
  });
  const conflictsQuery = useQuery({
    queryKey: ["register-perm", "conflicts", editingKey],
    queryFn: async () => editingKey ? (await permissionRepo.listPermissionConflicts()).filter((c) => c.a_key === editingKey).map((c) => c.b_key) : [],
    enabled: open && !!editingKey,
  });

  useEffect(() => {
    if (depsQuery.data) setDeps(depsQuery.data);
  }, [depsQuery.data]);
  useEffect(() => {
    if (conflictsQuery.data) setConflicts(conflictsQuery.data);
  }, [conflictsQuery.data]);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setModuleKey(editing.module);
      setAction(editing.action);
      setLabel(editing.label);
      setDescription(editing.description ?? "");
      setRisk((editing.risk ?? "low") as PermissionRiskLevel);
      setApprovalRequired(!!editing.approval_required);
      setOwnerRole(editing.owner_role ?? "");
      setStatus((editing.status ?? "active") as any);
    }
  }, [open, editingKey]);

  const key = useMemo(() => `${moduleKey}.${action}`, [moduleKey, action]);

  const create = useMutation({
    mutationFn: async () => {
      await permissionRepo.createPermission({
        key, module: moduleKey, action, label, description,
        risk_level: risk, approval_required: approvalRequired,
        owner_role: ownerRole || null,
        environments: envs,
        dependencies: deps,
        conflicts: conflicts.map((b) => ({ b_key: b, severity: "medium" as const, rationale: null })),
      });
    },
    onSuccess: () => {
      toast({ title: "Permission registered", description: key });
      qc.invalidateQueries({ queryKey: ["perm-workspace"] });
      onSaved?.();
      onOpenChange(false);
    },
    onError: (e: any) => toast({ title: "Could not register", description: e?.message ?? String(e), variant: "destructive" }),
  });

  const update = useMutation({
    mutationFn: async () => {
      await permissionRepo.updatePermission(key, {
        label, description, risk_level: risk,
        approval_required: approvalRequired,
        owner_role: ownerRole || null,
        status,
      });
      if (envs.length) await permissionRepo.setPermissionEnvironments(key, envs);
      await permissionRepo.setPermissionDependencies(key, deps);
      await permissionRepo.setPermissionConflicts(key, conflicts.map((b) => ({ b_key: b, severity: "medium", rationale: null })));
    },
    onSuccess: () => {
      toast({ title: "Permission updated", description: key });
      qc.invalidateQueries({ queryKey: ["perm-workspace"] });
      onSaved?.();
      onOpenChange(false);
    },
    onError: (e: any) => toast({ title: "Could not update", description: e?.message ?? String(e), variant: "destructive" }),
  });

  const canSubmit = moduleKey && action && label.trim().length > 2;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit permission" : "Register new permission"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-[11px] uppercase text-muted-foreground">Module</span>
              <select disabled={!!editing} value={moduleKey} onChange={(e) => setModuleKey(e.target.value)} className="h-11 w-full rounded-md border border-border bg-background px-2">
                {PERMISSION_MODULES.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] uppercase text-muted-foreground">Action</span>
              <select disabled={!!editing} value={action} onChange={(e) => setAction(e.target.value as PermissionAction)} className="h-11 w-full rounded-md border border-border bg-background px-2">
                {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-2 py-1 font-mono text-xs text-muted-foreground">
            {!!editing && <Lock className="h-3 w-3" />}<span>{key}</span>
            {!!editing && <span className="ml-auto text-[10px] italic">Key is immutable after creation</span>}
          </div>
          <label className="block">
            <span className="mb-1 block text-[11px] uppercase text-muted-foreground">Label</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)} className="h-11 w-full rounded-md border border-border bg-background px-2" placeholder="Human-readable name" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] uppercase text-muted-foreground">Description</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="w-full rounded-md border border-border bg-background p-2 text-sm" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-[11px] uppercase text-muted-foreground">Risk</span>
              <select value={risk} onChange={(e) => setRisk(e.target.value as PermissionRiskLevel)} className="h-11 w-full rounded-md border border-border bg-background px-2">
                {RISKS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] uppercase text-muted-foreground">Owner role</span>
              <select value={ownerRole} onChange={(e) => setOwnerRole(e.target.value)} className="h-11 w-full rounded-md border border-border bg-background px-2">
                <option value="">— None —</option>
                {INTERNAL_ROLES.map((r) => <option key={r.key} value={r.key}>{ROLE_LABEL[r.key]}</option>)}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={approvalRequired} onChange={(e) => setApprovalRequired(e.target.checked)} />
              Approval required
            </label>
            {editing && (
              <label className="block">
                <span className="mb-1 block text-[11px] uppercase text-muted-foreground">Status</span>
                <select value={status} onChange={(e) => setStatus(e.target.value as any)} className="h-11 w-full rounded-md border border-border bg-background px-2">
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="deprecated">Deprecated</option>
                </select>
              </label>
            )}
          </div>
          <div>
            <div className="mb-1 text-[11px] uppercase text-muted-foreground">Environments</div>
            <div className="flex gap-2">
              {ENVS.map((e) => {
                const active = envs.includes(e);
                return (
                  <button
                    type="button"
                    key={e}
                    onClick={() => setEnvs((prev) => active ? prev.filter((x) => x !== e) : [...prev, e])}
                    className={`rounded-md border px-2 py-1 text-xs ${active ? "border-primary/50 bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground"} min-h-11 min-w-11 justify-center`}
                  >{e}</button>
                );
              })}
            </div>
          </div>
          <MultiPermSelect label="Dependencies (this permission requires)" excludeKey={key} value={deps} onChange={setDeps} />
          <MultiPermSelect label="Conflicting permissions" excludeKey={key} value={conflicts} onChange={setConflicts} />
          <p className="text-[11px] text-muted-foreground">
            Permissions are never permanently deleted. Use <span className="font-semibold">Deprecated</span> to retire.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!canSubmit || create.isPending || update.isPending}
            onClick={() => (editing ? update.mutate() : create.mutate())}
          >
            {editing ? "Save changes" : "Register permission"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MultiPermSelect({ label, value, onChange, excludeKey }: {
  label: string; value: string[]; onChange: (v: string[]) => void; excludeKey?: string;
}) {
  const all = PERMISSION_MODULES.flatMap((m) => m.permissions.map((p) => ({ key: p.key, label: `${m.label} · ${p.label.split("—")[1]?.trim() ?? p.label}` })))
    .filter((p) => p.key !== excludeKey);
  const [q, setQ] = useState("");
  const filtered = q ? all.filter((p) => p.key.toLowerCase().includes(q.toLowerCase()) || p.label.toLowerCase().includes(q.toLowerCase())) : all.slice(0, 30);
  const toggle = (k: string) => onChange(value.includes(k) ? value.filter((x) => x !== k) : [...value, k]);
  return (
    <div>
      <div className="mb-1 text-[11px] uppercase text-muted-foreground">{label}</div>
      {value.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {value.map((k) => (
            <span key={k} className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2 py-0.5 font-mono text-[10px] text-primary">
              {k}
              <button type="button" onClick={() => toggle(k)} className="text-primary hover:text-destructive">×</button>
            </span>
          ))}
        </div>
      )}
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search permission…" className="h-11 w-full rounded-md border border-border bg-background px-2 text-xs" />
      <div className="mt-1 max-h-32 overflow-y-auto rounded-md border border-border/60 bg-background/50">
        {filtered.map((p) => (
          <button
            key={p.key} type="button" onClick={() => toggle(p.key)}
            className={`flex w-full items-center gap-2 px-2 py-1 text-left text-[11px] hover:bg-muted ${value.includes(p.key) ? "bg-primary/5" : ""} min-h-11`}
          >
            <input type="checkbox" readOnly checked={value.includes(p.key)} className="pointer-events-none" />
            <span className="font-mono text-muted-foreground">{p.key}</span>
            <span className="ml-auto truncate text-muted-foreground">{p.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}