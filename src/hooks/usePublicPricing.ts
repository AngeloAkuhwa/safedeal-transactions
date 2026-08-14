import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { PricingConfigOverride } from "@/lib/pricing";
import {
  buildPublicPricingCopy,
  FALLBACK_SACHETS,
  type PublicPricingCopy,
  type SachetCatalog,
} from "@/lib/pricing-copy";

function parse(raw: Record<string, unknown>): PricingConfigOverride {
  const num = (v: unknown): number | undefined => {
    if (typeof v === "number") return v;
    if (typeof v === "string" && Number.isFinite(Number(v))) return Number(v);
    return undefined;
  };
  return {
    min_platform_fee: num(raw["pricing.min_platform_fee_ngn"]),
    max_total_service_fee: num(raw["pricing.max_total_service_fee_ngn"]),
    platform_fee_rate: num(raw["pricing.platform_fee_rate"]),
    platform_fee_flat: num(raw["pricing.platform_fee_flat_ngn"]),
    max_platform_fee: num(raw["pricing.max_platform_fee_ngn"]),
  };
}

/**
 * Live platform pricing copy for public surfaces. Falls back to the
 * disaster-recovery config only when the anonymous read fails.
 */
export function usePublicPricing(): { copy: PublicPricingCopy; live: boolean } {
  const [copy, setCopy] = useState<PublicPricingCopy>(() => buildPublicPricingCopy());
  const [live, setLive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.functions
      .invoke("public-pricing", { method: "GET" })
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        const cfg = parse((data.config ?? {}) as Record<string, unknown>);
        const sachets = (data.sachets ?? FALLBACK_SACHETS) as SachetCatalog;
        setCopy(buildPublicPricingCopy(cfg, sachets));
        setLive(true);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  return { copy, live };
}
