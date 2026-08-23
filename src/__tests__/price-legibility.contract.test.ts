import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// A file that explains which viewport clamp it replaced must not be charged
// for the explanation. Same rule, same reason as the colour law.
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

/**
 * Price must fit the card, not merely have a box that fits it.
 *
 * Measured in Chromium at a signed-in 360px viewport (a 128px card, ~98px of
 * content box): `₦1,250,000.00` is 114px of glyphs at 16px and `₦12,500,000.00`
 * is 124px. Both were cut off by the card's `overflow-hidden`, and nothing
 * showed it: `index.css` hides horizontal scrollbars app-wide.
 *
 * The trap this guards against is subtle: adding `min-w-0` makes the *element
 * box* fit while the glyphs still overflow it, so a box-based overflow check
 * reports success while the user still sees a chopped price. The fix is a fluid
 * figure that scales down instead, floored at the 12px legibility minimum this
 * repo enforces elsewhere.
 *
 * Rewritten when the two buyer cards became one. The price line now lives in
 * `BuyerProductCard`, and it is sized by the CARD via container query units
 * (`.pcard-price`, cqw in index.css) rather than by the viewport: `3.6vw` was
 * the same card being ~160px in a phone grid and ~300px on a desktop while
 * the clamp only knew the window. This contract therefore checks three
 * things: the single card carries the pcard-price hook and the nowrap and
 * tabular rules; index.css defines pcard-price with a cqw clamp inside the
 * repo's 12px..20px bounds; and no buyer-facing component reintroduces a
 * viewport-sized price.
 */
const CARD = "src/components/product/BuyerProductCard.tsx";
const DELEGATES = [
  "src/components/marketplace/MarketplaceProductCard.tsx",
  "src/components/storefront/ProductCard.tsx",
];

describe("product card price", () => {
  const card = readFileSync(CARD, "utf8");
  const css = readFileSync("src/index.css", "utf8");
  const price = card
    .split("\n")
    .find((l) => /className=/.test(l) && /font-bold/.test(l) && /tabular-nums/.test(l));

  it("the one card carries the container-sized price", () => {
    expect(price, "no price line found in BuyerProductCard: did the markup change?").toBeTruthy();
    expect(price).toMatch(/pcard-price/);
    expect(price).toMatch(/whitespace-nowrap/);
    expect(price).toMatch(/tabular-nums/);
  });

  it("the card establishes the container the price is sized by", () => {
    expect(card).toMatch(/\bpcard\b/);
    expect(css).toMatch(/\.pcard\s*\{[^}]*container-type:\s*inline-size/);
  });

  it("pcard-price clamps in container units within the legibility bounds", () => {
    const clamp = /\.pcard-price\s*\{[^}]*font-size:\s*clamp\((\d*\.?\d+)rem,\s*[\d.]+cqw,\s*(\d*\.?\d+)rem\)/s.exec(
      css,
    );
    expect(clamp, "pcard-price must clamp in cqw: the viewport was never the right ruler").toBeTruthy();
    expect(Number(clamp![1])).toBeGreaterThanOrEqual(0.75);
    expect(Number(clamp![2])).toBeLessThanOrEqual(1.25);
  });

  for (const file of DELEGATES) {
    it(`${file} delegates to the one card and declares no price of its own`, () => {
      const src = readFileSync(file, "utf8");
      expect(src).toContain('from "@/components/product/BuyerProductCard"');
      expect(src, "a second price line is how the two cards drifted apart").not.toMatch(
        /formatMoney|formatPrice/,
      );
    });
  }

  it("no buyer component sizes a price by the viewport again", () => {
    for (const file of [CARD, ...DELEGATES]) {
      const src = stripComments(readFileSync(file, "utf8"));
      expect(src, `${file} uses vw for a font size`).not.toMatch(/clamp\([^)]*vw[^)]*\)/);
    }
  });
});
