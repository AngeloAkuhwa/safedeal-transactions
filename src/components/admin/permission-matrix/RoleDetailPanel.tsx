import { useMemo, useState } from "react";
import { INTERNAL_ROLES, PERMISSION_MODULES, ROLE_LABEL, isPrivilegedPermission, type InternalRoleKey } from "@/services/permission-catalog";
import type { RoleGrantMap } from "@/services/permission-workspace.service";
import { PermissionRiskBadge } from "./PermissionRiskBadge";
import { Check, Minus } from "lucide-react";

export function RoleDetailPanel({
  roleMap,
  role: roleProp,
  onRoleChange,
}: {
  roleMap: RoleGrantMap;
  role?: InternalRoleKey;
  onRoleChange?: (r: InternalRoleKey) => void;
}) {
  const [internal, setInternal] = useState<InternalRoleKey>(roleProp ?? "super_admin");
  const role = roleProp ?? internal;
  const bag = roleMap.map.get(role) ?? new Set<string>();

  const summary = useMemo(() => {
    let total = 0, granted = 0, privileged = 0;
    for (const m of PERMISSION_MODULES) {
      for (const p of m.permissions) {
        total++;
        if (bag.has(p.key)) {
          granted++;
          if (isPrivilegedPermission(p.key)) privileged++;
        }
      }
    }
    return { total, granted, privileged };
  }, [bag]);

  return (
    <div className="rounded-xl border border-border bg-card">
      <header className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Role</label>
          <select
            value={role}
            onChange={(e) => {
              const v = e.target.value as InternalRoleKey;
              setInternal(v);
              onRoleChange?.(v);
            }}
            className="mt-1 block h-9 min-w-[220px] rounded-md border border-border bg-background px-3 text-sm"
          >
            {INTERNAL_ROLES.map((r) => (
              <option key={r.key} value={r.key}>{ROLE_LABEL[r.key]}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            {INTERNAL_ROLES.find((r) => r.key === role)?.description}
          </p>
        </div>
        <div className="flex gap-4 text-sm">
          <div><div className="text-xs text-muted-foreground">Granted</div><div className="text-lg font-bold text-emerald-400">{summary.granted}<span className="text-sm text-muted-foreground">/{summary.total}</span></div></div>
          <div><div className="text-xs text-muted-foreground">Privileged</div><div className="text-lg font-bold text-amber-400">{summary.privileged}</div></div>
        </div>
      </header>
      <div className="divide-y divide-border">
        {PERMISSION_MODULES.map((m) => {
          const rowGranted = m.permissions.filter((p) => bag.has(p.key)).length;
          return (
            <section key={m.key} className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-foreground">{m.label}</h4>
                <span className="text-xs text-muted-foreground">{rowGranted}/{m.permissions.length}</span>
              </div>
              <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {m.permissions.map((p) => {
                  const has = bag.has(p.key);
                  return (
                    <li key={p.key} className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs ${has ? "border-emerald-500/30 bg-emerald-500/5" : "border-border bg-background/40"}`}>
                      {has ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Minus className="h-3.5 w-3.5 text-muted-foreground" />}
                      <span className={has ? "text-foreground" : "text-muted-foreground"}>{p.label.split("—")[1]?.trim() ?? p.label}</span>
                      {isPrivilegedPermission(p.key) && <PermissionRiskBadge privileged size="xs" />}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
