import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { INTERNAL_ROLES, ROLE_LABEL, isPrivilegedPermission, type InternalRoleKey } from "@/services/permission-catalog";
import {
  fetchRoleGrantMap, listTemplates,
  type PermissionTemplate,
} from "@/services/permission-workspace.service";
import { useCurrentEnvironment } from "./EnvironmentSwitcher";
import { ArrowLeftRight, ShieldAlert } from "lucide-react";

type PickTarget = { kind: "template"; id: string } | { kind: "role"; role: InternalRoleKey };

export function TemplateCompareDialog({
  template, open, onOpenChange,
}: { template: PermissionTemplate | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const env = useCurrentEnvironment();
  const [templates, setTemplates] = useState<PermissionTemplate[]>([]);
  const [target, setTarget] = useState<PickTarget>({ kind: "role", role: "support_agent" });
  const [otherKeys, setOtherKeys] = useState<Set<string>>(new Set());
  const [otherLabel, setOtherLabel] = useState("");

  useEffect(() => {
    if (!open) return;
    listTemplates().then(setTemplates).catch(() => setTemplates([]));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (target.kind === "template") {
      const t = templates.find((x) => x.id === target.id);
      setOtherKeys(new Set(t?.permission_keys ?? []));
      setOtherLabel(t ? `Template · ${t.name}` : "");
    } else {
      fetchRoleGrantMap(false, env).then((m) => {
        setOtherKeys(new Set(m.map.get(target.role) ?? []));
        setOtherLabel(`Role · ${ROLE_LABEL[target.role]}`);
      }).catch(() => setOtherKeys(new Set()));
    }
  }, [target, templates, open, env]);

  const diff = useMemo(() => {
    if (!template) return { onlyA: [], onlyB: [], shared: [] as string[] };
    const a = new Set(template.permission_keys);
    const onlyA: string[] = []; const onlyB: string[] = []; const shared: string[] = [];
    for (const k of a) (otherKeys.has(k) ? shared : onlyA).push(k);
    for (const k of otherKeys) if (!a.has(k)) onlyB.push(k);
    onlyA.sort(); onlyB.sort(); shared.sort();
    return { onlyA, onlyB, shared };
  }, [template, otherKeys]);

  const renderKey = (k: string) => (
    <li key={k} className="flex items-center gap-1.5 rounded border border-border/50 bg-background/50 px-2 py-1 font-mono text-xs">
      {isPrivilegedPermission(k) && <ShieldAlert className="h-3 w-3 text-amber-300" />}
      <span className="truncate">{k}</span>
    </li>
  );

  const others = templates.filter((t) => t.id !== template?.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4" /> Compare "{template?.name}"
          </DialogTitle>
        </DialogHeader>
        {template && (
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-background/40 p-2">
              <span className="text-xs uppercase text-muted-foreground">Compare against</span>
              <select
                className="h-11 rounded-md border border-border bg-background px-2 text-xs"
                value={target.kind === "role" ? `role:${target.role}` : `template:${target.id}`}
                onChange={(e) => {
                  const [kind, val] = e.target.value.split(":");
                  if (kind === "role") setTarget({ kind: "role", role: val as InternalRoleKey });
                  else setTarget({ kind: "template", id: val });
                }}
              >
                <optgroup label="Roles">
                  {INTERNAL_ROLES.map((r) => <option key={r.key} value={`role:${r.key}`}>{ROLE_LABEL[r.key]}</option>)}
                </optgroup>
                <optgroup label="Templates">
                  {others.map((t) => <option key={t.id} value={`template:${t.id}`}>{t.name}</option>)}
                </optgroup>
              </select>
              <span className="text-xs text-muted-foreground">A · Template · {template.name}</span>
              <span className="text-xs text-muted-foreground">B · {otherLabel}</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Column label="Only in A" tone="emerald" count={diff.onlyA.length}>{diff.onlyA.map(renderKey)}</Column>
              <Column label="Shared" tone="muted" count={diff.shared.length}>{diff.shared.map(renderKey)}</Column>
              <Column label="Only in B" tone="sky" count={diff.onlyB.length}>{diff.onlyB.map(renderKey)}</Column>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Column({ label, count, tone, children }: { label: string; count: number; tone: "emerald" | "muted" | "sky"; children: React.ReactNode }) {
  const toneCls = tone === "emerald" ? "border-emerald-500/30 bg-emerald-500/5" : tone === "sky" ? "border-sky-500/30 bg-sky-500/5" : "border-border/60 bg-background/30";
  return (
    <div className={`rounded-lg border ${toneCls} p-2`}>
      <div className="mb-2 flex items-center justify-between text-xs uppercase text-muted-foreground">
        <span>{label}</span><span className="font-mono">{count}</span>
      </div>
      <ul className="max-h-72 space-y-1 overflow-y-auto">{children}</ul>
    </div>
  );
}