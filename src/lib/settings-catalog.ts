/**
 * Central manifest of every setting key the admin UI can write.
 *
 * Purpose:
 * - Single source of truth for type, min/max, help text, and which scope
 *   a key can be written at (`platform | vendor`).
 * - Used by the admin UI to render/validate fields and by the
 *   `admin-system-settings` edge function to clamp writes.
 *
 * Keep this in lock-step with `supabase/functions/_shared/settings-catalog.ts`.
 */

export type SettingScope = "platform" | "vendor";

export interface NumberSpec {
  type: "number";
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}
export interface BoolSpec { type: "boolean" }
export interface EnumSpec { type: "enum"; options: string[] }
export interface TiersSpec { type: "tiers" }
/** A list of short string tokens constrained to a fixed option set. */
export interface StringListSpec { type: "string_list"; options: string[]; minItems?: number }
/** Free-form short text (no option set). */
export interface TextSpec { type: "text"; maxLength?: number }

export type SettingSpec = NumberSpec | BoolSpec | EnumSpec | TiersSpec | StringListSpec | TextSpec;

export interface CatalogEntry {
  key: string;
  label: string;
  help: string;
  spec: SettingSpec;
  /** Scopes where a write is legal. */
  writable: SettingScope[];
}

export const SETTINGS_CATALOG: CatalogEntry[] = [
  {
    key: "pricing.min_platform_fee_ngn",
    label: "Minimum platform fee",
    help: "Floor per transaction (NGN).",
    spec: { type: "number", min: 0, max: 10_000, step: 50, unit: "NGN" },
    writable: ["platform"],
  },
  {
    key: "pricing.max_total_service_fee_ngn",
    label: "Total service-fee cap",
    help: "Buyer-friendly ceiling on service fees (NGN).",
    spec: { type: "number", min: 500, max: 25_000, step: 100, unit: "NGN" },
    writable: ["platform", "vendor"],
  },
  {
    key: "pricing.tier_rates",
    label: "Tier rates",
    help: "Buyer service-fee tier rates (JSON).",
    spec: { type: "tiers" },
    writable: ["platform"],
  },
  {
    key: "pricing.platform_fee_rate",
    label: "Escrow fee rate",
    help: "Percentage component of the SafeDeal fee (0.02 = 2%). Growth-plan vendors resolve to 1.5%.",
    spec: { type: "number", min: 0, max: 0.2, step: 0.0005 },
    writable: ["platform", "vendor"],
  },
  {
    key: "pricing.platform_fee_flat_ngn",
    label: "Escrow fee flat component",
    help: "Flat NGN component added to the SafeDeal fee on every deal.",
    spec: { type: "number", min: 0, max: 5_000, step: 50, unit: "NGN" },
    writable: ["platform"],
  },
  {
    key: "pricing.max_platform_fee_ngn",
    label: "SafeDeal fee cap",
    help: "Hard ceiling on the SafeDeal fee per completed deal (NGN).",
    spec: { type: "number", min: 100, max: 50_000, step: 100, unit: "NGN" },
    writable: ["platform"],
  },
  {
    key: "fees.refund_policy",
    label: "Refund policy",
    help: "Whether service fees are refundable.",
    spec: { type: "enum", options: ["Non-refundable", "Refundable on cancellation", "Refundable within 24h"] },
    writable: ["platform"],
  },
  {
    key: "security.require_id_verification",
    label: "Require ID verification",
    help: "Mandatory KYC for transactions over the threshold.",
    spec: { type: "boolean" },
    writable: ["platform", "vendor"],
  },
  {
    key: "security.id_verification_threshold",
    label: "ID verification threshold",
    help: "Transactions above this amount require KYC (NGN).",
    spec: { type: "number", min: 0, max: 10_000_000, step: 500, unit: "NGN" },
    writable: ["platform", "vendor"],
  },
  {
    key: "security.session_timeout_minutes",
    label: "Session timeout",
    help: "Admin session inactivity timeout.",
    spec: { type: "number", min: 5, max: 240, step: 5, unit: "minutes" },
    writable: ["platform"],
  },
  {
    key: "security.two_factor_admin",
    label: "Two-factor for admins",
    help: "Advisory only: records the platform's 2FA policy. It does NOT block sign-in on its own; turn on \"Enforce two-factor for admins\" to actually require AAL2.",
    spec: { type: "boolean" },
    writable: ["platform"],
  },
  {
    key: "security.two_factor_admin_enforced",
    label: "Enforce two-factor for admins",
    help: "When on, admin API calls are rejected unless the session has completed a second factor (AAL2). Leave off until every internal user has enrolled. Otherwise they lose access immediately.",
    spec: { type: "boolean" },
    writable: ["platform"],
  },
  {
    key: "finance.maker_checker_enforced",
    label: "Maker-checker for money movement",
    help: "When on, the admin who flagged or opened a release/refund cannot be the one who executes it. Leave off for single-operator teams. Self-approvals are logged either way.",
    spec: { type: "boolean" },
    writable: ["platform"],
  },
  {
    key: "notifications.email_enabled",
    label: "Email notifications",
    help: "Send email updates for transaction events.",
    spec: { type: "boolean" },
    writable: ["platform", "vendor"],
  },
  {
    key: "notifications.sms_enabled",
    label: "SMS alerts",
    help: "Send SMS for critical transaction updates.",
    spec: { type: "boolean" },
    writable: ["platform", "vendor"],
  },
  {
    key: "escrow.auto_release_enabled",
    label: "Auto-release payments",
    help: "Release funds automatically when the buyer verification window elapses. When OFF, admin must trigger release from the Payouts page.",
    spec: { type: "boolean" },
    writable: ["platform", "vendor"],
  },
  {
    key: "risk.high_value_alert_ngn",
    label: "High-value transaction alert",
    help: "Flag transactions above this amount for admin review (NGN).",
    spec: { type: "number", min: 1000, max: 50_000_000, step: 1000, unit: "NGN" },
    writable: ["platform", "vendor"],
  },
  {
    key: "commerce.checkout_enabled",
    label: "Checkout enabled",
    help: "Master kill switch for payments and full checkout. When OFF, buyers can browse and set up accounts but cannot pay.",
    spec: { type: "boolean" },
    writable: ["platform", "vendor"],
  },
  {
    key: "commerce.add_to_cart_enabled",
    label: "Add-to-cart enabled",
    help: "Allows adding items to a cart and changing cart quantities. When OFF, cart controls are hidden and existing carts are preserved read-only (nothing is deleted).",
    spec: { type: "boolean" },
    writable: ["platform", "vendor"],
  },
  {
    key: "commerce.cart_disabled_reason",
    label: "Cart disabled message",
    help: "Shown to shoppers when add-to-cart is OFF. Ignored while the global 'shown to shoppers' override message is set.",
    spec: { type: "text", maxLength: 300 },
    writable: ["platform", "vendor"],
  },
  {
    key: "commerce.checkout_disabled_reason",
    label: "Checkout disabled message",
    help: "Shown to shoppers when checkout is OFF. Ignored while the global 'shown to shoppers' override message is set.",
    spec: { type: "text", maxLength: 300 },
    writable: ["platform", "vendor"],
  },
  // ── Media standards (Temu-grade product media) ──
  {
    key: "media.image_min_dimension_px",
    label: "Image minimum dimension",
    help: "Absolute floor for both width and height of a product image (px). Hard block.",
    spec: { type: "number", min: 200, max: 4000, step: 100, unit: "px" },
    writable: ["platform"],
  },
  {
    key: "media.image_recommended_min_px",
    label: "Image recommended minimum",
    help: "Advisory only: recommended minimum on the longest side (px). Never blocks an upload.",
    spec: { type: "number", min: 200, max: 8000, step: 100, unit: "px" },
    writable: ["platform"],
  },
  {
    key: "media.image_allowed_ratios",
    label: "Allowed image ratios",
    help: "Accepted aspect ratios for product images. Out-of-ratio images are padded to the nearest allowed ratio when auto-normalisation is ON, otherwise rejected.",
    spec: { type: "string_list", options: ["1:1", "3:4", "4:5", "4:3", "16:9", "9:16"], minItems: 1 },
    writable: ["platform"],
  },
  {
    key: "media.image_auto_normalise_ratio",
    label: "Auto-normalise image ratio",
    help: "When ON, an out-of-ratio image is padded with white to the nearest allowed ratio (never cropped) and the seller is shown a before/after preview. When OFF, out-of-ratio images are rejected instead.",
    spec: { type: "boolean" },
    writable: ["platform"],
  },
  {
    key: "media.image_max_bytes",
    label: "Image maximum size",
    help: "Largest accepted product image, in bytes. Hard block, verified server-side.",
    spec: { type: "number", min: 262_144, max: 20_971_520, step: 262_144, unit: "bytes" },
    writable: ["platform"],
  },
  {
    key: "media.image_allowed_formats",
    label: "Allowed image formats",
    help: "Accepted image formats. HEIC is intentionally excluded. Sellers are told to switch iPhone Camera to 'Most Compatible'.",
    spec: { type: "string_list", options: ["jpeg", "png", "webp"], minItems: 1 },
    writable: ["platform"],
  },
  {
    key: "media.product_min_images_to_publish",
    label: "Minimum images to publish",
    help: "A product needs at least this many images to be published. Draft saving is always allowed regardless of media.",
    spec: { type: "number", min: 1, max: 10, step: 1 },
    writable: ["platform"],
  },
  {
    key: "media.product_max_images",
    label: "Maximum images per product",
    help: "Upper bound on product images.",
    spec: { type: "number", min: 1, max: 20, step: 1 },
    writable: ["platform"],
  },
  {
    key: "media.product_max_videos",
    label: "Maximum videos per product",
    help: "Upper bound on product videos.",
    spec: { type: "number", min: 0, max: 5, step: 1 },
    writable: ["platform"],
  },
  {
    key: "media.video_allowed_formats",
    label: "Allowed video formats",
    help: "Accepted video containers (MP4/H.264 and WebM).",
    spec: { type: "string_list", options: ["mp4", "webm"], minItems: 1 },
    writable: ["platform"],
  },
  {
    key: "media.video_min_height_px",
    label: "Video minimum height",
    help: "Resolution floor for product video (px). 720 = 720p.",
    spec: { type: "number", min: 240, max: 2160, step: 60, unit: "px" },
    writable: ["platform"],
  },
  {
    key: "media.video_max_seconds",
    label: "Video maximum duration",
    help: "Longest accepted product video, in seconds.",
    spec: { type: "number", min: 5, max: 600, step: 5, unit: "s" },
    writable: ["platform"],
  },
  {
    key: "media.video_max_bytes",
    label: "Video maximum size",
    help: "Largest accepted product video, in bytes.",
    spec: { type: "number", min: 1_048_576, max: 209_715_200, step: 1_048_576, unit: "bytes" },
    writable: ["platform"],
  },
  {
    key: "media.video_allowed_ratios",
    label: "Allowed video ratios",
    help: "Accepted video aspect ratios. Videos are never auto-normalised.",
    spec: { type: "string_list", options: ["1:1", "4:5", "9:16", "16:9", "4:3"], minItems: 1 },
    writable: ["platform"],
  },
  {
    key: "media.quality_advisories_enabled",
    label: "Photo quality hints",
    help: "When ON, sellers see advisory warnings (background, frame fill, watermark). These never block an upload.",
    spec: { type: "boolean" },
    writable: ["platform"],
  },
  {
    key: "media.server_verification_enabled",
    label: "Server-side media verification",
    help: "When ON, uploads are re-read from Cloudinary and validated server-side (authoritative). Turning it OFF is the rollback switch: the system falls back to client-reported size/format only.",
    spec: { type: "boolean" },
    writable: ["platform"],
  },
  {
    key: "media.grandfather_before",
    label: "Media rules cutoff",
    help: "Products created before this timestamp are exempt from the media publish rules. Existing live listings are never unpublished.",
    spec: { type: "text", maxLength: 40 },
    writable: ["platform"],
  },
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

export const CATALOG_BY_KEY: Record<string, CatalogEntry> = Object.fromEntries(
  SETTINGS_CATALOG.map((e) => [e.key, e]),
);

/**
 * DEPRECATED setting keys.
 *
 * These rows still exist in `system_settings` but NO code reads them. They are
 * superseded by the canonical keys in `SETTINGS_CATALOG` above. They are
 * intentionally NOT deleted: historical settings rows are part of the audit
 * record, and deleting them would erase who configured what and when.
 *
 * Rules:
 * - Never add a deprecated key back to `SETTINGS_CATALOG`.
 * - Never write to a deprecated key.
 * - Read the `replacedBy` key instead.
 */
export const DEPRECATED_SETTING_KEYS: Record<string, { replacedBy: string | null; note: string }> = {
  "platform.auto_release_enabled": {
    replacedBy: "escrow.auto_release_enabled",
    note: "Superseded by the audited escrow auto-release switch.",
  },
  "platform.email_notifications": {
    replacedBy: "notifications.email_enabled",
    note: "Superseded by the notifications channel kill switch.",
  },
  "platform.sms_notifications": {
    replacedBy: "notifications.sms_enabled",
    note: "Superseded by the notifications channel kill switch.",
  },
  "security.two_factor_required": {
    replacedBy: "security.two_factor_admin",
    note: "Superseded by the admin-scoped 2FA key.",
  },
  "security.kyc_required_over_ngn": {
    replacedBy: "security.id_verification_threshold",
    note: "Superseded by the ID verification threshold.",
  },
  platform_fee_percentage: {
    replacedBy: "pricing.tier_rates",
    note: "Flat-percentage pricing generation (G1). Replaced by tiered rates. See docs/pricing-fee-generations.md.",
  },
  processing_fee_percentage: {
    replacedBy: "pricing.tier_rates",
    note: "Flat-percentage pricing generation (G1). Replaced by tiered rates. See docs/pricing-fee-generations.md.",
  },
};

/**
 * Keys that are live in the catalog but currently INERT because the feature
 * behind them is not implemented yet. They are read but do not change
 * behaviour. Kept so the switch is already audited when the channel ships.
 */
export const INERT_SETTING_KEYS: Record<string, string> = {
  "notifications.sms_enabled":
    "No SMS delivery channel is implemented; only the email channel is processed by process-notification-deliveries.",
};

/**
 * Validate + clamp a single setting value against the catalog.
 * Returns `{ ok, value, error }`. Unknown keys pass through untouched.
 */
export function clampSetting(
  key: string,
  value: unknown,
  scope: SettingScope,
): { ok: true; value: unknown } | { ok: false; error: string } {
  const entry = CATALOG_BY_KEY[key];
  if (!entry) return { ok: true, value };
  if (!entry.writable.includes(scope)) {
    return { ok: false, error: `not_writable_at_${scope}` };
  }
  const { spec } = entry;
  switch (spec.type) {
    case "number": {
      const n = typeof value === "string" ? Number(value) : (value as number);
      if (!Number.isFinite(n)) return { ok: false, error: "not_a_number" };
      let clamped = n;
      if (spec.min != null) clamped = Math.max(spec.min, clamped);
      if (spec.max != null) clamped = Math.min(spec.max, clamped);
      return { ok: true, value: clamped };
    }
    case "boolean": {
      return { ok: true, value: Boolean(value) };
    }
    case "enum": {
      const s = String(value);
      if (!spec.options.includes(s)) return { ok: false, error: "not_in_enum" };
      return { ok: true, value: s };
    }
    case "tiers": {
      const v = validateTierRates(value);
      if (!v.ok) return { ok: false, error: v.error };
      return { ok: true, value };
    }
    case "string_list": {
      if (!Array.isArray(value)) return { ok: false, error: "not_a_list" };
      const list = value.map((v) => String(v));
      if (spec.minItems != null && list.length < spec.minItems) {
        return { ok: false, error: "too_few_items" };
      }
      for (const item of list) {
        if (!spec.options.includes(item)) return { ok: false, error: `not_in_options:${item}` };
      }
      return { ok: true, value: list };
    }
    case "text": {
      const s = String(value ?? "");
      if (spec.maxLength != null && s.length > spec.maxLength) {
        return { ok: false, error: "too_long" };
      }
      return { ok: true, value: s };
    }
  }
}