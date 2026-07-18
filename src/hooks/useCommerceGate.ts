import { useEffect, useState } from "react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export interface CommerceGateState {
  checkoutEnabled: boolean;
  addToCartEnabled: boolean;
  disabledReason: string;
  loading: boolean;
  scope: "platform" | "vendor";
}

const DEFAULTS: Omit<CommerceGateState, "loading"> = {
  checkoutEnabled: false,
  addToCartEnabled: true,
  disabledReason:
    "Checkout is not yet available. We're preparing the platform — you can browse and set up your account in the meantime.",
  scope: "platform",
};

const cache = new Map<string, Omit<CommerceGateState, "loading">>();
const inflight = new Map<string, Promise<Omit<CommerceGateState, "loading">>>();

async function fetchGate(vendorId: string | null | undefined): Promise<Omit<CommerceGateState, "loading">> {
  const key = vendorId ?? "__platform__";
  if (cache.has(key)) return cache.get(key)!;
  if (inflight.has(key)) return inflight.get(key)!;
  const p = (async () => {
    try {
      const url = vendorId
        ? `${SUPABASE_URL}/functions/v1/commerce-config?vendor_id=${encodeURIComponent(vendorId)}`
        : `${SUPABASE_URL}/functions/v1/commerce-config`;
      const res = await fetch(url);
      if (!res.ok) return DEFAULTS;
      const json = await res.json();
      const parsed = {
        checkoutEnabled: Boolean(json?.checkout_enabled),
        addToCartEnabled: json?.add_to_cart_enabled != null ? Boolean(json.add_to_cart_enabled) : true,
        disabledReason: typeof json?.disabled_reason === "string" ? json.disabled_reason : DEFAULTS.disabledReason,
        scope: (json?.scope as "platform" | "vendor") ?? "platform",
      };
      cache.set(key, parsed);
      return parsed;
    } catch {
      return DEFAULTS;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

/**
 * Resolve the effective commerce gate for a vendor (or platform-wide when no vendor id).
 * Returns loading=true on first fetch; falls back to safe defaults on error.
 */
export function useCommerceGate(vendorId?: string | null): CommerceGateState {
  const key = vendorId ?? "__platform__";
  const [state, setState] = useState<CommerceGateState>(() => {
    if (cache.has(key)) return { ...cache.get(key)!, loading: false };
    return { ...DEFAULTS, loading: true };
  });
  useEffect(() => {
    let cancelled = false;
    if (cache.has(key)) {
      setState({ ...cache.get(key)!, loading: false });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    fetchGate(vendorId ?? null).then((v) => {
      if (!cancelled) setState({ ...v, loading: false });
    });
    return () => { cancelled = true; };
  }, [key, vendorId]);
  return state;
}