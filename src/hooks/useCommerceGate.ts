import { useQuery } from "@tanstack/react-query";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export interface CommerceGateState {
  checkoutEnabled: boolean;
  addToCartEnabled: boolean;
  disabledReason: string;
  /** Copy for the add-to-cart surface (global override wins when set). */
  cartDisabledReason: string;
  /** Copy for the pay/checkout surface (global override wins when set). */
  checkoutDisabledReason: string;
  loading: boolean;
  scope: "platform" | "vendor";
  sources: Record<string, "vendor" | "platform" | "default">;
}

export const DEFAULT_CART_DISABLED_REASON =
  "Cart is temporarily unavailable. You can still buy this item now. Checkout works normally.";
export const DEFAULT_CHECKOUT_DISABLED_REASON =
  "Checkout is not yet available. We're preparing the platform: you can browse and set up your account in the meantime.";

const DEFAULTS: Omit<CommerceGateState, "loading"> = {
  checkoutEnabled: false,
  // Fail closed, matching DEFAULT_COMMERCE_CONFIG on the server. If the config
  // fetch fails we must not show a control that the server will reject.
  addToCartEnabled: false,
  disabledReason:
    "Checkout is not yet available. We're preparing the platform: you can browse and set up your account in the meantime.",
  cartDisabledReason: DEFAULT_CART_DISABLED_REASON,
  checkoutDisabledReason: DEFAULT_CHECKOUT_DISABLED_REASON,
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
    const globalOverride = typeof json?.disabled_reason === "string" && json.disabled_reason
      ? json.disabled_reason as string
      : null;
    return {
      checkoutEnabled: Boolean(json?.checkout_enabled),
      addToCartEnabled: json?.add_to_cart_enabled != null ? Boolean(json.add_to_cart_enabled) : DEFAULTS.addToCartEnabled,
      disabledReason: typeof json?.disabled_reason === "string" ? json.disabled_reason : DEFAULTS.disabledReason,
      cartDisabledReason: (typeof json?.cart_disabled_reason === "string" && json.cart_disabled_reason)
        ? json.cart_disabled_reason
        : globalOverride ?? DEFAULTS.cartDisabledReason,
      checkoutDisabledReason: (typeof json?.checkout_disabled_reason === "string" && json.checkout_disabled_reason)
        ? json.checkout_disabled_reason
        : globalOverride ?? DEFAULTS.checkoutDisabledReason,
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