/**
 * BUYER PAYMENT SCREEN: PAYABLE vs BLOCKED.
 *
 * The pricing guard added last round is correct, but the payload that feeds it
 * omitted `service_fee_rate`, so EVERY snapshot-backed payment screen blocked
 * and no test noticed. These two renders pin both sides of the guard:
 *   - a COMPLETE snapshot must reach a payable screen (Pay button visible);
 *   - a MISSING snapshot must block with an honest error and no amount.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReviewData } from "@/services/review.service";

const reviewMock = vi.fn();

vi.mock("@/services/review.service", () => ({
  getTransactionReview: (...a: unknown[]) => reviewMock(...a),
}));

vi.mock("@/services/profile.service", () => ({
  getBuyerProfile: async () => ({
    permissions: {
      canStartProtectedPayment: true,
      isRegionEligible: true,
      verificationLevel: "verified",
      requiresPhoneVerification: false,
      requiresLocation: false,
      canCreateAnotherActiveTransaction: true,
    },
  }),
}));

vi.mock("@/components/dashboard/BuyerNav", () => ({ BuyerNav: () => null }));
vi.mock("@/components/landing/Footer", () => ({ Footer: () => null }));
vi.mock("@/hooks/useBuyerIdentity", () => ({
  useBuyerIdentity: () => ({ buyerName: "Test Buyer", avatarUrl: null }),
}));

/**
 * Who the page thinks is looking. Flipped per test so the guest arrival can be
 * rendered rather than only reasoned about.
 */
const SIGNED_IN = { access_token: "t", user: { id: "u1", email: "b@example.com" } };
let session: typeof SIGNED_IN | null = SIGNED_IN;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session } }),
      // useCheckoutIdentity subscribes so a buyer who signs in on another tab
      // does not have to reload. The mock has to offer it or the page throws
      // on mount, which is exactly what happened when this was left out.
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    from: () => ({
      select: () => ({
        eq: async () => ({ data: [{ role: "buyer" }] }),
      }),
    }),
    functions: { invoke: async () => ({ data: null, error: null }) },
  },
}));

import BuyerPaymentSummary from "@/pages/BuyerPaymentSummary";

const base = {
  transaction: {
    id: "tx1",
    transaction_code: "SD-TEST-1",
    status: "pending_payment",
    money_status: "awaiting_payment",
    created_at: new Date().toISOString(),
  },
  seller: { full_name: "Seller", avatar_url: null },
  item: { title: "Item", description: "d", quantity: 1, condition_label: "New", brand: null, model: null, warranty_terms: null },
  delivery: null,
} as unknown as ReviewData;

const completePricing = {
  currency_code: "NGN",
  item_amount: 50000,
  paystack_fee_amount: 750,
  platform_fee_amount: 1100,
  service_fee_amount: 1850,
  service_fee_rate: 0.037,
  total_amount: 51850,
  seller_payout_amount: 50000,
  is_total_service_fee_capped: false,
  is_floored: false,
  pricing_model_version: "v3",
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/t/tok/pay"]}>
        <Routes>
          <Route path="/t/:shareToken/pay" element={<BuyerPaymentSummary />} />
          <Route path="*" element={<div>redirected</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("BuyerPaymentSummary pricing guard", () => {
  beforeEach(() => {
    reviewMock.mockReset();
    session = SIGNED_IN;
  });

  it("renders a payable screen for a complete snapshot", async () => {
    reviewMock.mockResolvedValue({ ...base, pricing: completePricing });
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByText(/Pay\s/i).length).toBeGreaterThan(0);
    }, { timeout: 5000 });
    expect(screen.queryByText(/can't show the amount/i)).toBeNull();
  });

  it("blocks with an honest error when the snapshot is missing", async () => {
    reviewMock.mockResolvedValue({ ...base, pricing: null });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/can't show the amount/i)).toBeTruthy();
    }, { timeout: 5000 });
    expect(screen.queryByText(/₦0\.00/)).toBeNull();
  });
});

/**
 * The source-scanning guard in guest-pay.contract.test.ts proves no redirect
 * is wired up. This proves the buyer actually gets a page: the item, the
 * amount, and a button that says what pressing it will do.
 */
describe("BuyerPaymentSummary without an account", () => {
  beforeEach(() => {
    reviewMock.mockReset();
    session = null;
  });

  it("shows the item and the amount instead of bouncing to sign-in", async () => {
    reviewMock.mockResolvedValue({ ...base, pricing: completePricing });
    renderPage();

    await waitFor(() => {
      expect(screen.getAllByText(/Sign up to pay/i).length).toBeGreaterThan(0);
    }, { timeout: 5000 });

    // The whole point: they can see what they would be paying for.
    expect(screen.queryByText(/redirected/)).toBeNull();
    expect(screen.getAllByText(/Item/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/51,850/).length).toBeGreaterThan(0);
  });

  it("does not make the terms checkbox gate the sign-up button", async () => {
    reviewMock.mockResolvedValue({ ...base, pricing: completePricing });
    renderPage();

    const button = await waitFor(
      () => screen.getAllByRole("button", { name: /Sign up to pay/i })[0],
      { timeout: 5000 },
    );
    // Agreeing to escrow terms before having an account is the wrong order,
    // so the button that only starts a sign-up must not wait on the tick.
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });
});
