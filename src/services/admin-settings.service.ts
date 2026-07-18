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
  if (!res.ok) throw new Error(json.error || "save_failed");
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