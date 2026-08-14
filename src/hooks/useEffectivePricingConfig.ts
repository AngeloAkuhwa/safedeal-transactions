import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { PricingConfigOverride } from "@/lib/pricing";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

// Simple in-memory cache so cart pages don't re-fetch per render.
const cache = new Map<string, PricingConfigOverride>();
const inflight = new Map<string, Promise<PricingConfigOverride>>();

function parseConfig(raw: Record<string, unknown>): PricingConfigOverride {
  const cfg: PricingConfigOverride = {};
  const min = raw["pricing.min_platform_fee_ngn"];
  const max = raw["pricing.max_total_service_fee_ngn"];
  const tiers = raw["pricing.tier_rates"];
  if (typeof min === "number") cfg.min_platform_fee = min;
  else if (typeof min === "string" && Number.isFinite(Number(min))) cfg.min_platform_fee = Number(min);
  if (typeof max === "number") cfg.max_total_service_fee = max;
  else if (typeof max === "string" && Number.isFinite(Number(max))) cfg.max_total_service_fee = Number(max);
  if (Array.isArray(tiers)) cfg.tier_rates = tiers as PricingConfigOverride["tier_rates"];
  const numKey = (key: string, field: "platform_fee_rate" | "platform_fee_flat" | "max_platform_fee") => {
    const v = raw[key];
    if (typeof v === "number") cfg[field] = v;
    else if (typeof v === "string" && Number.isFinite(Number(v))) cfg[field] = Number(v);
  };
  numKey("pricing.platform_fee_rate", "platform_fee_rate");
  numKey("pricing.platform_fee_flat_ngn", "platform_fee_flat");
  numKey("pricing.max_platform_fee_ngn", "max_platform_fee");
  return cfg;
}

async function fetchOne(vendorId: string): Promise<PricingConfigOverride> {
  // Feature flag: one-flip rollback to platform defaults without redeploy.
  if (String(import.meta.env.VITE_SETTINGS_RESOLVER_ENABLED ?? "true").toLowerCase() === "false") {
    return {};
  }
  if (cache.has(vendorId)) return cache.get(vendorId)!;
  if (inflight.has(vendorId)) return inflight.get(vendorId)!;
  const p = (async () => {
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) return {};
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/pricing-config?vendor_id=${encodeURIComponent(vendorId)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) return {};
      const json = await res.json();
      const cfg = parseConfig(json?.config ?? {});
      cache.set(vendorId, cfg);
      return cfg;
    } catch {
      return {};
    } finally {
      inflight.delete(vendorId);
    }
  })();
  inflight.set(vendorId, p);
  return p;
}

/**
 * Resolve the effective pricing config for one vendor.
 * While the fetch is in flight (and the vendor's config isn't already cached),
 * `loading` is true so callers can avoid rendering platform-default fees as if
 * they were final. Falls back to platform defaults ({}) if the fetch fails.
 */
export function useEffectivePricingConfig(
  vendorId: string | null | undefined,
): { config: PricingConfigOverride; loading: boolean } {
  const [state, setState] = useState<{ config: PricingConfigOverride; loading: boolean }>(() => ({
    config: vendorId && cache.has(vendorId) ? cache.get(vendorId)! : {},
    loading: !!vendorId && !cache.has(vendorId),
  }));

  useEffect(() => {
    if (!vendorId) {
      setState({ config: {}, loading: false });
      return;
    }
    if (cache.has(vendorId)) {
      setState({ config: cache.get(vendorId)!, loading: false });
      return;
    }
    let cancelled = false;
    setState({ config: {}, loading: true });
    fetchOne(vendorId).then((c) => {
      if (!cancelled) setState({ config: c, loading: false });
    });
    return () => { cancelled = true; };
  }, [vendorId]);

  return state;
}

/** Batch variant for cart-style views with multiple sellers. */
export function useEffectivePricingConfigs(
  vendorIds: string[],
): { configs: Record<string, PricingConfigOverride>; loading: boolean } {
  const key = vendorIds.slice().sort().join(",");
  const [state, setState] = useState<{ configs: Record<string, PricingConfigOverride>; loading: boolean }>(() => {
    const seed: Record<string, PricingConfigOverride> = {};
    let allCached = true;
    for (const id of vendorIds) {
      if (cache.has(id)) seed[id] = cache.get(id)!;
      else allCached = false;
    }
    return { configs: seed, loading: vendorIds.length > 0 && !allCached };
  });

  useEffect(() => {
    if (vendorIds.length === 0) {
      setState({ configs: {}, loading: false });
      return;
    }
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true }));
    Promise.all(vendorIds.map((id) => fetchOne(id).then((c) => [id, c] as const))).then((entries) => {
      if (cancelled) return;
      const next: Record<string, PricingConfigOverride> = {};
      for (const [id, c] of entries) next[id] = c;
      setState({ configs: next, loading: false });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}
