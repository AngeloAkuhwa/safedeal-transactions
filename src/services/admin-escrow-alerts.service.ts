import { supabase } from "@/integrations/supabase/client";
import type { EscrowAlertThresholds } from "./admin-escrow.service";

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const FN_URL = `https://${PROJECT_ID}.supabase.co/functions/v1/admin-escrow-alert-settings`;

export interface ThresholdResponse {
  thresholds: EscrowAlertThresholds;
  updated_at: string | null;
}

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");
  return {
    Authorization: `Bearer ${session.access_token}`,
    apikey: ANON_KEY,
    "Content-Type": "application/json",
  };
}

export async function getEscrowAlertThresholds(): Promise<ThresholdResponse> {
  const res = await fetch(FN_URL, { method: "GET", headers: await authHeaders() });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string })?.error ?? `HTTP ${res.status}`);
  return body as ThresholdResponse;
}

export async function updateEscrowAlertThresholds(
  thresholds: EscrowAlertThresholds,
): Promise<ThresholdResponse> {
  const res = await fetch(FN_URL, {
    method: "PUT",
    headers: await authHeaders(),
    body: JSON.stringify(thresholds),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string })?.error ?? `HTTP ${res.status}`);
  return body as ThresholdResponse;
}

/**
 * Permission gate. Today: any authenticated admin. Future: tighten to a
 * specific clearance (e.g. `finance_admin` role or `admin_permissions` row).
 * Centralized so only this function changes when the policy tightens.
 */
export async function canConfigureEscrowAlerts(): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data, error } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
  if (error) return false;
  return Boolean(data);
}