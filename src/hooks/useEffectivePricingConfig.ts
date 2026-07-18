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
 * Returns platform defaults ({}) while loading or if the fetch fails,
 * so callers can render without waiting.
 */
export function useEffectivePricingConfig(vendorId: string | null | undefined): PricingConfigOverride {
  const [cfg, setCfg] = useState<PricingConfigOverride>(() =>
    vendorId && cache.has(vendorId) ? cache.get(vendorId)! : {},
  );
  useEffect(() => {
    if (!vendorId) return;
    let cancelled = false;
    fetchOne(vendorId).then((c) => { if (!cancelled) setCfg(c); });
    return () => { cancelled = true; };
  }, [vendorId]);
  return cfg;
}

/** Batch variant for cart-style views with multiple sellers. */
export function useEffectivePricingConfigs(vendorIds: string[]): Record<string, PricingConfigOverride> {
  const key = vendorIds.slice().sort().join(",");
  const [map, setMap] = useState<Record<string, PricingConfigOverride>>(() => {
    const seed: Record<string, PricingConfigOverride> = {};
    for (const id of vendorIds) if (cache.has(id)) seed[id] = cache.get(id)!;
    return seed;
  });
  useEffect(() => {
    let cancelled = false;
    Promise.all(vendorIds.map((id) => fetchOne(id).then((c) => [id, c] as const))).then((entries) => {
      if (cancelled) return;
      const next: Record<string, PricingConfigOverride> = {};
      for (const [id, c] of entries) next[id] = c;
      setMap(next);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return map;
}