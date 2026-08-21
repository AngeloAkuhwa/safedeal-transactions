// Security & risk settings resolver. Pulls effective values from
// system_settings for a given vendor scope, and provides helpers that
// runtime consumers (checkout, webhooks) use to enforce those values.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export interface EffectiveSecurityConfig {
  require_id_verification: boolean;
  id_verification_threshold_ngn: number;
  high_value_alert_ngn: number;
  session_timeout_minutes: number;
  two_factor_admin: boolean;
}

export const DEFAULT_SECURITY_CONFIG: EffectiveSecurityConfig = {
  require_id_verification: true,
  id_verification_threshold_ngn: 100_000,
  high_value_alert_ngn: 500_000,
  session_timeout_minutes: 30,
  two_factor_admin: true,
};

function admin(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key);
}

function num(v: unknown, fallback: number): number {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Load platform + vendor security config, vendor rows win.
 * Feature-flag aware via SETTINGS_RESOLVER_ENABLED env var.
 */
export async function loadSecurityConfig(
  vendorId: string | null | undefined,
): Promise<EffectiveSecurityConfig> {
  if ((Deno.env.get("SETTINGS_RESOLVER_ENABLED") ?? "true").toLowerCase() === "false") {
    return DEFAULT_SECURITY_CONFIG;
  }
  try {
    const client = admin();
    const keys = [
      "security.require_id_verification",
      "security.id_verification_threshold",
      "risk.high_value_alert_ngn",
      "security.session_timeout_minutes",
      "security.two_factor_admin",
    ];
    let rows: any[] = [];
    if (vendorId) {
      const { data } = await client.rpc("get_effective_settings", {
        _vendor_id: vendorId,
        _keys: keys,
      });
      rows = (data as any[]) ?? [];
    } else {
      const { data } = await client
        .from("system_settings")
        .select("setting_key, setting_value")
        .eq("scope", "platform")
        .in("setting_key", keys);
      rows = data ?? [];
    }
    const map: Record<string, unknown> = {};
    rows.forEach((r) => { map[r.setting_key] = r.setting_value; });
    return {
      require_id_verification: map["security.require_id_verification"] != null
        ? Boolean(map["security.require_id_verification"])
        : DEFAULT_SECURITY_CONFIG.require_id_verification,
      id_verification_threshold_ngn: num(map["security.id_verification_threshold"], DEFAULT_SECURITY_CONFIG.id_verification_threshold_ngn),
      high_value_alert_ngn: num(map["risk.high_value_alert_ngn"], DEFAULT_SECURITY_CONFIG.high_value_alert_ngn),
      session_timeout_minutes: num(map["security.session_timeout_minutes"], DEFAULT_SECURITY_CONFIG.session_timeout_minutes),
      two_factor_admin: map["security.two_factor_admin"] != null
        ? Boolean(map["security.two_factor_admin"])
        : DEFAULT_SECURITY_CONFIG.two_factor_admin,
    };
  } catch (_e) {
    return DEFAULT_SECURITY_CONFIG;
  }
}

/**
 * Return true if buyer has an approved identity_submissions row.
 */
export async function isBuyerIdentityVerified(buyerId: string): Promise<boolean> {
  try {
    const { data } = await admin()
      .from("identity_submissions")
      .select("id")
      .eq("user_id", buyerId)
      .eq("status", "approved")
      .limit(1)
      .maybeSingle();
    return !!data;
  } catch (_e) {
    return false;
  }
}

/**
 * Guard: throw an object suitable for a 403 JSON response when the buyer
 * hasn't completed identity verification and the order amount crosses the
 * effective threshold (vendor override > platform default).
 *
 * Returns null when the check passes; returns a `{ status, body }` shape
 * caller should serialize when it fails.
 */
export async function checkIdVerificationRequirement(
  buyerId: string,
  vendorId: string | null,
  currencyCode: string,
  amount: number,
): Promise<{ status: number; body: Record<string, unknown> } | null> {
  // Only NGN is thresholded today: quietly bypass for other currencies.
  if ((currencyCode || "NGN").toUpperCase() !== "NGN") return null;
  const cfg = await loadSecurityConfig(vendorId);
  if (!cfg.require_id_verification) return null;
  if (amount < cfg.id_verification_threshold_ngn) return null;
  const verified = await isBuyerIdentityVerified(buyerId);
  if (verified) return null;
  return {
    status: 403,
    body: {
      error: "identity_verification_required",
      threshold_ngn: cfg.id_verification_threshold_ngn,
      amount,
      message: `Identity verification is required for orders of ₦${cfg.id_verification_threshold_ngn.toLocaleString()} or more. Please complete verification to continue.`,
    },
  };
}

/**
 * Emit a high-value transaction flag + admin notifications when the
 * settled amount crosses the effective high-value threshold. Idempotent
 * per (transaction_id): subsequent calls short-circuit if an existing
 * high_value_flag admin_action row is already present.
 */
export async function emitHighValueFlagIfNeeded(params: {
  transactionId: string;
  buyerId: string | null;
  sellerId: string | null;
  vendorId: string | null;
  amount: number;
  currencyCode: string;
}): Promise<void> {
  try {
    const cfg = await loadSecurityConfig(params.vendorId);
    if ((params.currencyCode || "NGN").toUpperCase() !== "NGN") return;
    if (params.amount < cfg.high_value_alert_ngn) return;

    const client = admin();
    // Idempotent guard: one flag per transaction.
    const { data: existing } = await client
      .from("admin_actions")
      .select("id")
      .eq("action_type", "high_value_flag")
      .eq("transaction_id", params.transactionId)
      .limit(1)
      .maybeSingle();
    if (existing) return;

    await client.from("admin_actions").insert({
      admin_user_id: params.buyerId ?? params.sellerId ?? "00000000-0000-0000-0000-000000000000",
      target_user_id: params.sellerId,
      transaction_id: params.transactionId,
      action_type: "high_value_flag",
      action_notes: JSON.stringify({
        automated: true,
        threshold_ngn: cfg.high_value_alert_ngn,
        amount: params.amount,
        currency: params.currencyCode,
        source: "paystack_verified",
      }),
    });

    // Notify all admins via in-app notifications.
    const { data: admins } = await client
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    const rows = (admins ?? []).map((a: any) => ({
      user_id: a.user_id,
      type: "risk_alert",
      channel: "in_app",
      title: "High-value transaction paid",
      message: `A transaction of ₦${params.amount.toLocaleString()} just settled. Above the ₦${cfg.high_value_alert_ngn.toLocaleString()} alert threshold. Review before release.`,
      related_transaction_id: params.transactionId,
      status: "pending",
    }));
    if (rows.length) await client.from("notifications").insert(rows);
  } catch (e) {
    console.error("[security-resolver] emitHighValueFlagIfNeeded failed:", e);
  }
}