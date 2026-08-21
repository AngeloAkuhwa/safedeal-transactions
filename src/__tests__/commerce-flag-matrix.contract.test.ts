/**
 * Commerce flag semantics: 2x2 matrix, split reason keys, catalog registration.
 * Static + behavioural contract; no network, no DB.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SETTINGS_CATALOG } from "@/lib/settings-catalog";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("split reason keys are registered in BOTH catalogs", () => {
  const serverCatalog = read("supabase/functions/_shared/settings-catalog.ts");

  for (const key of ["commerce.cart_disabled_reason", "commerce.checkout_disabled_reason"]) {
    it(`${key} exists in the client catalog with a label and help text`, () => {
      const entry = SETTINGS_CATALOG.find((e) => e.key === key);
      expect(entry, `${key} missing from client catalog`).toBeTruthy();
      expect(entry!.label.length).toBeGreaterThan(3);
      expect(entry!.help.length).toBeGreaterThan(10);
      expect(entry!.spec.type).toBe("text");
    });

    it(`${key} exists in the server catalog mirror`, () => {
      expect(serverCatalog).toContain(`"${key}"`);
    });

    it(`${key} is editable in the admin Platform Settings UI`, () => {
      expect(read("src/pages/AdminSettings.tsx")).toContain(`"${key}"`);
    });
  }

  it("commerce.disabled_reason still acts as a global override for both", () => {
    const gate = read("supabase/functions/_shared/commerce-gate.ts");
    expect(gate).toContain("globalOverride ?? cartSpecific");
    expect(gate).toContain("globalOverride ?? checkoutSpecific");
  });
});

describe("2x2 flag matrix on the product page", () => {
  const page = read("src/pages/PublicProductDetail.tsx");

  it("cart and checkout are gated independently (no conflated blocker)", () => {
    expect(page).not.toContain("gateBlocked");
    expect(page).toContain("const cartAllowed = !gate.loading && gate.addToCartEnabled");
    expect(page).toContain("const checkoutAllowed = !gate.loading && gate.checkoutEnabled");
  });

  it("renders a skeleton while the gate resolves instead of failing open", () => {
    expect(page).toContain('data-testid="commerce-cta-skeleton"');
  });

  it("hides dead controls rather than disabling them", () => {
    expect(page).toContain("{checkoutAllowed && (");
    expect(page).toContain("{cartAllowed && (");
  });

  it("Buy Now reuses the existing storefront direct-purchase route", () => {
    expect(page).toContain("/checkout?qty=${quantity}`");
    expect(page).not.toMatch(/functions\/v1\/[a-z-]*buy-now/);
  });

  it("surfaces the matching reason for the surface that is off", () => {
    expect(page).toContain("gate.checkoutDisabledReason");
    expect(page).toContain("gate.cartDisabledReason");
  });
});

describe("server gate returns surface-specific reasons", () => {
  const gate = read("supabase/functions/_shared/commerce-gate.ts");
  it("add_to_cart_disabled uses the cart reason", () => {
    expect(gate).toContain('error: "add_to_cart_disabled", reason: cfg.cart_disabled_reason');
  });
  it("checkout_disabled uses the checkout reason", () => {
    expect(gate).toContain('error: "checkout_disabled", reason: cfg.checkout_disabled_reason');
  });
  it("both switches still fail closed by default", () => {
    expect(gate).toMatch(/checkout_enabled:\s*false/);
    expect(gate).toMatch(/add_to_cart_enabled:\s*false/);
  });
});

describe("cart page stays reachable and usable when the cart flag is off", () => {
  const cart = read("src/pages/BuyerCart.tsx");
  it("shows a per-combination banner", () => {
    expect(cart).toContain("Cart and checkout are paused");
    expect(cart).toContain("Adding to cart is paused");
    expect(cart).toContain("Checkout is paused");
  });
  it("does not gate the remove control on the cart flag", () => {
    expect(cart).not.toContain("disabled={cartMutationsBlocked} onClick={() => handleRemove");
  });
});
