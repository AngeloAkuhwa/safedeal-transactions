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

export type SettingSpec = NumberSpec | BoolSpec | EnumSpec | TiersSpec;

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
    help: "Require 2FA for admin accounts.",
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
];

export const CATALOG_BY_KEY: Record<string, CatalogEntry> = Object.fromEntries(
  SETTINGS_CATALOG.map((e) => [e.key, e]),
);

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
      if (!Array.isArray(value)) return { ok: false, error: "tiers_must_be_array" };
      for (const t of value as Array<{ upto: number | null; rate: number }>) {
        if (typeof t?.rate !== "number" || t.rate < 0 || t.rate > 1) {
          return { ok: false, error: "invalid_tier_rate" };
        }
      }
      return { ok: true, value };
    }
  }
}