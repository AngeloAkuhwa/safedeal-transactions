// Deno mirror of `src/lib/settings-catalog.ts`. Keep in lock-step.
// Used by admin-system-settings to clamp writes.

export type SettingScope = "platform" | "vendor";

export interface CatalogEntry {
  key: string;
  writable: SettingScope[];
  spec:
    | { type: "number"; min?: number; max?: number }
    | { type: "boolean" }
    | { type: "enum"; options: string[] }
    | { type: "tiers" };
}

export const SETTINGS_CATALOG: CatalogEntry[] = [
  { key: "pricing.min_platform_fee_ngn", writable: ["platform"], spec: { type: "number", min: 0, max: 10_000 } },
  { key: "pricing.max_total_service_fee_ngn", writable: ["platform", "vendor"], spec: { type: "number", min: 500, max: 25_000 } },
  { key: "pricing.tier_rates", writable: ["platform"], spec: { type: "tiers" } },
  { key: "fees.refund_policy", writable: ["platform"], spec: { type: "enum", options: ["Non-refundable", "Refundable on cancellation", "Refundable within 24h"] } },
  { key: "security.require_id_verification", writable: ["platform", "vendor"], spec: { type: "boolean" } },
  { key: "security.id_verification_threshold", writable: ["platform", "vendor"], spec: { type: "number", min: 1000, max: 50_000_000 } },
  { key: "security.session_timeout_minutes", writable: ["platform"], spec: { type: "number", min: 5, max: 240 } },
  { key: "security.two_factor_admin", writable: ["platform"], spec: { type: "boolean" } },
  { key: "notifications.email_enabled", writable: ["platform", "vendor"], spec: { type: "boolean" } },
  { key: "notifications.sms_enabled", writable: ["platform", "vendor"], spec: { type: "boolean" } },
  { key: "escrow.auto_release_enabled", writable: ["platform", "vendor"], spec: { type: "boolean" } },
  { key: "risk.high_value_alert_ngn", writable: ["platform", "vendor"], spec: { type: "number", min: 1000, max: 50_000_000 } },
  { key: "commerce.checkout_enabled", writable: ["platform", "vendor"], spec: { type: "boolean" } },
  { key: "commerce.add_to_cart_enabled", writable: ["platform", "vendor"], spec: { type: "boolean" } },
  // commerce.disabled_reason is a free-text string; it intentionally has no
  // catalog entry so writes at any scope pass through unclamped.
];

const BY_KEY = new Map(SETTINGS_CATALOG.map((e) => [e.key, e]));

export function clampSetting(
  key: string,
  value: unknown,
  scope: SettingScope,
): { ok: true; value: unknown } | { ok: false; error: string } {
  const entry = BY_KEY.get(key);
  if (!entry) return { ok: true, value };
  if (!entry.writable.includes(scope)) return { ok: false, error: `not_writable_at_${scope}` };
  const spec = entry.spec;
  if (spec.type === "number") {
    const n = typeof value === "string" ? Number(value) : (value as number);
    if (!Number.isFinite(n)) return { ok: false, error: "not_a_number" };
    let c = n;
    if (spec.min != null) c = Math.max(spec.min, c);
    if (spec.max != null) c = Math.min(spec.max, c);
    return { ok: true, value: c };
  }
  if (spec.type === "boolean") return { ok: true, value: Boolean(value) };
  if (spec.type === "enum") {
    const s = String(value);
    if (!spec.options.includes(s)) return { ok: false, error: "not_in_enum" };
    return { ok: true, value: s };
  }
  if (spec.type === "tiers") {
    if (!Array.isArray(value)) return { ok: false, error: "tiers_must_be_array" };
    for (const t of value as Array<{ rate: number }>) {
      if (typeof t?.rate !== "number" || t.rate < 0 || t.rate > 1) return { ok: false, error: "invalid_tier_rate" };
    }
    return { ok: true, value };
  }
  return { ok: true, value };
}