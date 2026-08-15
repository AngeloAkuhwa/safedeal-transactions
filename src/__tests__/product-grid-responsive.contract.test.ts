/**
 * Product card sizing + mobile responsiveness contract.
 * Guards against regressing back to 1-column mobile grids, mismatched
 * skeletons, and sub-44px tap targets.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { scanSource } from "./helpers/touch-target-scan";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("buyer-facing grids render 2 columns on mobile", () => {
  const cases: Array<[string, string]> = [
    ["src/pages/BuyerMarketplace.tsx", "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"],
    ["src/pages/PublicStorefront.tsx", "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"],
    ["src/pages/BuyerSavedProducts.tsx", "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"],
  ];
  for (const [file, cls] of cases) {
    it(`${file} uses ${cls}`, () => {
      expect(read(file)).toContain(cls);
    });
    it(`${file} has no grid-cols-1 product grid`, () => {
      expect(read(file)).not.toContain("grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4");
    });
  }

  it("the landing page ships no fabricated demo catalogue", () => {
    const sellers = read("src/components/landing/VerifiedSellersSection.tsx");
    const features = read("src/components/landing/PowerfulFeaturesSection.tsx");
    for (const src of [sellers, features]) {
      expect(src).not.toContain("demo-data");
      expect(src).not.toContain("uxpilot");
    }
  });
});

describe("loading skeletons match the real card shape", () => {
  it("marketplace skeleton uses a square media well, not aspect-[3/4]", () => {
    const src = read("src/pages/BuyerMarketplace.tsx");
    expect(src).toContain("aspect-square w-full bg-muted animate-pulse");
    expect(src).not.toContain('className="aspect-[3/4] bg-muted animate-pulse rounded-2xl"');
  });
});

describe("tap targets reach 44px without changing visual size", () => {
  const src = read("src/components/marketplace/MarketplaceProductCard.tsx");

  it("wishlist heart keeps h-8 w-8 visuals and expands the hit area by 8px per side", () => {
    expect(src).toContain("h-8 w-8 items-center justify-center rounded-full");
    expect(src).toContain("before:absolute before:-inset-2 before:content-['']");
  });

  it("cart button keeps h-8 w-8 visuals and expands the hit area by 8px per side", () => {
    expect(src).toContain("relative z-rail h-8 w-8 shrink-0 rounded-lg before:absolute before:-inset-2 before:content-['']");
  });

  it("computed hit areas are >= 44px in both dimensions", () => {
    const violations = scanSource(src, "src/components/marketplace/MarketplaceProductCard.tsx");
    expect(violations.map((v) => `${v.line} ${v.reason}`), JSON.stringify(violations, null, 2)).toEqual([]);
  });

  it("the heart lives in the media well and the cart control in the content block", () => {
    const heart = src.indexOf("before:-inset-2");
    const cart = src.indexOf("relative z-rail h-8 w-8 shrink-0 rounded-lg");
    expect(heart).toBeGreaterThan(-1);
    expect(cart).toBeGreaterThan(heart);
    expect(src.slice(heart, cart)).toContain("</div>");
  });

  it("the cart control is hidden (not disabled) when add-to-cart is off", () => {
    expect(src).toContain("{!gate.loading && !cartBlocked && (");
  });
});

describe("cards stretch to equal height", () => {
  it("storefront ProductCard uses h-full flex flex-col", () => {
    expect(read("src/components/storefront/ProductCard.tsx")).toContain("h-full flex flex-col");
  });
});
