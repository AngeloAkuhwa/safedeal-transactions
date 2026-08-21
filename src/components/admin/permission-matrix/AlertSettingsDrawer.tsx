import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useCurrentUserId } from "@/hooks/useCurrentUserId";
import { useAdminPermissions } from "@/context/AdminPermissionsContext";
import { supabase } from "@/integrations/supabase/client";

const ALERT_KEYS = [
  { key: "critical_permission_changed", label: "Critical permission changes", desc: "Notify when Privileged / Critical permissions are granted, revoked, or applied." },
  { key: "change_set_rejected_or_failed", label: "Rejected or failed change-sets", desc: "Notify when an approver rejects a request, or when an apply fails." },
  { key: "temporary_access_expiring", label: "Temporary access expiring", desc: "Notify 72h before any temporary override you own or approved reaches its expiry." },
  { key: "protected_role_modified", label: "Protected role modifications", desc: "Notify on any change touching Super Admin, Senior Admin, or Auditor." },
] as const;

type AlertSettings = Record<string, boolean>;

const DEFAULTS = (): AlertSettings =>
  Object.fromEntries(ALERT_KEYS.map((a) => [a.key, true]));

async function loadSettings(uid: string): Promise<AlertSettings> {
  const { data, error } = await supabase
    .from("notification_preferences")
    .select("matrix_alerts")
    .eq("user_id", uid)
    .maybeSingle();
  if (error) return DEFAULTS();
  const stored = (data?.matrix_alerts ?? {}) as Record<string, unknown>;
  const out = DEFAULTS();
  for (const k of Object.keys(out)) {
    if (typeof stored[k] === "boolean") out[k] = stored[k] as boolean;
  }
  return out;
}

async function persistSettings(uid: string, s: AlertSettings) {
  // Upsert against the user's row: the auth trigger creates it on signup but
  // we defensively upsert so a missing row does not silently drop preferences.
  const { error } = await supabase
    .from("notification_preferences")
    .upsert({ user_id: uid, matrix_alerts: s as unknown as any }, { onConflict: "user_id" });
  if (error) throw error;
}

export function AlertSettingsDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const uid = useCurrentUserId();
  const perms = useAdminPermissions();
  const canReceiveCritical = perms.has("permissions.view");
  const [state, setState] = useState<AlertSettings>(DEFAULTS());
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!uid || !open) return;
    let cancelled = false;
    setLoading(true);
    loadSettings(uid)
      .then((s) => { if (!cancelled) setState(s); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [uid, open]);

  const save = async () => {
    if (!uid) return;
    setBusy(true);
    try {
      await persistSettings(uid, state);
      toast.success("Alert preferences saved");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save preferences");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[420px] sm:max-w-[420px]">
        <SheetHeader>
          <SheetTitle>Alert settings</SheetTitle>
          <SheetDescription className="text-xs">
            Choose which permission-matrix events raise notifications for you. Applies to in-app and email delivery.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {ALERT_KEYS.map((a) => {
            const disabled = a.key === "critical_permission_changed" && !canReceiveCritical;
            return (
              <div key={a.key} className="flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-card/50 p-3">
                <div className="flex-1">
                  <Label className="text-sm font-medium">{a.label}</Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">{a.desc}</p>
                  {disabled && (
                    <p className="mt-1 text-xs text-amber-400">You need permissions.view to receive this alert.</p>
                  )}
                </div>
                <Switch
                  checked={!!state[a.key]}
                  disabled={disabled}
                  onCheckedChange={(v) => setState((s) => ({ ...s, [a.key]: v }))}
                />
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={busy || loading}>
            {busy ? "Saving…" : loading ? "Loading…" : "Save preferences"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}