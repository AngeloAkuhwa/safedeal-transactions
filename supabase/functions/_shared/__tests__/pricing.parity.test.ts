/**
 * Snapshot parity between "no config override" and "override that matches the
 * platform default". Guarantees that introducing the vendor-scoped resolver
 * cannot silently change server-computed pricing for vendors on defaults.
 *
 * Run with: `deno test supabase/functions/_shared/__tests__/pricing.parity.test.ts`
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  computePricing,
  type PricingConfigOverride,
} from "../pricing.ts";
import {
  buildPricingSnapshot,
  PRICING_MODEL_VERSION_DEFAULT,
  computePricingModelVersion,
} from "../safedeal-money-policy.ts";

/** Mirrors the constants baked into `_shared/pricing.ts`. */
const DEFAULT_MIRROR: PricingConfigOverride = {
  min_platform_fee: 250,
  max_total_service_fee: 2500,
  tier_rates: [
    { upto: 100_000, rate: 0.039 },
    { upto: 500_000, rate: 0.035 },
    { upto: 2_000_000, rate: 0.029 },
    { upto: null, rate: 0.025 },
  ],
};

const AMOUNTS = [1_000, 25_000, 100_000, 450_000, 1_500_000, 5_000_000];

Deno.test("server pricing: empty config === no config", () => {
  for (const a of AMOUNTS) {
    const bare = computePricing(a, "NGN", "local");
    const empty = computePricing(a, "NGN", "local", {});
    assertEquals(empty, bare, `mismatch @ ${a} for empty config`);
  }
});

Deno.test("server pricing: mirrored default config === no config", () => {
  for (const a of AMOUNTS) {
    const bare = computePricing(a, "NGN", "local");
    const mirrored = computePricing(a, "NGN", "local", DEFAULT_MIRROR);
    assertEquals(mirrored, bare, `mismatch @ ${a} for mirrored default`);
  }
});

Deno.test("snapshot parity: buildPricingSnapshot with mirrored default matches no-config", () => {
  for (const a of AMOUNTS) {
    const bare = buildPricingSnapshot(a, "NGN");
    const mirrored = buildPricingSnapshot(a, "NGN", DEFAULT_MIRROR);
    // Version stamp intentionally differs when a config object is passed;
    // strip it before comparing money math to isolate the parity claim.
    const { pricing_model_version: _v1, ...bareRest } = bare;
    const { pricing_model_version: _v2, ...mirroredRest } = mirrored;
    assertEquals(mirroredRest, bareRest, `snapshot mismatch @ ${a}`);
  }
});

Deno.test("version stamp: no config yields default; overrides yield derived tag", () => {
  assertEquals(computePricingModelVersion(), PRICING_MODEL_VERSION_DEFAULT);
  const custom: PricingConfigOverride = { max_total_service_fee: 5000, min_platform_fee: 500 };
  const v = computePricingModelVersion(custom);
  // Derived tag encodes cap + floor for auditability
  assertEquals(v.includes("5000"), true);
  assertEquals(v.includes("500"), true);
});