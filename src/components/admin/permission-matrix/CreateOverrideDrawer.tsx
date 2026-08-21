import { useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { permissionRepo, type PermissionEnvironment } from "@/services/permission-repository";
import {
  PERMISSION_MODULES, ROLE_LABEL, isPrivilegedPermission, type InternalRoleKey,
} from "@/services/permission-catalog";
import { checkOverrideAllowed } from "@/services/role-guardrails";
import { fetchRoleGrantMap } from "@/services/permission-workspace.service";
import { toast } from "@/hooks/use-toast";
import { ShieldAlert, Search, Clock } from "lucide-react";

type UserOption = { id: string; name: string; email: string; role: InternalRoleKey | null };

export function CreateOverrideDrawer({
  open, onOpenChange, environment, onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  environment: PermissionEnvironment;
  onCreated?: () => void;
}) {
  const [userQuery, setUserQuery] = useState("");
  const [users, setUsers] = useState<UserOption[]>([]);
  const [user, setUser] = useState<UserOption | null>(null);

  const [permQuery, setPermQuery] = useState("");
  const [permKey, setPermKey] = useState<string | null>(null);

  const [type, setType] = useState<"grant" | "deny" | "temporary">("grant");
  const [reason, setReason] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState(false);

  const [roleBag, setRoleBag] = useState<Set<string> | null>(null);
  const [nonAssignable, setNonAssignable] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setUserQuery(""); setUsers([]); setUser(null);
    setPermQuery(""); setPermKey(null);
    setType("grant"); setReason(""); setExpiresAt("");
    setRoleBag(null);
  }, [open]);

  // Load the set of permission keys that were suspended (assignable=false) so
  // they are filtered out of the picker. Existing overrides remain untouched
  // but new grants are blocked at the UI layer.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from("permissions")
        .select("key,assignable")
        .eq("assignable", false);
      if (cancelled) return;
      setNonAssignable(new Set((data ?? []).map((r: { key: string }) => r.key)));
    })();
    return () => { cancelled = true; };
  }, [open]);

  // Search internal_users
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      const q = userQuery.trim();
      const query = supabase.from("internal_users").select("id,full_name,email,status").order("full_name").limit(20);
      const res = q
        ? await query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
        : await query;
      if (res.error) return;
      const ids = (res.data ?? []).map((u: any) => u.id);
      const roles = ids.length
        ? await supabase.from("internal_user_roles").select("user_id,role_key,is_primary").in("user_id", ids)
        : { data: [] as any[], error: null };
      const roleByUser = new Map<string, InternalRoleKey>();
      for (const r of roles.data ?? []) {
        if (r.is_primary || !roleByUser.has(r.user_id)) roleByUser.set(r.user_id, r.role_key as InternalRoleKey);
      }
      setUsers((res.data ?? []).map((u: any) => ({
        id: u.id,
        name: u.full_name ?? "—",
        email: u.email ?? "",
        role: roleByUser.get(u.id) ?? null,
      })));
    }, 180);
    return () => clearTimeout(t);
  }, [userQuery, open]);

  // Load role bag when user selected
  useEffect(() => {
    if (!user?.role) { setRoleBag(null); return; }
    fetchRoleGrantMap(false, environment).then((rm) => {
      setRoleBag(new Set(rm.map.get(user.role as InternalRoleKey) ?? []));
    }).catch(() => setRoleBag(new Set()));
  }, [user, environment]);

  const permOptions = useMemo(() => {
    const q = permQuery.trim().toLowerCase();
    const all = PERMISSION_MODULES.flatMap((m) => m.permissions.map((p) => ({
      key: p.key, label: p.label, module: m.label,
    }))).filter((p) => !nonAssignable.has(p.key));
    return q ? all.filter((p) => p.key.toLowerCase().includes(q) || p.label.toLowerCase().includes(q)) : all.slice(0, 30);
  }, [permQuery, nonAssignable]);

  const privileged = permKey ? isPrivilegedPermission(permKey) : false;
  const isTemporary = type === "temporary" || (privileged && type === "grant");
  const mode: "grant" | "revoke" = type === "deny" ? "revoke" : "grant";

  const currentEffective = permKey && roleBag ? (roleBag.has(permKey) ? "granted" : "denied") : "—";
  const proposedEffective = type === "deny" ? "denied" : "granted";

  const guard = useMemo(() => {
    if (!permKey || !user) return { ok: true } as const;
    return checkOverrideAllowed(user.role, permKey, mode, { expiresAt: expiresAt || null, isPrivileged: privileged });
  }, [permKey, user, mode, expiresAt, privileged]);

  const canSubmit =
    !!user && !!permKey && reason.trim().length >= 20 &&
    (!isTemporary || !!expiresAt) &&
    (guard.ok || !("blocked" in guard) || !guard.blocked);

  const submit = async () => {
    if (!user || !permKey) return;
    setBusy(true);
    try {
      await permissionRepo.createOverride({
        user_id: user.id,
        permission_key: permKey,
        mode,
        reason: reason.trim(),
        expires_at: isTemporary && expiresAt ? new Date(expiresAt).toISOString() : null,
        environment,
      });
      toast({ title: "Override created", description: `${mode === "grant" ? "Granted" : "Denied"} ${permKey} for ${user.name}` });
      onCreated?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message ?? String(e), variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>New user override</SheetTitle>
          <p className="text-xs text-muted-foreground">Add a per-user grant or deny that overrides the role baseline in <span className="font-semibold">{environment}</span>.</p>
        </SheetHeader>

        <div className="mt-4 space-y-4 text-sm">
          {/* User picker */}
          <section className="space-y-2">
            <div className="text-xs uppercase text-muted-foreground">User</div>
            <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2">
              <Search className="h-3 w-3 text-muted-foreground" />
              <input value={userQuery} onChange={(e) => setUserQuery(e.target.value)} placeholder="Search internal users…"
                className="h-11 flex-1 bg-transparent text-sm outline-none" />
            </div>
            <div className="max-h-40 overflow-y-auto rounded-md border border-border/60">
              {users.map((u) => (
                <button type="button" key={u.id} onClick={() => setUser(u)}
                  className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-muted ${user?.id === u.id ? "bg-primary/5" : ""} min-h-11`}>
                  <div className="flex-1">
                    <div className="font-medium">{u.name}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </div>
                  <span className="rounded-full border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground">{u.role ? ROLE_LABEL[u.role] : "no role"}</span>
                </button>
              ))}
              {users.length === 0 && <div className="px-2 py-2 text-xs text-muted-foreground">No matches</div>}
            </div>
          </section>

          {/* Permission picker */}
          <section className="space-y-2">
            <div className="text-xs uppercase text-muted-foreground">Permission</div>
            <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2">
              <Search className="h-3 w-3 text-muted-foreground" />
              <input value={permQuery} onChange={(e) => setPermQuery(e.target.value)} placeholder="Search permissions…"
                className="h-11 flex-1 bg-transparent text-sm outline-none" />
            </div>
            <div className="max-h-40 overflow-y-auto rounded-md border border-border/60">
              {permOptions.map((p) => (
                <button type="button" key={p.key} onClick={() => setPermKey(p.key)}
                  className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-muted ${permKey === p.key ? "bg-primary/5" : ""} min-h-11`}>
                  <span className="font-mono text-xs text-muted-foreground">{p.key}</span>
                  <span className="ml-auto truncate text-muted-foreground">{p.module}</span>
                  {isPrivilegedPermission(p.key) && <ShieldAlert className="h-3 w-3 text-amber-300" />}
                </button>
              ))}
            </div>
          </section>

          {/* Type */}
          <section className="space-y-2">
            <div className="text-xs uppercase text-muted-foreground">Override type</div>
            <div className="flex flex-wrap gap-2">
              {(["grant","deny","temporary"] as const).map((t) => (
                <button key={t} type="button" onClick={() => setType(t)}
                  className={`rounded-md border px-2 py-1 text-xs ${type === t ? "border-primary/50 bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground"} min-h-11 min-w-11 justify-center`}>
                  {t === "grant" ? "Grant" : t === "deny" ? "Deny" : "Temporary"}
                </button>
              ))}
            </div>
          </section>

          {/* Reason + expiry */}
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs uppercase text-muted-foreground">Reason (min 20 chars)</span>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
                className="w-full rounded-md border border-border bg-background p-2 text-xs" placeholder="Why does this user need this override?" />
              <div className="mt-1 text-xs text-muted-foreground">{reason.trim().length}/20</div>
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 flex items-center gap-1 text-xs uppercase text-muted-foreground">
                Expiry {isTemporary && <span className="text-rose-400">*</span>}
              </span>
              <input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)}
                className="h-11 w-full rounded-md border border-border bg-background px-2 text-xs" />
              {privileged && type === "grant" && (
                <div className="mt-1 flex items-center gap-1 text-xs text-amber-300">
                  <Clock className="h-3 w-3" /> Privileged grants require an expiry (temporary privileged access).
                </div>
              )}
            </label>
          </section>

          {/* Impact preview */}
          <section className="space-y-2 rounded-md border border-border/60 bg-background/40 p-3">
            <div className="text-xs uppercase text-muted-foreground">Impact preview</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <Row label="Role baseline" value={currentEffective} />
              <Row label="After override" value={proposedEffective} />
              <Row label="Privileged" value={privileged ? "Yes" : "No"} tone={privileged ? "amber" : undefined} />
              <Row label="Approval required" value={privileged ? "Yes" : "No"} tone={privileged ? "amber" : undefined} />
            </div>
            {!guard.ok && (guard as any).message && (
              <div className={`flex items-start gap-2 rounded-md border p-2 text-xs ${(guard as any).blocked ? "border-rose-500/40 bg-rose-500/10 text-rose-200" : "border-amber-500/30 bg-amber-500/10 text-amber-200"}`}>
                <ShieldAlert className="mt-0.5 h-3 w-3" />
                <span>{(guard as any).message}</span>
              </div>
            )}
          </section>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={submit} disabled={!canSubmit || busy}>
              Create override
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "amber" }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border/40 bg-background/60 px-2 py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className={tone === "amber" ? "text-amber-300" : "text-foreground"}>{value}</span>
    </div>
  );
}
