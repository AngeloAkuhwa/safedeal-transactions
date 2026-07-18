// Commerce gating: platform + vendor-scoped kill switch for checkout/cart,
// plus a vendor active/disabled/suspended flag stored on profiles.
//
// Consumed by every cart mutation, checkout entry point, and payment
// initiation edge function so we can flip commerce on/off from the admin
// settings page without redeploying.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export interface EffectiveCommerceConfig {
  checkout_enabled: boolean;
  add_to_cart_enabled: boolean;
  disabled_reason: string;
  scope: "platform" | "vendor";
}

export const DEFAULT_COMMERCE_CONFIG: EffectiveCommerceConfig = {
  checkout_enabled: false,
  add_to_cart_enabled: true,
  disabled_reason:
    "Checkout is not yet available. We're preparing the platform — you can browse and set up your account in the meantime.",
  scope: "platform",
};

function admin(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key);
}

const COMMERCE_KEYS = [
  "commerce.checkout_enabled",
  "commerce.add_to_cart_enabled",
  "commerce.disabled_reason",
];

/**
 * Resolve commerce config for a vendor via the standard settings resolver
 * (vendor override > platform default > hardcoded default).
 */
export async function loadCommerceConfig(
  vendorId: string | null | undefined,
): Promise<EffectiveCommerceConfig> {
  if ((Deno.env.get("SETTINGS_RESOLVER_ENABLED") ?? "true").toLowerCase() === "false") {
    return DEFAULT_COMMERCE_CONFIG;
  }
  try {
    const client = admin();
    let rows: any[] = [];
    if (vendorId) {
      const { data } = await client.rpc("get_effective_settings", {
        _vendor_id: vendorId,
        _keys: COMMERCE_KEYS,
      });
      rows = (data as any[]) ?? [];
    } else {
      const { data } = await client
        .from("system_settings")
        .select("setting_key, setting_value")
        .eq("scope", "platform")
        .in("setting_key", COMMERCE_KEYS);
      rows = data ?? [];
    }
    const map: Record<string, unknown> = {};
    rows.forEach((r) => { map[r.setting_key] = r.setting_value; });
    return {
      checkout_enabled: map["commerce.checkout_enabled"] != null
        ? Boolean(map["commerce.checkout_enabled"])
        : DEFAULT_COMMERCE_CONFIG.checkout_enabled,
      add_to_cart_enabled: map["commerce.add_to_cart_enabled"] != null
        ? Boolean(map["commerce.add_to_cart_enabled"])
        : DEFAULT_COMMERCE_CONFIG.add_to_cart_enabled,
      disabled_reason: typeof map["commerce.disabled_reason"] === "string"
        ? String(map["commerce.disabled_reason"])
        : DEFAULT_COMMERCE_CONFIG.disabled_reason,
      scope: vendorId ? "vendor" : "platform",
    };
  } catch (_e) {
    return DEFAULT_COMMERCE_CONFIG;
  }
}

export interface VendorStatusRow {
  status: "active" | "disabled" | "suspended";
  reason: string | null;
  changed_at: string | null;
}

export async function loadVendorStatus(vendorId: string): Promise<VendorStatusRow> {
  try {
    const { data } = await admin()
      .from("profiles")
      .select("vendor_status, vendor_status_reason, vendor_status_changed_at")
      .eq("id", vendorId)
      .maybeSingle();
    return {
      status: (data?.vendor_status as any) ?? "active",
      reason: data?.vendor_status_reason ?? null,
      changed_at: data?.vendor_status_changed_at ?? null,
    };
  } catch (_e) {
    return { status: "active", reason: null, changed_at: null };
  }
}

export type GateFailure = { status: number; body: Record<string, unknown> } | null;

export async function checkVendorActive(vendorId: string): Promise<GateFailure> {
  const s = await loadVendorStatus(vendorId);
  if (s.status === "active") return null;
  return {
    status: 403,
    body: {
      error: "vendor_disabled",
      vendor_status: s.status,
      reason: s.reason ?? "This vendor is currently unavailable.",
    },
  };
}

export async function checkAddToCartAllowed(vendorId: string | null): Promise<GateFailure> {
  const vendorCheck = vendorId ? await checkVendorActive(vendorId) : null;
  if (vendorCheck) return vendorCheck;
  const cfg = await loadCommerceConfig(vendorId ?? null);
  if (cfg.add_to_cart_enabled) return null;
  return {
    status: 403,
    body: { error: "add_to_cart_disabled", reason: cfg.disabled_reason },
  };
}

export async function checkCheckoutAllowed(vendorId: string | null): Promise<GateFailure> {
  const vendorCheck = vendorId ? await checkVendorActive(vendorId) : null;
  if (vendorCheck) return vendorCheck;
  const cfg = await loadCommerceConfig(vendorId ?? null);
  if (cfg.checkout_enabled) return null;
  return {
    status: 403,
    body: { error: "checkout_disabled", reason: cfg.disabled_reason },
  };
}