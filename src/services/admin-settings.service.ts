import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export interface AdminSettingRow {
  setting_key: string;
  setting_value: unknown;
  scope: "platform" | "vendor";
  vendor_id: string | null;
  is_overridable: boolean;
  updated_at: string | null;
  updated_by: string | null;
  /** Populated by DB trigger only for `escrow.auto_release_enabled` rows. */
  auto_release_enabled_by?: string | null;
  auto_release_enabled_at?: string | null;
  auto_release_previous_value?: string | null;
}

export interface AdminTimeoutRow {
  rule_type: string;
  hours_until_trigger: number;
  is_active: boolean;
  scope: "platform" | "vendor";
  vendor_id: string | null;
  updated_at: string | null;
}

export interface AdminSettingsPayload {
  settings: AdminSettingRow[];
  timeouts: AdminTimeoutRow[];
  override_counts: Record<string, number>;
  vendor_overrides: Array<{
    setting_key: string;
    vendor_id: string;
    setting_value: unknown;
    updated_at: string | null;
    updated_by: string | null;
  }>;
  vendor_id: string | null;
}

async function authHeader(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error("not_authenticated");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

export async function fetchAdminSettings(vendorId?: string | null): Promise<AdminSettingsPayload> {
  const qs = vendorId ? `?vendor_id=${encodeURIComponent(vendorId)}` : "";
  const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-system-settings${qs}`, {
    method: "GET",
    headers: await authHeader(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "failed_to_load_settings");
  return json;
}

export interface SaveSettingsInput {
  scope: "platform" | "vendor";
  vendor_id?: string | null;
  updates: Record<string, unknown>;
  timeouts?: Array<{ rule_type: string; hours: number; is_active?: boolean }>;
  reason: string;
  apply_to_all_vendors?: boolean;
}

export async function saveAdminSettings(input: SaveSettingsInput): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-system-settings`, {
    method: "PUT",
    headers: await authHeader(),
    body: JSON.stringify(input),
  });
  const json = await res.json();
  if (!res.ok) {
    // Prefer the server's human-readable message (e.g. the economic
    // invariant explains which amount range breaks) over the error code.
    throw new Error(json.message || json.error || "save_failed");
  }
}

export interface VendorLite { id: string; full_name: string | null; email: string | null }

export async function searchVendors(query: string): Promise<VendorLite[]> {
  const q = query.trim();
  const like = `%${q}%`;
  let builder = supabase
    .from("profiles")
    .select("id, full_name, email")
    .limit(20);
  if (q) builder = builder.or(`full_name.ilike.${like},email.ilike.${like}`);
  const { data, error } = await builder;
  if (error) throw error;
  return (data ?? []) as VendorLite[];
}

export interface SettingsAuditRow {
  id: string;
  admin_user_id: string;
  target_user_id: string | null;
  action_type: string;
  action_notes: string | null;
  created_at: string;
  admin_name?: string | null;
  target_name?: string | null;
  // Parsed once in the service so the UI doesn't repeat JSON parsing per row.
  reason: string | null;
  changed_keys: string[];
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  metadata: Record<string, unknown> | null;
  ip: string | null;
}

// Flatten one nesting level so entries like { settings: {...}, timeouts: {...} }
// surface each real key on its own row.
function flattenOneLevel(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj ?? {})) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      for (const [kk, vv] of Object.entries(v as Record<string, unknown>)) {
        out[`${k}.${kk}`] = vv;
      }
    } else {
      out[k] = v;
    }
  }
  return out;
}

function parseAuditNotes(notes: string | null): {
  reason: string | null;
  changed_keys: string[];
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  metadata: Record<string, unknown> | null;
  ip: string | null;
} {
  const empty = { reason: null, changed_keys: [], before: {}, after: {}, metadata: null, ip: null };
  if (!notes) return empty;
  let parsed: any;
  try { parsed = JSON.parse(notes); } catch { return { ...empty, reason: notes }; }
  if (!parsed || typeof parsed !== "object") return empty;

  // Unified payload (logAdminAction)
  if ("before" in parsed || "after" in parsed || "changed_keys" in parsed) {
    const before = flattenOneLevel((parsed.before ?? {}) as Record<string, unknown>);
    const after = flattenOneLevel((parsed.after ?? {}) as Record<string, unknown>);
    const keys = Array.isArray(parsed.changed_keys) && parsed.changed_keys.length
      ? // Re-derive after flattening so nested key names align with before/after.
        Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).filter(
          (k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]),
        )
      : Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
    return {
      reason: parsed.reason ?? null,
      changed_keys: keys,
      before,
      after,
      metadata: (parsed.metadata as Record<string, unknown>) ?? null,
      ip: parsed.ip ?? null,
    };
  }

  // Legacy payload: { scope, updates, timeouts, reason, ...}
  const updates = (parsed.updates && typeof parsed.updates === "object") ? parsed.updates as Record<string, unknown> : {};
  const timeouts = Array.isArray(parsed.timeouts) ? parsed.timeouts : [];
  const after: Record<string, unknown> = { ...updates };
  for (const t of timeouts) {
    if (t && typeof t === "object" && "rule_type" in t) {
      after[`timeout.${(t as any).rule_type}`] = { hours: (t as any).hours, is_active: (t as any).is_active ?? true };
    }
  }
  return {
    reason: parsed.reason ?? null,
    changed_keys: Object.keys(after),
    before: {},
    after,
    metadata: {
      scope: parsed.scope ?? null,
      vendor_id: parsed.vendor_id ?? null,
      apply_to_all_vendors: parsed.apply_to_all_vendors ?? false,
    },
    ip: null,
  };
}

/**
 * Fetch recent admin actions that touch settings. Joins in display names for
 * the acting admin and target vendor (if any) via two lightweight profile
 * lookups after the admin_actions read.
 */
export async function fetchSettingsAudit(limit = 20): Promise<SettingsAuditRow[]> {
  // action_type is an enum in the DB; escrow-alert variants are recorded via
  // action_notes on generic `update_setting` rows when the enum lacks them.
  const { data, error } = await supabase
    .from("admin_actions")
    .select("id, admin_user_id, target_user_id, action_type, action_notes, created_at")
    .in("action_type", ["update_setting", "toggle_auto_release"])
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rawRows = (data ?? []) as Array<Omit<SettingsAuditRow,
    "reason" | "changed_keys" | "before" | "after" | "metadata" | "ip" | "admin_name" | "target_name">>;
  const rows: SettingsAuditRow[] = rawRows.map((r) => ({
    ...r,
    admin_name: null,
    target_name: null,
    ...parseAuditNotes(r.action_notes),
  }));
  const ids = Array.from(new Set(rows.flatMap((r) => [r.admin_user_id, r.target_user_id].filter(Boolean) as string[])));
  if (ids.length === 0) return rows;
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", ids);
  const nameById = new Map<string, string>((profiles ?? []).map((p: any) => [p.id, p.full_name || p.email || p.id.slice(0, 8)]));
  return rows.map((r) => ({
    ...r,
    admin_name: nameById.get(r.admin_user_id) ?? "Admin",
    target_name: r.target_user_id ? nameById.get(r.target_user_id) ?? null : null,
  }));
}

/**
 * Update a vendor's active/disabled/suspended status. Recorded to
 * admin_actions with a `set_vendor_status` audit row.
 */
export async function setVendorStatus(input: {
  vendor_id: string;
  status: "active" | "disabled" | "suspended";
  reason: string;
}): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-vendor-status`, {
    method: "POST",
    headers: await authHeader(),
    body: JSON.stringify(input),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "vendor_status_update_failed");
}