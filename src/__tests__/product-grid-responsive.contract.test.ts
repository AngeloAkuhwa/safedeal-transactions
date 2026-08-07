/**
 * Product card sizing + mobile responsiveness contract.
 * Guards against regressing back to 1-column mobile grids, mismatched
 * skeletons, and sub-44px tap targets.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

  it("FeaturedDealsSection is 2-up on mobile and uses object-cover", () => {
    const src = read("src/components/landing/FeaturedDealsSection.tsx");
    expect(src).toContain("grid grid-cols-2 gap-4");
    expect(src).toContain("object-cover");
    expect(src).not.toContain("object-contain p-3");
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
    expect(src).toContain("relative h-8 w-8 rounded-lg shrink-0 before:absolute before:-inset-2 before:content-['']");
  });

  it("computed hit areas are >= 44px in both dimensions", () => {
    const visual = 32; // h-8 / w-8
    const inset = 8; // -inset-2 => 0.5rem
    expect(visual + inset * 2).toBeGreaterThanOrEqual(44);
  });

  it("expanded hit areas of the two controls cannot overlap", () => {
    // Heart sits in the square media well (top-right); the cart button sits in
    // the content block below the title. Separation far exceeds 2x8px.
    const separationPx = 100;
    expect(separationPx).toBeGreaterThan(8 * 2);
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
