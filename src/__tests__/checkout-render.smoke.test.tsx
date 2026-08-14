/**
 * CHECKOUT SMOKE TESTS.
 *
 * Both buying entry points (cart review and Buy Now) previously called hooks
 * after their early returns and crashed with "Rendered more hooks than during
 * the previous render" on the first loading -> loaded transition. These tests
 * render each page through that transition, so the crash can never come back
 * unnoticed. The mocked hooks call `useState` themselves, so they still occupy
 * a hook slot in the render they run in.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/hooks/useCommerceGate", () => ({
  useCommerceGate: () => {
    const [state] = useState({ loading: false, checkoutEnabled: true, listingEnabled: true, reason: null });
    return state;
  },
}));

vi.mock("@/hooks/useEffectivePricingConfig", () => ({
  useEffectivePricingConfig: () => {
    const [state] = useState({ config: null, loading: false });
    return state;
  },
  useEffectivePricingConfigs: () => {
    const [state] = useState({ configs: {}, loading: false });
    return state;
  },
}));

vi.mock("@/components/marketplace/BuyerSidebar", () => ({
  BuyerSidebar: () => null,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { access_token: "test-token" } } }) },
  },
}));

const product = {
  id: "p1",
  title: "Test Item",
  slug: "test-item",
  short_description: "A thing",
  description: "A thing",
  unit_price: 50000,
  currency_code: "NGN",
  stock_quantity: 3,
  reserved_quantity: 0,
  status: "active",
  delivery_method: JSON.stringify(["courier"]),
  verification_window_hours: null,
  images: [],
  category: "electronics",
  condition: "new",
};

vi.mock("@/services/public-storefront.service", () => ({
  getPublicProductDetail: () =>
    new Promise((resolve) =>
      setTimeout(
        () =>
          resolve({
            product,
            seller: { id: "s1", full_name: "Seller", store_slug: "seller", identity_verified: false, phone_verified: false },
          }),
        0,
      ),
    ),
}));

vi.mock("@/services/storefront-checkout.service", () => ({
  createStorefrontTransaction: vi.fn(),
}));

function renderWithProviders(ui: React.ReactNode, route: string, path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path={path} element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        session: { id: "cs1", status: "pending", currency_code: "NGN" },
        items: [
          {
            id: "i1",
            product_id: "p1",
            seller_id: "s1",
            quantity: 1,
            unit_price: 50000,
            currency_code: "NGN",
          },
        ],
        products: { p1: product },
        sellers: { s1: { id: "s1", full_name: "Seller", store_slug: "seller", phone_verified: false } },
      }),
    })) as unknown as typeof fetch,
  );
});

describe("checkout pages survive the loading -> loaded transition", () => {
  it("renders CartCheckoutReview without a hook-order crash", async () => {
    const { default: CartCheckoutReview } = await import("@/pages/CartCheckoutReview");
    const errors: unknown[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...a) => errors.push(a[0]));
    renderWithProviders(<CartCheckoutReview />, "/dashboard/checkout/review?session=cs1", "/dashboard/checkout/review");
    await waitFor(() => expect(screen.getAllByText(/Test Item|Review|Checkout/i).length).toBeGreaterThan(0));
    spy.mockRestore();
    expect(errors.filter((e) => String(e).includes("Rendered more hooks"))).toEqual([]);
  });

  it("renders StorefrontCheckout without a hook-order crash", async () => {
    const { default: StorefrontCheckout } = await import("@/pages/StorefrontCheckout");
    const errors: unknown[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...a) => errors.push(a[0]));
    renderWithProviders(<StorefrontCheckout />, "/store/seller/test-item/checkout", "/store/:sellerSlug/:productSlug/checkout");
    await waitFor(() => expect(screen.getAllByText(/Test Item/i).length).toBeGreaterThan(0));
    spy.mockRestore();
    expect(errors.filter((e) => String(e).includes("Rendered more hooks"))).toEqual([]);
  });
});
