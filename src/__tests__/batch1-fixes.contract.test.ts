import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { computePricing } from "@/lib/pricing";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("B1: completion card links to a real surface", () => {
  const card = read("src/components/seller/SellerConfirmCompletionCard.tsx");
  const app = read("src/App.tsx");

  it("no longer navigates to the non-existent /messages route", () => {
    expect(card).not.toContain("}/messages`");
  });

  it("targets the seller transaction detail route that owns the message thread", () => {
    expect(card).toContain("/seller/transactions/${transactionId}#messages");
    expect(app).toContain('path="/seller/transactions/:transactionId"');
    expect(read("src/pages/SellerTransactionDetail.tsx")).toContain("MessageThread");
  });
});

describe("F5: seller net uses the canonical platform fee", () => {
  const page = read("src/pages/SellerCreateTransaction.tsx");

  it("success screen no longer subtracts the buyer-borne Paystack fee", () => {
    expect(page).not.toContain("pricing.item_amount - pricing.service_fee_amount");
    expect(page).toContain("seller_net_amount: pricing.item_amount - pricing.platform_fee_amount");
  });

  it("canonical seller net equals item_amount - platform_fee_amount for capped and uncapped tiers", () => {
    for (const amount of [5_000, 60_000, 2_000_000]) {
      const p = computePricing(amount, "NGN");
      expect(p.item_amount - p.platform_fee_amount).toBeGreaterThan(
        p.item_amount - p.service_fee_amount,
      );
      expect(p.service_fee_amount - p.platform_fee_amount).toBe(p.paystack_fee_amount);
    }
  });
});

describe("Legal links at signup and checkout", () => {
  const app = read("src/App.tsx");
  const legalPaths = ["/legal/terms", "/legal/privacy"];

  it("both legal routes are registered", () => {
    for (const p of legalPaths) expect(app).toContain(`path="${p}"`);
  });

  it("signup consent checkbox links to the real legal routes", () => {
    const signup = read("src/components/auth/SignupForm.tsx");
    expect(signup).toContain('to="/legal/terms"');
    expect(signup).toContain('to="/legal/privacy"');
    expect(signup).not.toContain('href="/terms"');
    expect(signup).not.toContain('href="/privacy"');
  });

  it("signup blocks submission until consent is given", () => {
    const signup = read("src/components/auth/SignupForm.tsx");
    expect(signup).toContain("data.terms === true");
    expect(signup).toContain("terms_accepted_at");
  });

  it("both checkout surfaces link terms and privacy", () => {
    for (const f of ["src/pages/StorefrontCheckout.tsx", "src/pages/CartCheckoutReview.tsx"]) {
      const src = read(f);
      for (const p of legalPaths) expect(src).toContain(`to="${p}"`);
    }
  });
});
