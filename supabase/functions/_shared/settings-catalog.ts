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
    | { type: "tiers" }
    | { type: "string_list"; options: string[]; minItems?: number }
    | { type: "text"; maxLength?: number };
}

export const SETTINGS_CATALOG: CatalogEntry[] = [
  { key: "pricing.min_platform_fee_ngn", writable: ["platform"], spec: { type: "number", min: 0, max: 10_000 } },
  { key: "pricing.max_total_service_fee_ngn", writable: ["platform", "vendor"], spec: { type: "number", min: 500, max: 25_000 } },
  { key: "pricing.tier_rates", writable: ["platform"], spec: { type: "tiers" } },
  { key: "pricing.platform_fee_rate", writable: ["platform", "vendor"], spec: { type: "number", min: 0, max: 0.2 } },
  { key: "pricing.platform_fee_flat_ngn", writable: ["platform"], spec: { type: "number", min: 0, max: 5_000 } },
  { key: "pricing.max_platform_fee_ngn", writable: ["platform"], spec: { type: "number", min: 100, max: 50_000 } },
  { key: "fees.refund_policy", writable: ["platform"], spec: { type: "enum", options: ["Non-refundable", "Refundable on cancellation", "Refundable within 24h"] } },
  { key: "security.require_id_verification", writable: ["platform", "vendor"], spec: { type: "boolean" } },
  { key: "security.id_verification_threshold", writable: ["platform", "vendor"], spec: { type: "number", min: 1000, max: 50_000_000 } },
  { key: "security.session_timeout_minutes", writable: ["platform"], spec: { type: "number", min: 5, max: 240 } },
  { key: "security.two_factor_admin", writable: ["platform"], spec: { type: "boolean" } },
  { key: "security.two_factor_admin_enforced", writable: ["platform"], spec: { type: "boolean" } },
  { key: "finance.maker_checker_enforced", writable: ["platform"], spec: { type: "boolean" } },
  { key: "notifications.email_enabled", writable: ["platform", "vendor"], spec: { type: "boolean" } },
  { key: "notifications.sms_enabled", writable: ["platform", "vendor"], spec: { type: "boolean" } },
  { key: "escrow.auto_release_enabled", writable: ["platform", "vendor"], spec: { type: "boolean" } },
  { key: "risk.high_value_alert_ngn", writable: ["platform", "vendor"], spec: { type: "number", min: 1000, max: 50_000_000 } },
  { key: "commerce.checkout_enabled", writable: ["platform", "vendor"], spec: { type: "boolean" } },
  { key: "commerce.add_to_cart_enabled", writable: ["platform", "vendor"], spec: { type: "boolean" } },
  { key: "commerce.cart_disabled_reason", writable: ["platform", "vendor"], spec: { type: "text", maxLength: 300 } },
  { key: "commerce.checkout_disabled_reason", writable: ["platform", "vendor"], spec: { type: "text", maxLength: 300 } },
  // ── Media standards (mirror of src/lib/settings-catalog.ts) ──
  { key: "media.image_min_dimension_px", writable: ["platform"], spec: { type: "number", min: 200, max: 4000 } },
  { key: "media.image_recommended_min_px", writable: ["platform"], spec: { type: "number", min: 200, max: 8000 } },
  { key: "media.image_allowed_ratios", writable: ["platform"], spec: { type: "string_list", options: ["1:1", "3:4", "4:5", "4:3", "16:9", "9:16"], minItems: 1 } },
  { key: "media.image_auto_normalise_ratio", writable: ["platform"], spec: { type: "boolean" } },
  { key: "media.image_max_bytes", writable: ["platform"], spec: { type: "number", min: 262_144, max: 20_971_520 } },
  { key: "media.image_allowed_formats", writable: ["platform"], spec: { type: "string_list", options: ["jpeg", "png", "webp"], minItems: 1 } },
  { key: "media.product_min_images_to_publish", writable: ["platform"], spec: { type: "number", min: 1, max: 10 } },
  { key: "media.product_max_images", writable: ["platform"], spec: { type: "number", min: 1, max: 20 } },
  { key: "media.product_max_videos", writable: ["platform"], spec: { type: "number", min: 0, max: 5 } },
  { key: "media.video_allowed_formats", writable: ["platform"], spec: { type: "string_list", options: ["mp4", "webm"], minItems: 1 } },
  { key: "media.video_min_height_px", writable: ["platform"], spec: { type: "number", min: 240, max: 2160 } },
  { key: "media.video_max_seconds", writable: ["platform"], spec: { type: "number", min: 5, max: 600 } },
  { key: "media.video_max_bytes", writable: ["platform"], spec: { type: "number", min: 1_048_576, max: 209_715_200 } },
  { key: "media.video_allowed_ratios", writable: ["platform"], spec: { type: "string_list", options: ["1:1", "4:5", "9:16", "16:9", "4:3"], minItems: 1 } },
  { key: "media.quality_advisories_enabled", writable: ["platform"], spec: { type: "boolean" } },
  { key: "media.server_verification_enabled", writable: ["platform"], spec: { type: "boolean" } },
  { key: "media.grandfather_before", writable: ["platform"], spec: { type: "text", maxLength: 40 } },
  // commerce.disabled_reason is a free-text string; it intentionally has no
  // catalog entry so writes at any scope pass through unclamped.
];


/**
 * Validate a `pricing.tier_rates` value.
 *
 * Rules:
 * - Non-empty array of `{ upto: number | null; rate: number }`.
 * - Every `rate` is finite, >= 0 and <= 1 (0%-100%).
 * - Every non-open-ended `upto` is a positive finite number.
 * - `upto` values are strictly increasing across the list (this both
 *   prevents overlaps: a duplicate or smaller `upto` after a larger one —
 *   and prevents gaps, since each tier's implicit lower bound is the
 *   previous tier's `upto`, so a strictly increasing chain starting at 0
 *   is gapless by construction).
 * - Exactly one tier is open-ended (`upto === null`), and it must be last.
 */
export function validateTierRates(
  value: unknown,
): { ok: true; error?: undefined } | { ok: false; error: string } {
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, error: "tiers_must_be_non_empty_array" };
  }
  const tiers = value as Array<{ upto: unknown; rate: unknown }>;
  let openEndedCount = 0;
  let prevUpto = 0;
  let sawFirst = false;
  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i];
    const rate = t?.rate;
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate < 0 || rate > 1) {
      return { ok: false, error: `tier_${i}_invalid_rate` };
    }
    const upto = t?.upto;
    if (upto === null || upto === undefined) {
      openEndedCount++;
      if (i !== tiers.length - 1) {
        return { ok: false, error: "open_ended_tier_must_be_last" };
      }
    } else {
      if (typeof upto !== "number" || !Number.isFinite(upto) || upto <= 0) {
        return { ok: false, error: `tier_${i}_invalid_upto` };
      }
      if (sawFirst && upto <= prevUpto) {
        return { ok: false, error: `tier_${i}_overlaps_or_out_of_order` };
      }
      prevUpto = upto;
      sawFirst = true;
    }
  }
  if (openEndedCount === 0) {
    return { ok: false, error: "missing_open_ended_final_tier" };
  }
  if (openEndedCount > 1) {
    return { ok: false, error: "more_than_one_open_ended_tier" };
  }
  return { ok: true };
}

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
    const v = validateTierRates(value);
    if (!v.ok) return { ok: false, error: v.error };
    return { ok: true, value };
  }
  if (spec.type === "string_list") {
    if (!Array.isArray(value)) return { ok: false, error: "not_a_list" };
    const list = value.map((v) => String(v));
    if (spec.minItems != null && list.length < spec.minItems) return { ok: false, error: "too_few_items" };
    for (const item of list) {
      if (!spec.options.includes(item)) return { ok: false, error: `not_in_options:${item}` };
    }
    return { ok: true, value: list };
  }
  if (spec.type === "text") {
    const s = String(value ?? "");
    if (spec.maxLength != null && s.length > spec.maxLength) return { ok: false, error: "too_long" };
    return { ok: true, value: s };
  }
  return { ok: true, value };
}
/**
 * DEPRECATED setting keys: mirror of `src/lib/settings-catalog.ts`.
 *
 * These rows still exist in `system_settings` but no code reads them. They are
 * kept (not deleted) because historical settings rows are part of the audit
 * record. Never write to these; read the `replacedBy` key instead.
 */
export const DEPRECATED_SETTING_KEYS: Record<string, { replacedBy: string | null; note: string }> = {
  "platform.auto_release_enabled": { replacedBy: "escrow.auto_release_enabled", note: "Superseded by the audited escrow auto-release switch." },
  "platform.email_notifications": { replacedBy: "notifications.email_enabled", note: "Superseded by the notifications channel kill switch." },
  "platform.sms_notifications": { replacedBy: "notifications.sms_enabled", note: "Superseded by the notifications channel kill switch." },
  "security.two_factor_required": { replacedBy: "security.two_factor_admin", note: "Superseded by the admin-scoped 2FA key." },
  "security.kyc_required_over_ngn": { replacedBy: "security.id_verification_threshold", note: "Superseded by the ID verification threshold." },
  platform_fee_percentage: { replacedBy: "pricing.tier_rates", note: "Flat-percentage pricing generation (G1). See docs/pricing-fee-generations.md." },
  processing_fee_percentage: { replacedBy: "pricing.tier_rates", note: "Flat-percentage pricing generation (G1). See docs/pricing-fee-generations.md." },
};
