import { useQuery } from "@tanstack/react-query";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export interface CommerceGateState {
  checkoutEnabled: boolean;
  addToCartEnabled: boolean;
  disabledReason: string;
  loading: boolean;
  scope: "platform" | "vendor";
  sources: Record<string, "vendor" | "platform" | "default">;
}

const DEFAULTS: Omit<CommerceGateState, "loading"> = {
  checkoutEnabled: false,
  addToCartEnabled: true,
  disabledReason:
    "Checkout is not yet available. We're preparing the platform — you can browse and set up your account in the meantime.",
  scope: "platform",
  sources: {},
};

async function fetchGate(vendorId: string | null | undefined): Promise<Omit<CommerceGateState, "loading">> {
  try {
    const url = vendorId
      ? `${SUPABASE_URL}/functions/v1/commerce-config?vendor_id=${encodeURIComponent(vendorId)}`
      : `${SUPABASE_URL}/functions/v1/commerce-config`;
    const res = await fetch(url);
    if (!res.ok) return DEFAULTS;
    const json = await res.json();
    return {
      checkoutEnabled: Boolean(json?.checkout_enabled),
      addToCartEnabled: json?.add_to_cart_enabled != null ? Boolean(json.add_to_cart_enabled) : true,
      disabledReason: typeof json?.disabled_reason === "string" ? json.disabled_reason : DEFAULTS.disabledReason,
      scope: (json?.scope as "platform" | "vendor") ?? "platform",
      sources: (json?.sources && typeof json.sources === "object") ? json.sources : {},
    };
  } catch {
    return DEFAULTS;
  }
}

/**
 * Resolve the effective commerce gate for a vendor (or platform-wide when no vendor id).
 * Uses React Query so results are cached across the app and refreshed on window focus.
 * Returns loading=true on first fetch; falls back to safe defaults on error.
 */
export function useCommerceGate(vendorId?: string | null): CommerceGateState {
  const key = vendorId ?? "__platform__";
  const query = useQuery({
    queryKey: ["commerce-gate", key],
    queryFn: () => fetchGate(vendorId ?? null),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  return { ...(query.data ?? DEFAULTS), loading: query.isLoading };
}